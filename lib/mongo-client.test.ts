import { afterAll, describe, expect, it } from 'vitest';
import { authClient, authDb, getMongoClient } from '@/lib/mongo-client';

// When the driver's first connect fails (cluster unreachable, IP not on the Atlas
// access list, slow cold start), it closes the client for good and every later
// operation throws "Topology is closed". The cached client must be replaced, and the
// handles Better Auth holds must follow the replacement.
describe('mongo client recovery', () => {
    const realUri = process.env.MONGODB_URI!;

    afterAll(async () => {
        await globalThis.mongoClient?.close();
        globalThis.mongoClient = undefined;
    });

    it('recovers after the first connect fails, through the handles Better Auth holds', async () => {
        globalThis.mongoClient = undefined;
        process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/unreachable?serverSelectionTimeoutMS=300';
        const broken = getMongoClient();

        await expect(authDb.collection('user').findOne({})).rejects.toThrow();

        // The cluster becomes reachable again.
        process.env.MONGODB_URI = realUri;

        await expect(authDb.collection('user').insertOne({ email: 'back@example.com' })).resolves.toBeTruthy();
        expect(await authDb.collection('user').findOne({ email: 'back@example.com' })).toMatchObject({ email: 'back@example.com' });
        expect(getMongoClient()).not.toBe(broken);

        const session = authClient.startSession();
        await session.endSession();
    });

    it('keeps reusing one healthy client', async () => {
        await authDb.collection('user').findOne({});
        const first = getMongoClient();
        await authDb.collection('user').findOne({});
        expect(getMongoClient()).toBe(first);
    });
});
