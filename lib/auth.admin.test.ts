import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
    process.env.MONGODB_TRANSACTIONS = 'false';
    process.env.BETTER_AUTH_SECRET = 'test-secret-that-is-long-enough-for-better-auth-0123456789';
    process.env.BETTER_AUTH_URL = 'http://localhost:3000';
    process.env.SUPER_ADMIN_EMAIL = 'boss@example.com';
});

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/email', () => ({ sendEmail }));

import { auth, ensureAuthIndexes } from '@/lib/auth';
import { decodeBanNotice } from '@/lib/auth/ban-notice';
import { getAuthDb } from '@/lib/mongo-client';

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct-horse-battery';

/** Signs up, marks verified, signs in; returns the user id and request headers carrying the session cookie. */
async function signedIn(email: string) {
    const { user } = await auth.api.signUpEmail({ body: { name: email.split('@')[0], email, password: PASSWORD } });
    const { internalAdapter } = await auth.$context;
    await internalAdapter.updateUser(user.id, { emailVerified: true });
    const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
    const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    return { id: user.id, headers: new Headers({ cookie, origin: ORIGIN }) };
}

const storedRole = async (email: string) => (await getAuthDb().collection('user').findOne({ email }))?.role;

/** A real HTTP call through the Next handler path, with a Request attached. */
const http = (path: string, headers: Headers, body: unknown) =>
    auth.handler(
        new Request(`${ORIGIN}/api/auth${path}`, {
            method: 'POST',
            headers: { cookie: headers.get('cookie') ?? '', origin: ORIGIN, 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.1' },
            body: JSON.stringify(body),
        }),
    );

beforeAll(async () => {
    await auth.$context;
    // The auth route builds this before handling requests; these tests call auth.api directly.
    await ensureAuthIndexes();
});

beforeEach(() => {
    vi.stubEnv('SUPER_ADMIN_EMAIL', 'boss@example.com');
    sendEmail.mockReset().mockResolvedValue(true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
    const db = getAuthDb();
    await Promise.all(['user', 'account', 'session', 'verification', 'rateLimit'].map((c) => db.collection(c).deleteMany({})));
});

describe('super admin role sync (spec 0001, AC-15)', () => {
    it('sets the stored role to superadmin when SUPER_ADMIN_EMAIL signs in verified', async () => {
        await signedIn('boss@example.com');
        expect(await storedRole('boss@example.com')).toBe('superadmin');
    });

    it('moves the role to the new person when the env var changes, demoting the old one first', async () => {
        await signedIn('boss@example.com');
        vi.stubEnv('SUPER_ADMIN_EMAIL', 'next@example.com');
        await signedIn('next@example.com');

        expect(await storedRole('next@example.com')).toBe('superadmin');
        expect(await storedRole('boss@example.com')).toBe('user');
    });

    it('allows at most one stored superadmin (unique partial index)', async () => {
        await signedIn('boss@example.com');
        const users = getAuthDb().collection('user');
        await users.insertOne({ email: 'x@example.com', name: 'x', emailVerified: true, role: 'user', createdAt: new Date(), updatedAt: new Date() });
        await expect(users.updateOne({ email: 'x@example.com' }, { $set: { role: 'superadmin' } })).rejects.toThrow(/duplicate key/);
    });
});

describe('admin HTTP lockout (spec 0001, AC-21)', () => {
    it('lets a server side auth.api.banUser through for the super admin', async () => {
        const boss = await signedIn('boss@example.com');
        const victim = await signedIn('victim@example.com');

        await auth.api.banUser({ body: { userId: victim.id, banReason: 'spam' }, headers: boss.headers });

        expect((await getAuthDb().collection('user').findOne({ email: 'victim@example.com' }))?.banned).toBe(true);
    });

    it.each(['/admin/ban-user', '/admin/set-role', '/admin/impersonate-user', '/admin/create-user', '/admin/revoke-user-sessions'])(
        'refuses %s over HTTP with 403, even for the super admin',
        async (path) => {
            const boss = await signedIn('boss@example.com');
            const victim = await signedIn('victim@example.com');

            const res = await http(path, boss.headers, { userId: victim.id, role: 'superadmin', banReason: 'x', email: 'n@x.com', password: 'p'.repeat(10), name: 'n' });

            expect(res.status).toBe(403);
            const user = await getAuthDb().collection('user').findOne({ email: 'victim@example.com' });
            expect(user?.banned ?? false).toBe(false);
            expect(user?.role).toBe('user');
        },
    );
});

describe('banned sign in (spec 0001, AC-18, AC-19)', () => {
    it('refuses sign in with a signed notice carrying the reason and expiry', async () => {
        const boss = await signedIn('boss@example.com');
        const victim = await signedIn('victim@example.com');
        await auth.api.banUser({ body: { userId: victim.id, banReason: 'Posting spam', banExpiresIn: 2 * 60 * 60 }, headers: boss.headers });

        const err = await auth.api.signInEmail({ body: { email: 'victim@example.com', password: PASSWORD } }).catch((e) => e);

        expect(err?.body?.code).toBe('BANNED_USER');
        const notice = decodeBanNotice(err.body.message);
        expect(notice?.reason).toBe('Posting spam');
        expect(new Date(notice!.expiresAt!).getTime()).toBeGreaterThan(Date.now() + 60 * 60 * 1000);
    });

    it('lets the user sign in again once the ban has expired', async () => {
        const boss = await signedIn('boss@example.com');
        const victim = await signedIn('victim@example.com');
        await auth.api.banUser({ body: { userId: victim.id, banReason: 'x' }, headers: boss.headers });
        await getAuthDb().collection('user').updateOne({ email: 'victim@example.com' }, { $set: { banExpires: new Date(Date.now() - 1000) } });

        const res = await auth.api.signInEmail({ body: { email: 'victim@example.com', password: PASSWORD } });

        expect(res.user.email).toBe('victim@example.com');
    });
});

describe('ban notice token', () => {
    it('rejects a tampered or stale token', async () => {
        const { encodeBanNotice } = await import('@/lib/auth/ban-notice');
        const token = encodeBanNotice({ banReason: 'spam', banExpires: null });
        expect(decodeBanNotice(token)).toEqual({ reason: 'spam', expiresAt: null });
        expect(decodeBanNotice(token.replace(/^./, 'x'))).toBeNull();
        expect(decodeBanNotice(token, Date.now() + 2 * 60 * 60 * 1000)).toBeNull();
        expect(decodeBanNotice('not-a-token')).toBeNull();
    });
});
