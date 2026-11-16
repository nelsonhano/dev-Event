import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The shared test mongod is standalone, so every other auth test runs with transactions
// off. Atlas runs them on, and both bugs below only showed up there. This file starts its
// own single node replica set and drives the real Next route handler.
const replSet = await vi.hoisted(async () => {
    const { MongoMemoryReplSet } = await import('mongodb-memory-server');
    const rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    process.env.MONGODB_URI = rs.getUri('devevents_tx');
    process.env.MONGODB_TRANSACTIONS = 'true';
    process.env.BETTER_AUTH_SECRET = 'test-secret-that-is-long-enough-for-better-auth-0123456789';
    process.env.BETTER_AUTH_URL = 'http://localhost:3000';
    process.env.SUPER_ADMIN_EMAIL = 'boss@example.com';
    return rs;
});

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/email', () => ({ sendEmail }));

import { GET, POST } from '@/app/api/auth/[...all]/route';
import { getAuthDb, getMongoClient } from '@/lib/mongo-client';

const ORIGIN = 'http://localhost:3000';
let ip = 0;

const signUp = (email: string) =>
    POST(
        new Request(`${ORIGIN}/api/auth/sign-up/email`, {
            method: 'POST',
            headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-forwarded-for': `10.1.0.${++ip}` },
            body: JSON.stringify({ name: email.split('@')[0], email, password: 'correct-horse-battery' }),
        }),
    );

const cookieOf = (res: Response) => res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');

/** The verification link handed to the (mocked) mailer for this address. */
async function verificationUrl(email: string): Promise<string> {
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ template: 'verify-email', to: email })));
    const call = sendEmail.mock.calls.find(([opts]) => opts.template === 'verify-email' && opts.to === email);
    return call![0].data.url as string;
}

const storedUser = (email: string) => getAuthDb().collection('user').findOne({ email });

beforeEach(() => {
    vi.stubEnv('SUPER_ADMIN_EMAIL', 'boss@example.com');
    sendEmail.mockReset().mockResolvedValue(true);
});

afterAll(async () => {
    await getMongoClient().close();
    globalThis.mongoClient = undefined;
    await replSet.stop();
});

describe('auth with transactions on (Atlas)', () => {
    // Must run first: it needs a database where the auth collections and the
    // one_superadmin index don't exist yet.
    it('first sign up on a brand new database succeeds', async () => {
        const res = await signUp('first@example.com');

        expect(res.status).toBe(200);
        expect(await storedUser('first@example.com')).toMatchObject({ email: 'first@example.com', role: 'user' });
        const indexes = await getAuthDb().collection('user').indexes();
        expect(indexes.map((i) => i.name)).toContain('one_superadmin');
    });

    it('makes SUPER_ADMIN_EMAIL superadmin when they verify in the browser they signed up in (AC-15)', async () => {
        const signUpRes = await signUp('boss@example.com');
        expect(signUpRes.status).toBe(200);
        // Signed in straight away, but not verified yet, so not super admin.
        expect((await storedUser('boss@example.com'))?.role).toBe('user');

        // Opening the link with the sign up session still present creates no new session.
        const verifyRes = await GET(new Request(await verificationUrl('boss@example.com'), { headers: { cookie: cookieOf(signUpRes) } }));
        expect(verifyRes.status).toBeLessThan(400);

        expect(await storedUser('boss@example.com')).toMatchObject({ emailVerified: true, role: 'superadmin' });
    });

    it('leaves anyone else as user after verifying', async () => {
        const signUpRes = await signUp('someone@example.com');
        await GET(new Request(await verificationUrl('someone@example.com'), { headers: { cookie: cookieOf(signUpRes) } }));

        expect(await storedUser('someone@example.com')).toMatchObject({ emailVerified: true, role: 'user' });
    });
});
