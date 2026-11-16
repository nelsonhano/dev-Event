import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The in memory mongod is standalone, so no transactions. Set before lib/auth loads.
vi.hoisted(() => {
    process.env.MONGODB_TRANSACTIONS = 'false';
    process.env.BETTER_AUTH_SECRET = 'test-secret-that-is-long-enough-for-better-auth-0123456789';
    process.env.BETTER_AUTH_URL = 'http://localhost:3000';
});

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/email', () => ({ sendEmail }));

import { auth } from '@/lib/auth';
import { getAuthDb } from '@/lib/mongo-client';
import { backfillEventOwners, NOT_SIGNED_IN_MESSAGE } from '@/scripts/backfill-event-owner';

const ctx = () => auth.$context;

async function signUp(email: string, name = 'Ada Organiser', password = 'correct-horse-battery') {
    const res = await auth.api.signUpEmail({ body: { name, email, password } });
    return res.user;
}

beforeAll(async () => {
    await ctx();
});

beforeEach(() => {
    sendEmail.mockReset().mockResolvedValue(true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
    const db = getAuthDb();
    await Promise.all(['user', 'account', 'session', 'verification', 'rateLimit', 'events'].map((c) => db.collection(c).deleteMany({})));
});

describe('email sign up (spec 0001, AC-1)', () => {
    it('creates an unverified user with a trimmed name and sends one verification email', async () => {
        const user = await signUp('ada@example.com', '  Ada Organiser  ');

        expect(user).toMatchObject({ name: 'Ada Organiser', email: 'ada@example.com', emailVerified: false });
        await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(1));
        expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ template: 'verify-email', to: 'ada@example.com' }));
    });

    it.each([
        ['empty after trimming', '   '],
        ['longer than 100 characters', 'a'.repeat(101)],
    ])('refuses a name that is %s', async (_case, name) => {
        await expect(signUp('bad-name@example.com', name)).rejects.toThrow();
    });

    it('stores the user id as a string that matches the database _id (the id type rule)', async () => {
        const user = await signUp('ids@example.com');
        const stored = await getAuthDb().collection('user').findOne({ email: 'ids@example.com' });

        expect(typeof user.id).toBe('string');
        expect(String(stored!._id)).toBe(user.id);
    });
});

describe('GitHub and Google sign in (spec 0001, AC-2)', () => {
    const validate = auth.options.user!.validateUserInfo! as unknown as (data: unknown) => Promise<unknown>;

    it('refuses a provider identity whose email the provider did not verify', async () => {
        const result = await validate(
            { user: { email: 'x@example.com', emailVerified: false }, source: { method: 'oauth', oauth: { providerId: 'github' }, action: 'create-user' } },
        );
        expect(result).toMatchObject({ error: 'email_not_verified' });
    });

    it('lets a provider verified email through', async () => {
        const result = await validate(
            { user: { email: 'x@example.com', emailVerified: true }, source: { method: 'oauth', oauth: { providerId: 'google' }, action: 'sign-in' } },
        );
        expect(result).toBeUndefined();
    });
});

describe('account takeover before sign up (spec 0001, AC-3)', () => {
    it('removes the password and every session when GitHub links to an unverified account', async () => {
        const user = await signUp('victim@example.com');
        const { internalAdapter } = await ctx();
        await internalAdapter.createSession(user.id);
        expect((await internalAdapter.listSessions(user.id)).length).toBeGreaterThan(0);

        await internalAdapter.linkAccount({ providerId: 'github', accountId: 'gh-123', userId: user.id });

        const accounts = await internalAdapter.findAccounts(user.id);
        expect(accounts.map((a) => a.providerId)).toEqual(['github']);
        expect(await internalAdapter.listSessions(user.id)).toHaveLength(0);
        expect((await internalAdapter.findUserById(user.id))?.emailVerified).toBe(true);
    });

    it('keeps the password of an already verified account when GitHub links', async () => {
        const user = await signUp('owner@example.com');
        const { internalAdapter } = await ctx();
        await internalAdapter.updateUser(user.id, { emailVerified: true });

        await internalAdapter.linkAccount({ providerId: 'google', accountId: 'g-456', userId: user.id });

        const providers = (await internalAdapter.findAccounts(user.id)).map((a) => a.providerId).sort();
        expect(providers).toEqual(['credential', 'google']);
    });
});

describe('forgot password (spec 0001, AC-5)', () => {
    it('emails a reset link to an account with a password', async () => {
        await signUp('pw@example.com');
        sendEmail.mockClear();

        await auth.api.requestPasswordReset({ body: { email: 'pw@example.com', redirectTo: '/reset-password' } });

        await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ template: 'reset-password' })));
    });

    it('sends nothing to an account that only signs in with GitHub or Google, and answers the same', async () => {
        const { internalAdapter } = await ctx();
        // A GitHub only account: sign up, then swap the password login for a GitHub one.
        const user = await signUp('oauth@example.com');
        await internalAdapter.updateUser(user.id, { emailVerified: true });
        await internalAdapter.linkAccount({ providerId: 'github', accountId: 'gh-999', userId: user.id });
        const credential = (await internalAdapter.findAccounts(user.id)).find((a) => a.providerId === 'credential');
        await internalAdapter.deleteAccount(credential!.id);
        sendEmail.mockClear();

        const withAccount = await auth.api.requestPasswordReset({ body: { email: 'oauth@example.com', redirectTo: '/reset-password' } });
        const noAccount = await auth.api.requestPasswordReset({ body: { email: 'nobody@example.com', redirectTo: '/reset-password' } });

        expect(withAccount).toEqual(noAccount);
        // Give the background task a moment, then make sure it chose not to send.
        await new Promise((r) => setTimeout(r, 200));
        expect(sendEmail).not.toHaveBeenCalledWith(expect.objectContaining({ template: 'reset-password' }));
    });
});

describe('backfill:owners (spec 0001, AC-24)', () => {
    it('stops with the sign in message and changes nothing when the super admin never signed in', async () => {
        const db = getAuthDb();
        await db.collection('events').insertOne({ title: 'Old event', organizer: 'Org' });

        const result = await backfillEventOwners(db, 'boss@example.com');

        expect(result).toEqual({ ok: false, message: NOT_SIGNED_IN_MESSAGE });
        expect(await db.collection('events').findOne({ title: 'Old event' })).not.toHaveProperty('organiserId');
    });

    it('gives ownerless events to the super admin, keeps organizer, leaves owned events, and is safe twice', async () => {
        const boss = await signUp('boss@example.com');
        const db = getAuthDb();
        await db.collection('events').insertMany([
            { title: 'Old event', organizer: 'Original Org' },
            { title: 'Owned event', organizer: 'Someone', organiserId: 'someone-else' },
        ]);

        const first = await backfillEventOwners(db, '  BOSS@example.com ');
        const second = await backfillEventOwners(db, 'boss@example.com');

        expect(first).toEqual({ ok: true, ownerId: boss.id, updated: 1 });
        expect(second).toEqual({ ok: true, ownerId: boss.id, updated: 0 });
        expect(await db.collection('events').findOne({ title: 'Old event' })).toMatchObject({ organiserId: boss.id, organizer: 'Original Org' });
        expect(await db.collection('events').findOne({ title: 'Owned event' })).toMatchObject({ organiserId: 'someone-else' });
    });
});
