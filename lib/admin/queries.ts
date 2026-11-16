import type { Filter, Document } from 'mongodb';

import Event from '@/database/event.model';
import AuditLog from '@/database/audit-log.model';
import connectDB from '@/lib/mongodb';
import { getAuthDb } from '@/lib/mongo-client';
import { clampPage } from '@/lib/events/paging';
import type { Paged } from '@/lib/events/dashboard';

// Admin console reads (spec 0001, AC-16, AC-17, AC-20). Per request, not cached.
// Users live in Better Auth's `user` collection, read with the native driver.

export const USERS_PAGE_SIZE = 20;
export const AUDIT_PAGE_SIZE = 50;

export type AdminUserRow = {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    role: string;
    createdAt: string;
    /** Computed at read time: a ban whose expiry passed shows as active (AC-17). */
    banStatus: 'active' | 'banned';
    banReason: string | null;
    banExpires: string | null;
    eventCount: number;
};

/** Escapes regex special characters so a search is a plain substring match (AC-17). */
export const escapeRegex = (q: string) => q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const searchFilter = (q: string | null): Filter<Document> => {
    const term = q?.trim();
    if (!term) return {};
    const re = new RegExp(escapeRegex(term), 'i');
    return { $or: [{ email: re }, { name: re }] };
};

const effectivelyBanned = (u: Document, now: Date) => Boolean(u.banned) && (!u.banExpires || new Date(u.banExpires) > now);

function toRow(u: Document, eventCount: number, now: Date): AdminUserRow {
    const banned = effectivelyBanned(u, now);
    return {
        id: String(u._id),
        name: String(u.name ?? ''),
        email: String(u.email ?? ''),
        emailVerified: Boolean(u.emailVerified),
        role: String(u.role ?? 'user'),
        createdAt: new Date(u.createdAt ?? 0).toISOString(),
        banStatus: banned ? 'banned' : 'active',
        banReason: banned ? (u.banReason ?? null) : null,
        banExpires: banned && u.banExpires ? new Date(u.banExpires).toISOString() : null,
        eventCount,
    };
}

async function eventCounts(userIds: string[]) {
    if (userIds.length === 0) return new Map<string, number>();
    await connectDB();
    const counts = await Event.aggregate<{ _id: string; count: number }>([
        { $match: { organiserId: { $in: userIds } } },
        { $group: { _id: '$organiserId', count: { $sum: 1 } } },
    ]);
    return new Map(counts.map((c) => [c._id, c.count]));
}

/** Users by email or name, newest sign up first, 20 per page (AC-17). */
export async function listUsers(q: string | null, rawPage: string | null): Promise<Paged<AdminUserRow>> {
    const users = getAuthDb().collection('user');
    const filter = searchFilter(q);
    const total = await users.countDocuments(filter);
    const { page, totalPages, skip } = clampPage(rawPage, total, USERS_PAGE_SIZE);
    const docs = await users.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(USERS_PAGE_SIZE).toArray();
    const counts = await eventCounts(docs.map((d) => String(d._id)));
    const now = new Date();
    return { items: docs.map((d) => toRow(d, counts.get(String(d._id)) ?? 0, now)), page, totalPages, total };
}

/** Current admins, for the super admin's roles page (AC-16). */
export async function listAdmins(): Promise<AdminUserRow[]> {
    const docs = await getAuthDb().collection('user').find({ role: 'admin' }).sort({ email: 1 }).toArray();
    const counts = await eventCounts(docs.map((d) => String(d._id)));
    const now = new Date();
    return docs.map((d) => toRow(d, counts.get(String(d._id)) ?? 0, now));
}

/** Verified, unbanned organisers matching the search, who could be promoted (AC-16). */
export async function searchPromotable(q: string | null): Promise<AdminUserRow[]> {
    if (!q?.trim()) return [];
    const now = new Date();
    const docs = await getAuthDb()
        .collection('user')
        .find({
            ...searchFilter(q),
            emailVerified: true,
            role: { $nin: ['admin', 'superadmin'] },
            $and: [{ $or: [{ banned: { $ne: true } }, { banExpires: { $lte: now } }] }],
        })
        .sort({ createdAt: -1 })
        .limit(USERS_PAGE_SIZE)
        .toArray();
    return docs.map((d) => toRow(d, 0, now));
}

export type AuditRow = {
    id: string;
    actorEmail: string;
    action: string;
    targetType: string;
    targetLabel: string;
    meta: Record<string, unknown> | null;
    createdAt: string;
};

/** Audit entries, newest first, 50 per page (AC-20). */
export async function listAudit(rawPage: string | null): Promise<Paged<AuditRow>> {
    await connectDB();
    const total = await AuditLog.countDocuments();
    const { page, totalPages, skip } = clampPage(rawPage, total, AUDIT_PAGE_SIZE);
    const rows = await AuditLog.find().sort({ createdAt: -1, _id: -1 }).skip(skip).limit(AUDIT_PAGE_SIZE).lean<
        { _id: unknown; actorEmail: string; action: string; targetType: string; targetLabel: string; meta?: Record<string, unknown>; createdAt: Date }[]
    >();
    return {
        items: rows.map((r) => ({
            id: String(r._id),
            actorEmail: r.actorEmail,
            action: r.action,
            targetType: r.targetType,
            targetLabel: r.targetLabel,
            meta: r.meta ?? null,
            createdAt: r.createdAt.toISOString(),
        })),
        page,
        totalPages,
        total,
    };
}
