import { updateTag } from 'next/cache';

import Event from '@/database/event.model';
import AuditLog, { type AuditAction } from '@/database/audit-log.model';
import connectDB from '@/lib/mongodb';
import { auth } from '@/lib/auth';
import { canBan, canSetRole, isOwner, type PolicyUser } from '@/lib/auth/policy';
import { EVENTS_TAG } from '@/lib/actions/event.actions';
import { runAfter } from '@/lib/background';
import { sendEmail } from '@/lib/email';

// Moderation (spec 0001, "How admin actions run"): check the rule in the policy, then call the
// admin plugin on the server (auth.api.*, no HTTP request, so the lockout hook lets it through),
// then sync event visibility, write the audit entry, refresh the cache, and queue the email.

export type ActionResult = { ok: true } | { ok: false; message: string };
export type Caller = PolicyUser & { name: string };

export const BAN_REASON_MAX = 500;
const HOUR = 60 * 60 * 1000;
const YEAR = 365 * 24 * HOUR;
// A little slack for the time between picking the date and submitting the form.
const MIN_BAN_SLACK = 2 * 60 * 1000;

const fail = (message: string): ActionResult => ({ ok: false, message });
const appUrl = () => process.env.BETTER_AUTH_URL ?? '';
const errorMessage = (e: unknown) =>
    (e as { body?: { message?: string } })?.body?.message ?? (e instanceof Error ? e.message : 'Unknown error');

async function loadTarget(userId: string): Promise<(PolicyUser & { name: string }) | null> {
    const { internalAdapter } = await auth.$context;
    return (await internalAdapter.findUserById(userId)) as (PolicyUser & { name: string }) | null;
}

type AuditInput = {
    actor: Caller;
    action: AuditAction;
    targetType: 'user' | 'event';
    targetId: string;
    targetLabel: string;
    meta?: Record<string, unknown>;
};

async function writeAudit(entry: AuditInput) {
    await connectDB();
    await AuditLog.create({
        actorId: entry.actor.id,
        actorEmail: entry.actor.email,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        targetLabel: entry.targetLabel,
        meta: entry.meta,
    });
}

/** For bans and event moderation a failed audit write is logged, not fatal (AC-20). */
async function writeAuditSoft(entry: AuditInput) {
    await writeAudit(entry).catch((e) =>
        console.error('Audit log write failed', { action: entry.action, targetId: entry.targetId, error: errorMessage(e) }),
    );
}

/** Mirrors a user's ban on their events, so public reads can hide them (AC-18). */
export async function syncEventVisibility(userId: string, banned: boolean, banExpires: Date | null) {
    await connectDB();
    // A permanent ban (or no ban) has no expiry on the events either.
    const update =
        banned && banExpires
            ? { $set: { ownerBanned: true, ownerBanExpires: banExpires } }
            : { $set: { ownerBanned: banned }, $unset: { ownerBanExpires: 1 } };
    await Event.updateMany({ organiserId: userId }, update);
}

export type BanInput = { userId: string; reason: string; expiresAt?: string | null };

/** Ban, or update an existing ban's reason and expiry (AC-18, AC-20). */
export async function banUserAs(caller: Caller, headers: Headers, input: BanInput, now = Date.now()): Promise<ActionResult> {
    const reason = String(input.reason ?? '').trim();
    if (reason.length < 1 || reason.length > BAN_REASON_MAX) return fail(`Give a reason of 1 to ${BAN_REASON_MAX} characters.`);

    let expires: Date | null = null;
    if (input.expiresAt) {
        expires = new Date(input.expiresAt);
        const ms = expires.getTime() - now;
        if (Number.isNaN(ms)) return fail('That expiry date is not valid.');
        if (ms < HOUR - MIN_BAN_SLACK || ms > YEAR) return fail('The expiry must be at least 1 hour and at most 1 year from now.');
    }

    const target = await loadTarget(input.userId);
    if (!target) return fail('User not found.');
    const allowed = canBan(caller, target);
    if (!allowed.ok) return fail(allowed.message);

    try {
        await auth.api.banUser({
            body: { userId: target.id, banReason: reason, ...(expires ? { banExpiresIn: Math.ceil((expires.getTime() - now) / 1000) } : {}) },
            headers,
        });
    } catch (e) {
        return fail(`The ban didn't go through: ${errorMessage(e)}`);
    }

    // The plugin computes the stored expiry; mirror exactly what it saved.
    const saved = await loadTarget(target.id);
    const savedExpiry = saved?.banExpires ? new Date(saved.banExpires) : null;
    try {
        await syncEventVisibility(target.id, true, savedExpiry);
    } catch (e) {
        console.error('Hiding a banned user\'s events failed', { userId: target.id, error: errorMessage(e) });
        return fail("The user is banned, but hiding their events failed. Try again, or run npm run reconcile:bans.");
    }

    await writeAuditSoft({
        actor: caller,
        action: 'user.ban',
        targetType: 'user',
        targetId: target.id,
        targetLabel: target.email,
        meta: { reason, expiresAt: savedExpiry?.toISOString() ?? null },
    });
    updateTag(EVENTS_TAG);
    runAfter(() =>
        sendEmail({
            template: 'user-banned',
            to: target.email,
            data: { name: target.name, reason, until: savedExpiry ? savedExpiry.toUTCString() : null },
        }),
    );
    return { ok: true };
}

/** Unban and restore their events (AC-18, AC-20). */
export async function unbanUserAs(caller: Caller, headers: Headers, userId: string): Promise<ActionResult> {
    const target = await loadTarget(userId);
    if (!target) return fail('User not found.');
    if (!target.banned) return fail("This user isn't banned.");
    const allowed = canBan(caller, target);
    if (!allowed.ok) return fail(allowed.message);

    try {
        await auth.api.unbanUser({ body: { userId: target.id }, headers });
    } catch (e) {
        return fail(`The unban didn't go through: ${errorMessage(e)}`);
    }

    try {
        await syncEventVisibility(target.id, false, null);
    } catch (e) {
        console.error('Restoring an unbanned user\'s events failed', { userId: target.id, error: errorMessage(e) });
        return fail('The user is unbanned, but restoring their events failed. Try again, or run npm run reconcile:bans.');
    }

    await writeAuditSoft({ actor: caller, action: 'user.unban', targetType: 'user', targetId: target.id, targetLabel: target.email });
    updateTag(EVENTS_TAG);
    runAfter(() => sendEmail({ template: 'user-unbanned', to: target.email, data: { name: target.name } }));
    return { ok: true };
}

/**
 * Promote to admin or demote to user (AC-16, AC-20). The audit entry is required here:
 * if it can't be written, the role is put back and the action fails.
 */
export async function setAdminRoleAs(caller: Caller, headers: Headers, userId: string, makeAdmin: boolean): Promise<ActionResult> {
    const target = await loadTarget(userId);
    if (!target) return fail('User not found.');
    const allowed = canSetRole(caller, target, makeAdmin);
    if (!allowed.ok) return fail(allowed.message);

    const previous = (target.role ?? 'user') as 'user' | 'admin';
    const next = makeAdmin ? 'admin' : 'user';
    try {
        await auth.api.setRole({ body: { userId: target.id, role: next }, headers });
    } catch (e) {
        return fail(`The role change didn't go through: ${errorMessage(e)}`);
    }

    try {
        await writeAudit({
            actor: caller,
            action: makeAdmin ? 'role.grant' : 'role.revoke',
            targetType: 'user',
            targetId: target.id,
            targetLabel: target.email,
            meta: { from: previous, to: next },
        });
    } catch (e) {
        console.error('Audit log write failed, putting the role back', { targetId: target.id, error: errorMessage(e) });
        await auth.api.setRole({ body: { userId: target.id, role: previous }, headers }).catch((err) =>
            console.error('Could not put the role back', { targetId: target.id, error: errorMessage(err) }),
        );
        return fail("The role change couldn't be recorded, so it was undone. Please try again.");
    }

    runAfter(() =>
        makeAdmin
            ? sendEmail({ template: 'role-granted', to: target.email, data: { name: target.name, granter: caller.name, url: `${appUrl()}/admin` } })
            : sendEmail({ template: 'role-revoked', to: target.email, data: { name: target.name, granter: caller.name } }),
    );
    return { ok: true };
}

/**
 * Audit an edit or delete of an event by someone who isn't its owner (AC-20).
 * The super admin acting on their own event is not logged.
 */
export async function auditEventModeration(
    actor: Caller,
    action: 'event.update' | 'event.delete',
    event: { _id: unknown; title: string; organiserId?: string | null },
    meta?: Record<string, unknown>,
) {
    if (isOwner(actor, event)) return;
    await writeAuditSoft({ actor, action, targetType: 'event', targetId: String(event._id), targetLabel: event.title, meta });
}
