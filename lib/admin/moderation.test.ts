import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
    process.env.MONGODB_TRANSACTIONS = 'false';
    process.env.BETTER_AUTH_SECRET = 'test-secret-that-is-long-enough-for-better-auth-0123456789';
    process.env.BETTER_AUTH_URL = 'http://localhost:3000';
    process.env.SUPER_ADMIN_EMAIL = 'boss@example.com';
});

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/email', () => ({ sendEmail }));
vi.mock('@/lib/background', () => ({ runAfter: (task: () => Promise<unknown>) => { void task(); } }));
vi.mock('next/cache', () => ({ updateTag: vi.fn(), revalidateTag: vi.fn(), cacheLife: vi.fn(), cacheTag: vi.fn() }));

import { updateTag } from 'next/cache';
import { auth } from '@/lib/auth';
import { getAuthDb } from '@/lib/mongo-client';
import Event from '@/database/event.model';
import AuditLog from '@/database/audit-log.model';
import { getAllEvents } from '@/lib/actions/event.actions';
import { banUserAs, setAdminRoleAs, unbanUserAs, type Caller } from './moderation';
import { reconcileBans } from '@/scripts/reconcile-bans';
import { clearDatabase, connectTestDB, seedEvent } from '@/test/db';

const PASSWORD = 'correct-horse-battery';
const HOUR = 60 * 60 * 1000;

type Actor = { caller: Caller; headers: Headers; id: string };

async function person(email: string, { role, verified = true }: { role?: 'admin'; verified?: boolean } = {}): Promise<Actor> {
    const { user } = await auth.api.signUpEmail({ body: { name: email.split('@')[0], email, password: PASSWORD } });
    const { internalAdapter } = await auth.$context;
    await internalAdapter.updateUser(user.id, { emailVerified: verified, ...(role ? { role } : {}) });
    const res = await auth.api.signInEmail({ body: { email, password: PASSWORD }, asResponse: true });
    const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    const caller = (await internalAdapter.findUserById(user.id)) as unknown as Caller;
    return { caller, headers: new Headers({ cookie }), id: user.id };
}

const stored = (email: string) => getAuthDb().collection('user').findOne({ email });

beforeAll(async () => {
    await connectTestDB();
    await auth.$context;
});
beforeEach(() => {
    vi.stubEnv('SUPER_ADMIN_EMAIL', 'boss@example.com');
    sendEmail.mockReset().mockResolvedValue(true);
    vi.mocked(updateTag).mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
    await clearDatabase();
    const db = getAuthDb();
    await Promise.all(['user', 'account', 'session', 'verification', 'rateLimit'].map((c) => db.collection(c).deleteMany({})));
});

describe('banUserAs (spec 0001, AC-18, AC-20)', () => {
    it('bans, hides their events, revokes their sessions, logs it, refreshes the cache, and emails them', async () => {
        const mod = await person('mod@example.com', { role: 'admin' });
        const spammer = await person('spam@example.com');
        await seedEvent({ title: 'Spam Event', organiserId: spammer.id });
        await seedEvent({ title: 'Good Event', organiserId: mod.id });

        const result = await banUserAs(mod.caller, mod.headers, { userId: spammer.id, reason: 'Posting spam' });

        expect(result).toEqual({ ok: true });
        expect((await stored('spam@example.com'))?.banned).toBe(true);
        expect(await (await auth.$context).internalAdapter.listSessions(spammer.id)).toHaveLength(0);
        expect((await (await auth.$context).internalAdapter.listSessions(mod.id)).length).toBeGreaterThan(0);
        expect((await getAllEvents()).map((e) => e.title)).toEqual(['Good Event']);
        expect(await AuditLog.findOne({ action: 'user.ban' }).lean()).toMatchObject({ actorEmail: 'mod@example.com', targetLabel: 'spam@example.com', meta: { reason: 'Posting spam', expiresAt: null } });
        expect(updateTag).toHaveBeenCalledWith('events');
        expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ template: 'user-banned', to: 'spam@example.com', data: expect.objectContaining({ until: null }) }));
    });

    it('stores an expiry, and the events come back on their own once it passes (AC-19)', async () => {
        const boss = await person('boss@example.com');
        const spammer = await person('spam@example.com');
        await seedEvent({ organiserId: spammer.id });
        const expiresAt = new Date(Date.now() + 2 * HOUR).toISOString();

        expect(await banUserAs(boss.caller, boss.headers, { userId: spammer.id, reason: 'x', expiresAt })).toEqual({ ok: true });
        const event = await Event.findOne().lean<{ ownerBanned: boolean; ownerBanExpires: Date }>();
        expect(event?.ownerBanned).toBe(true);
        expect(Math.abs(new Date(event!.ownerBanExpires).getTime() - Date.parse(expiresAt))).toBeLessThan(2000);
        expect(await getAllEvents()).toHaveLength(0);

        await Event.updateMany({}, { $set: { ownerBanExpires: new Date(Date.now() - 1000) } });
        expect(await getAllEvents()).toHaveLength(1);
    });

    it.each([
        ['an empty reason', { reason: '   ' }],
        ['a reason over 500 characters', { reason: 'x'.repeat(501) }],
        ['an expiry under 1 hour', { reason: 'x', expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() }],
        ['an expiry over 1 year', { reason: 'x', expiresAt: new Date(Date.now() + 400 * 24 * HOUR).toISOString() }],
    ])('refuses %s', async (_case, input) => {
        const boss = await person('boss@example.com');
        const spammer = await person('spam@example.com');
        const result = await banUserAs(boss.caller, boss.headers, { userId: spammer.id, ...input });
        expect(result.ok).toBe(false);
        expect((await stored('spam@example.com'))?.banned ?? false).toBe(false);
    });

    it('stops an admin banning another admin, anyone banning the super admin, and banning yourself', async () => {
        const boss = await person('boss@example.com');
        const mod = await person('mod@example.com', { role: 'admin' });
        const mod2 = await person('mod2@example.com', { role: 'admin' });

        expect((await banUserAs(mod.caller, mod.headers, { userId: mod2.id, reason: 'x' })).ok).toBe(false);
        expect((await banUserAs(mod.caller, mod.headers, { userId: boss.id, reason: 'x' })).ok).toBe(false);
        expect((await banUserAs(boss.caller, boss.headers, { userId: boss.id, reason: 'x' })).ok).toBe(false);
        expect((await banUserAs(boss.caller, boss.headers, { userId: mod2.id, reason: 'x' })).ok).toBe(true);
    });

    it('updates the reason and expiry when banning someone already banned, with a new audit entry', async () => {
        const boss = await person('boss@example.com');
        const spammer = await person('spam@example.com');
        await banUserAs(boss.caller, boss.headers, { userId: spammer.id, reason: 'first', expiresAt: new Date(Date.now() + 2 * HOUR).toISOString() });
        await banUserAs(boss.caller, boss.headers, { userId: spammer.id, reason: 'second' });

        const user = await stored('spam@example.com');
        expect(user).toMatchObject({ banned: true, banReason: 'second' });
        expect(user?.banExpires ?? null).toBeNull();
        expect(await AuditLog.countDocuments({ action: 'user.ban' })).toBe(2);
    });

    it('reports a retryable error when hiding events fails, and still succeeds when only the audit write fails', async () => {
        const boss = await person('boss@example.com');
        const spammer = await person('spam@example.com');

        vi.spyOn(Event, 'updateMany').mockRejectedValueOnce(new Error('db down'));
        const failed = await banUserAs(boss.caller, boss.headers, { userId: spammer.id, reason: 'x' });
        expect(failed.ok).toBe(false);
        expect(failed.ok === false && failed.message).toMatch(/reconcile:bans/);

        vi.spyOn(AuditLog, 'create').mockRejectedValueOnce(new Error('audit down'));
        expect(await banUserAs(boss.caller, boss.headers, { userId: spammer.id, reason: 'x' })).toEqual({ ok: true });
    });
});

describe('unbanUserAs (spec 0001, AC-18)', () => {
    it('unbans, restores their events, logs it, and emails them', async () => {
        const mod = await person('mod@example.com', { role: 'admin' });
        const spammer = await person('spam@example.com');
        await seedEvent({ organiserId: spammer.id });
        await banUserAs(mod.caller, mod.headers, { userId: spammer.id, reason: 'x' });
        sendEmail.mockClear();

        expect(await unbanUserAs(mod.caller, mod.headers, spammer.id)).toEqual({ ok: true });
        expect((await stored('spam@example.com'))?.banned).toBe(false);
        expect(await getAllEvents()).toHaveLength(1);
        expect(await AuditLog.countDocuments({ action: 'user.unban' })).toBe(1);
        expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ template: 'user-unbanned' }));
    });

    it('answers "not banned" for someone who isn\'t', async () => {
        const mod = await person('mod@example.com', { role: 'admin' });
        const user = await person('ok@example.com');
        expect((await unbanUserAs(mod.caller, mod.headers, user.id)).ok).toBe(false);
    });
});

describe('setAdminRoleAs (spec 0001, AC-16, AC-20)', () => {
    it('promotes a verified user, logs it, and emails them naming who granted it', async () => {
        const boss = await person('boss@example.com');
        const ada = await person('ada@example.com');

        expect(await setAdminRoleAs(boss.caller, boss.headers, ada.id, true)).toEqual({ ok: true });
        expect((await stored('ada@example.com'))?.role).toBe('admin');
        expect(await AuditLog.findOne({ action: 'role.grant' }).lean()).toMatchObject({ targetLabel: 'ada@example.com', meta: { from: 'user', to: 'admin' } });
        expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ template: 'role-granted', data: expect.objectContaining({ granter: 'boss', url: 'http://localhost:3000/admin' }) }));
    });

    it('answers 400 with no email and no audit entry for a no op, an unverified user, or a banned user', async () => {
        const boss = await person('boss@example.com');
        const mod = await person('mod@example.com', { role: 'admin' });
        const plain = await person('plain@example.com');
        const unverified = await person('new@example.com', { verified: false });
        const banned = await person('bad@example.com');
        await banUserAs(boss.caller, boss.headers, { userId: banned.id, reason: 'x' });
        sendEmail.mockClear();
        const auditBefore = await AuditLog.countDocuments();

        expect((await setAdminRoleAs(boss.caller, boss.headers, mod.id, true)).ok).toBe(false);
        expect((await setAdminRoleAs(boss.caller, boss.headers, plain.id, false)).ok).toBe(false);
        expect((await setAdminRoleAs(boss.caller, boss.headers, unverified.id, true)).ok).toBe(false);
        expect((await setAdminRoleAs(boss.caller, boss.headers, banned.id, true)).ok).toBe(false);

        expect(sendEmail).not.toHaveBeenCalled();
        expect(await AuditLog.countDocuments()).toBe(auditBefore);
    });

    it('lets only the super admin change roles, never their own', async () => {
        const boss = await person('boss@example.com');
        const mod = await person('mod@example.com', { role: 'admin' });
        const ada = await person('ada@example.com');

        expect((await setAdminRoleAs(mod.caller, mod.headers, ada.id, true)).ok).toBe(false);
        expect((await setAdminRoleAs(boss.caller, boss.headers, boss.id, false)).ok).toBe(false);
        expect((await stored('ada@example.com'))?.role).toBe('user');
    });

    it('puts the role back and fails when the audit entry can\'t be written', async () => {
        const boss = await person('boss@example.com');
        const ada = await person('ada@example.com');
        vi.spyOn(AuditLog, 'create').mockRejectedValueOnce(new Error('audit down'));

        const result = await setAdminRoleAs(boss.caller, boss.headers, ada.id, true);

        expect(result.ok).toBe(false);
        expect((await stored('ada@example.com'))?.role).toBe('user');
        expect(sendEmail).not.toHaveBeenCalledWith(expect.objectContaining({ template: 'role-granted' }));
    });

    it('takes super admin power away the moment SUPER_ADMIN_EMAIL changes, before any role fix (AC-15)', async () => {
        const boss = await person('boss@example.com');
        const ada = await person('ada@example.com');
        vi.stubEnv('SUPER_ADMIN_EMAIL', 'someone-else@example.com');

        expect((await setAdminRoleAs(boss.caller, boss.headers, ada.id, true)).ok).toBe(false);
    });
});

describe('reconcile:bans (spec 0001, Key invariants)', () => {
    it('reapplies every user\'s ban state to their events, and is safe twice', async () => {
        const boss = await person('boss@example.com');
        const spammer = await person('spam@example.com');
        await seedEvent({ title: 'Spam', organiserId: spammer.id });
        await seedEvent({ title: 'Wrongly hidden', organiserId: boss.id, ownerBanned: true });
        await getAuthDb().collection('user').updateOne({ email: 'spam@example.com' }, { $set: { banned: true } });

        await reconcileBans(getAuthDb());
        const second = await reconcileBans(getAuthDb());

        expect((await getAllEvents()).map((e) => e.title)).toEqual(['Wrongly hidden']);
        expect(second.events).toBe(0);
    });
});
