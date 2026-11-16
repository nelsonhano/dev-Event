import { MongoClient, type Db } from 'mongodb';
import dns from 'node:dns';

// Fix for Windows / c-ares EBADRESP on SRV lookups with local router DNS
try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
    // Ignore in sandboxed/restricted environments
}

// A native MongoClient for Better Auth's MongoDB adapter, separate from the
// mongoose connection in lib/mongodb.ts (spec 0001, Slice 1 step 1).
// Created once per server instance and cached on globalThis, so warm serverless
// invocations and dev hot reloads reuse it instead of opening new pools.

declare global {
    var mongoClient: MongoClient | undefined;
}

const options = {
    // Serverless: every function instance has its own pool, and auth calls are short
    // (one or two queries each), so a small ceiling keeps Atlas connection counts low.
    maxPoolSize: 5,
    // Don't hold idle connections open between invocations.
    minPoolSize: 0,
    // Release idle connections after 30 s so frozen instances don't pin server memory.
    maxIdleTimeMS: 30_000,
    // Fail fast instead of hanging a sign in request when the cluster is unreachable.
    serverSelectionTimeoutMS: 5_000,
    connectTimeoutMS: 10_000,
    // Make sure a stuck socket is always closed eventually.
    socketTimeoutMS: 30_000,
};

// Used only when MONGODB_URI is missing (for example `next build` without env vars),
// so importing the auth config never crashes. Any real query then fails fast.
const MISSING_URI_PLACEHOLDER = 'mongodb://missing-mongodb-uri.invalid:27017/devevents';

export function getMongoClient(): MongoClient {
    if (!globalThis.mongoClient) {
        const uri = process.env.MONGODB_URI;
        if (!uri) console.error('MONGODB_URI is not set. Define it in .env.local; auth requests will fail until you do.');
        // The driver connects lazily on the first operation, so importing this costs nothing.
        const client = new MongoClient(uri || MISSING_URI_PLACEHOLDER, options);
        // A failed first connect closes the client for good: every later operation throws
        // "Topology is closed". Forget it so the next call builds a fresh one.
        client.once('topologyClosed', () => {
            if (globalThis.mongoClient === client) globalThis.mongoClient = undefined;
        });
        globalThis.mongoClient = client;
    }
    return globalThis.mongoClient;
}

/** The app database (the one named in MONGODB_URI, same as mongoose uses). */
export function getAuthDb(): Db {
    return getMongoClient().db();
}

// Better Auth is handed its db and client once, at module load. These handles resolve
// the current client on every call, so auth keeps working after a closed client is replaced.
// The adapter only uses `db.collection()` and `client.startSession()`.
function liveHandle<T extends object>(current: () => T): T {
    return new Proxy({} as T, {
        get(_target, prop) {
            const target = current();
            const value = Reflect.get(target, prop, target);
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
}

export const authDb: Db = liveHandle(getAuthDb);
export const authClient: MongoClient = liveHandle(getMongoClient);
