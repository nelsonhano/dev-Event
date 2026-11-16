// Reapplies every user's ban state to their events (spec 0001, Key invariants).
// Run with `npm run reconcile:bans` after a ban or unban reported that hiding or
// restoring events failed. Safe to run any time, and safe to run twice.
// Self contained (only the mongodb driver), so Node can run it directly.
import { MongoClient, type Db } from 'mongodb';
import dns from 'node:dns';

try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
    // Ignore in sandboxed/restricted environments
}

export async function reconcileBans(db: Db, now = new Date()): Promise<{ users: number; events: number }> {
    const users = db.collection('user');
    const events = db.collection('events');
    let changedEvents = 0;
    let userCount = 0;

    for await (const user of users.find({}, { projection: { _id: 1, banned: 1, banExpires: 1 } })) {
        userCount++;
        const active = Boolean(user.banned) && (!user.banExpires || new Date(user.banExpires) > now);
        const expires = active && user.banExpires ? new Date(user.banExpires) : null;
        const update = expires
            ? { $set: { ownerBanned: true, ownerBanExpires: expires } }
            : { $set: { ownerBanned: active }, $unset: { ownerBanExpires: '' } };
        const { modifiedCount } = await events.updateMany({ organiserId: String(user._id) }, update);
        changedEvents += modifiedCount;
    }
    return { users: userCount, events: changedEvents };
}

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGODB_URI is not set');
        process.exit(1);
    }
    const client = new MongoClient(uri, { maxPoolSize: 1 });
    try {
        const { users, events } = await reconcileBans(client.db());
        console.log(`Checked ${users} user(s); updated ${events} event(s).`);
    } finally {
        await client.close();
    }
}

if (import.meta.main) {
    void main();
}
