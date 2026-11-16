import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';

// The real connection is the boundary here; each test loads a fresh copy of the module.
const fakeConnection = { fake: true } as unknown as typeof mongoose;

async function loadConnectDB(uri: string) {
    vi.stubEnv('MONGODB_URI', uri);
    vi.resetModules();
    return (await import('./mongodb')).default;
}

beforeEach(() => {
    globalThis.mongoose = undefined;
});

afterEach(() => {
    globalThis.mongoose = undefined;
});

describe('connectDB', () => {
    it('explains what to set when MONGODB_URI is missing, and does not try to connect', async () => {
        const connect = vi.spyOn(mongoose, 'connect');
        const connectDB = await loadConnectDB('');

        await expect(connectDB()).rejects.toThrow('Please define the MONGODB_URI environment variable');
        expect(connect).not.toHaveBeenCalled();
    });

    it('connects with command buffering off, then reuses the connection', async () => {
        const connect = vi.spyOn(mongoose, 'connect').mockResolvedValue(fakeConnection);
        const connectDB = await loadConnectDB('mongodb://db.test/app');

        const first = await connectDB();
        const second = await connectDB();

        expect(first).toBe(fakeConnection);
        expect(second).toBe(fakeConnection);
        expect(connect).toHaveBeenCalledTimes(1);
        expect(connect).toHaveBeenCalledWith('mongodb://db.test/app', { bufferCommands: false });
    });

    it('shares one connection attempt between concurrent callers', async () => {
        const connect = vi.spyOn(mongoose, 'connect').mockResolvedValue(fakeConnection);
        const connectDB = await loadConnectDB('mongodb://db.test/app');

        const results = await Promise.all([connectDB(), connectDB(), connectDB()]);

        expect(results).toEqual([fakeConnection, fakeConnection, fakeConnection]);
        expect(connect).toHaveBeenCalledTimes(1);
    });

    it('retries on the next call after a failed connection', async () => {
        const connect = vi.spyOn(mongoose, 'connect')
            .mockRejectedValueOnce(new Error('ECONNREFUSED'))
            .mockResolvedValueOnce(fakeConnection);
        const connectDB = await loadConnectDB('mongodb://db.test/app');

        await expect(connectDB()).rejects.toThrow('ECONNREFUSED');
        await expect(connectDB()).resolves.toBe(fakeConnection);
        expect(connect).toHaveBeenCalledTimes(2);
    });

    it('keeps the connection across module reloads, as happens on hot reload in dev', async () => {
        const connect = vi.spyOn(mongoose, 'connect').mockResolvedValue(fakeConnection);
        await (await loadConnectDB('mongodb://db.test/app'))();

        const reloaded = await loadConnectDB('mongodb://db.test/app');
        await reloaded();

        expect(connect).toHaveBeenCalledTimes(1);
    });
});
