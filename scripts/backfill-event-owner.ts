// Gives every event made before organiser accounts existed an owner: the super admin
// (spec 0001, AC-24). Run with `npm run backfill:owners`. Safe to run twice.
// Self contained (only the mongodb driver), so Node can run it directly.
import { MongoClient, type Db } from 'mongodb';
import dns from 'node:dns';

try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
    // Ignore in sandboxed/restricted environments
}

export const NOT_SIGNED_IN_MESSAGE = 'Sign in once as SUPER_ADMIN_EMAIL, then run this again';

export type BackfillResult =
    | { ok: true; ownerId: string; updated: number }
    | { ok: false; message: string };

export async function backfillEventOwners(db: Db, superAdminEmail: string | undefined): Promise<BackfillResult> {
    const email = superAdminEmail?.trim().toLowerCase();
    if (!email) return { ok: false, message: 'SUPER_ADMIN_EMAIL is not set' };

    const user = await db.collection('user').findOne({ email }, { projection: { _id: 1 } });
    if (!user) return { ok: false, message: NOT_SIGNED_IN_MESSAGE };

    // The same string form Better Auth returns as session.user.id.
    const ownerId = String(user._id);
    const { modifiedCount } = await db.collection('events').updateMany(
        { $or: [{ organiserId: { $exists: false } }, { organiserId: null }, { organiserId: '' }] },
        { $set: { organiserId: ownerId } },
    );
    // `organizer` (the display name) is left exactly as it was.
    return { ok: true, ownerId, updated: modifiedCount };
}

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGODB_URI is not set');
        process.exit(1);
    }
    const client = new MongoClient(uri, { maxPoolSize: 1 });
    try {
        const result = await backfillEventOwners(client.db(), process.env.SUPER_ADMIN_EMAIL);
        if (!result.ok) {
            console.error(result.message);
            process.exitCode = 1;
            return;
        }
        console.log(`Set the owner on ${result.updated} event(s) to user ${result.ownerId}.`);
    } finally {
        await client.close();
    }
}

if (import.meta.main) {
    void main();
}
