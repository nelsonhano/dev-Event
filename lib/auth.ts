import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { nextCookies } from 'better-auth/next-js';
import { admin } from 'better-auth/plugins';
import { createAuthMiddleware, APIError } from 'better-auth/api';

import { getAuthDb, getMongoClient } from '@/lib/mongo-client';
import { sendEmail } from '@/lib/email';
import { runAfter } from '@/lib/background';
import { ac, roles } from '@/lib/auth/permissions';
import { encodeBanNotice } from '@/lib/auth/ban-notice';

// Organiser identity, sessions, roles, and bans (spec 0001). Privileged rules live in
// lib/auth/policy.ts and the server actions; the admin plugin's HTTP endpoints are locked.

const SOCIAL_PROVIDERS = ['github', 'google'] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export const NAME_MIN = 1;
export const NAME_MAX = 100;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

/** Social providers whose credentials are set, so the UI shows only working buttons. */
export function configuredProviders(): SocialProvider[] {
    return SOCIAL_PROVIDERS.filter((p) => {
        const key = p.toUpperCase();
        return Boolean(process.env[`${key}_CLIENT_ID`] && process.env[`${key}_CLIENT_SECRET`]);
    });
}

function socialProviders(): BetterAuthOptions['socialProviders'] {
    const providers: NonNullable<BetterAuthOptions['socialProviders']> = {};
    const enabled = configuredProviders();
    if (enabled.includes('github')) {
        providers.github = {
            clientId: process.env.GITHUB_CLIENT_ID!,
            clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        };
    }
    if (enabled.includes('google')) {
        providers.google = {
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        };
    }
    return providers;
}

// Transactions need a replica set (Atlas has one). A standalone mongod, like the
// in memory test server, doesn't, so they can be switched off with an env var.
const useTransactions = process.env.MONGODB_TRANSACTIONS !== 'false';

const superAdminEmail = () => process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() || null;

// At most one stored superadmin (spec 0001, data model). Built once per server instance,
// before Better Auth handles a request (app/api/auth/[...all]/route.ts). Never build it
// from a database hook: hooks run inside the sign up transaction, and an index build on
// a collection that transaction just wrote to makes the first sign up on a new database
// fail with 500 ("Cannot call abortTransaction after calling commitTransaction").
let superAdminIndex: Promise<unknown> | null = null;
export function ensureAuthIndexes() {
    superAdminIndex ??= getAuthDb()
        .collection('user')
        .createIndex({ role: 1 }, { unique: true, partialFilterExpression: { role: 'superadmin' }, name: 'one_superadmin' })
        .catch((e) => {
            superAdminIndex = null;
            console.error('Could not create the one_superadmin index', e instanceof Error ? e.message : e);
        });
    return superAdminIndex;
}

// The parts of Better Auth's context the role sync needs. A hook's own context is
// passed when there is one, so writes join the hook's transaction.
type RoleSyncContext = {
    internalAdapter: {
        findUserById(id: string): Promise<unknown>;
        updateUser(id: string, data: Record<string, unknown>): Promise<unknown>;
    };
    adapter: {
        updateMany(args: {
            model: string;
            where: { field: string; value: string; operator?: 'ne' }[];
            update: Record<string, unknown>;
        }): Promise<unknown>;
    };
};

/**
 * Brings the stored role in line with SUPER_ADMIN_EMAIL (AC-15): demotes any other
 * superadmin first, then promotes the matching verified user. Runs at every sign in and
 * after email verification. Power never depends on this: policy.isSuperAdmin reads the
 * env var on every check, but Better Auth's own admin calls check the stored role.
 */
async function syncSuperAdminRole(context: RoleSyncContext, userId: string) {
    const user = (await context.internalAdapter.findUserById(userId)) as
        | { id: string; email: string; emailVerified: boolean; role?: string | null }
        | null;
    if (!user) return;

    const target = superAdminEmail();
    const isTheSuperAdmin = Boolean(target && user.emailVerified && user.email.toLowerCase() === target);
    if (isTheSuperAdmin) {
        await context.adapter.updateMany({
            model: 'user',
            where: [
                { field: 'role', value: 'superadmin' },
                { field: 'id', operator: 'ne', value: user.id },
            ],
            update: { role: 'user' },
        });
        if (user.role !== 'superadmin') await context.internalAdapter.updateUser(user.id, { role: 'superadmin' });
    } else if (user.role === 'superadmin') {
        await context.internalAdapter.updateUser(user.id, { role: 'user' });
    }
}

export const auth = betterAuth({
    database: mongodbAdapter(getAuthDb(), {
        client: useTransactions ? getMongoClient() : undefined,
        transaction: useTransactions,
    }),
    trustedOrigins: process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : [],

    emailAndPassword: {
        enabled: true,
        // Unverified organisers can sign in; publishing is gated instead (AC-4).
        requireEmailVerification: false,
        autoSignIn: true,
        minPasswordLength: PASSWORD_MIN,
        maxPasswordLength: PASSWORD_MAX,
        resetPasswordTokenExpiresIn: HOUR,
        revokeSessionsOnPasswordReset: true,
        sendResetPassword: async ({ user, url }) => {
            runAfter(async () => {
                // Better Auth would create a password for a GitHub or Google only account
                // on reset, so those accounts get no email at all (AC-5).
                const ctx = await auth.$context;
                const accounts = await ctx.internalAdapter.findAccounts(user.id);
                if (!accounts.some((a) => a.providerId === 'credential')) return;
                await sendEmail({ template: 'reset-password', to: user.email, data: { name: user.name, url } });
            });
        },
    },

    emailVerification: {
        sendOnSignUp: true,
        autoSignInAfterVerification: true,
        expiresIn: DAY,
        sendVerificationEmail: async ({ user, url }) => {
            runAfter(() => sendEmail({ template: 'verify-email', to: user.email, data: { name: user.name, url } }));
        },
        // Verifying in the browser that signed up keeps the existing session, so the
        // session hook never sees the now verified user. Sync the role here too (AC-15),
        // or the super admin can't promote or ban until they sign in again.
        afterEmailVerification: async (user) => {
            await syncSuperAdminRole(await auth.$context, user.id);
        },
    },

    socialProviders: socialProviders(),

    account: {
        accountLinking: {
            enabled: true,
            // Trusting a provider skips its own verified email check, so validateUserInfo
            // below refuses any OAuth identity whose email the provider didn't verify (AC-2).
            trustedProviders: [...SOCIAL_PROVIDERS],
            // Link to an existing unverified account too; the account create hook then
            // removes the password set before verification (AC-3).
            requireLocalEmailVerified: false,
        },
    },

    user: {
        validateUserInfo: async ({ user, source }) => {
            if (source.method === 'oauth' && user.emailVerified !== true) {
                return {
                    error: 'email_not_verified',
                    errorDescription: 'Your account with this provider has no verified email. Verify it there, or sign up with email.',
                };
            }
            if (source.method === 'email-password' && source.action === 'create-user') {
                const name = typeof user.name === 'string' ? user.name.trim() : '';
                if (name.length < NAME_MIN || name.length > NAME_MAX) {
                    return { error: 'invalid_name', errorDescription: `Name must be ${NAME_MIN} to ${NAME_MAX} characters.` };
                }
            }
        },
    },

    databaseHooks: {
        user: {
            create: {
                before: async (user) => {
                    // Store the trimmed name. A long OAuth display name is cut to fit instead of
                    // refusing the sign in; email sign ups were already checked above.
                    const name = (user.name ?? '').trim().slice(0, NAME_MAX) || user.email.split('@')[0];
                    return { data: { ...user, name } };
                },
            },
        },
        session: {
            create: {
                // Bring the stored role in line with SUPER_ADMIN_EMAIL at every sign in (AC-15):
                // demote any other superadmin first, then promote the matching verified user.
                // Power never depends on this: policy.isSuperAdmin reads the env var on every check.
                before: async (session, ctx) => {
                    await syncSuperAdminRole(ctx?.context ?? (await auth.$context), session.userId);
                },
            },
        },
        account: {
            create: {
                // Account takeover before sign up (AC-3, Security model): when GitHub or Google
                // links to a user whose email was never verified, the password on that user may
                // belong to someone else. Delete it and end every session before marking the
                // email verified. Better Auth runs this before it creates the new session.
                after: async (account, ctx) => {
                    if (!SOCIAL_PROVIDERS.includes(account.providerId as SocialProvider)) return;
                    const internal = (ctx?.context ?? (await auth.$context)).internalAdapter;
                    const user = await internal.findUserById(account.userId);
                    if (!user || user.emailVerified) return;

                    const accounts = await internal.findAccounts(user.id);
                    for (const a of accounts) {
                        if (a.providerId === 'credential') await internal.deleteAccount(a.id);
                    }
                    await internal.deleteUserSessions(user.id);
                    await internal.updateUser(user.id, { emailVerified: true });
                },
            },
        },
    },

    session: {
        expiresIn: 7 * DAY,
        updateAge: DAY,
        // Off, so role and ban changes apply on the very next request (AC-6).
        cookieCache: { enabled: false },
    },

    rateLimit: {
        // On in every environment, not only production (Better Auth's default).
        enabled: true,
        storage: 'database',
        window: 60,
        max: 60,
        customRules: {
            '/sign-in/*': { window: 60, max: 5 },
            '/sign-up/*': { window: 60, max: 5 },
            '/request-password-reset': { window: HOUR, max: 3 },
            '/send-verification-email': { window: HOUR, max: 3 },
        },
    },

    onAPIError: {
        // OAuth failures (refused unverified email, cancelled consent) land here with ?error=.
        errorURL: '/sign-in',
    },

    advanced: {
        ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
    },

    // Every Better Auth admin endpoint is refused over HTTP (AC-21). Our server actions
    // call auth.api.* on the server, which carries no Request, so they pass. Nothing else here.
    hooks: {
        before: createAuthMiddleware(async (ctx) => {
            if (ctx.path.startsWith('/admin/') && ctx.request) {
                throw new APIError('FORBIDDEN', { message: 'Not available', code: 'ADMIN_HTTP_DISABLED' });
            }
        }),
    },

    plugins: [
        admin({
            ac,
            roles,
            defaultRole: 'user',
            adminRoles: ['admin', 'superadmin'],
            // Carries the reason and expiry to /sign-in?error=banned as a signed token (AC-18).
            bannedUserMessage: (user) => encodeBanNotice(user as { banReason?: string | null; banExpires?: Date | null }),
        }),
        // Must be last, so server actions can set the session cookie.
        nextCookies(),
    ],
});

export type Session = typeof auth.$Infer.Session;
