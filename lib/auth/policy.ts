// Who may do what (spec 0001, Security model, Policy). Used by route handlers,
// pages, and (Slice 3) server actions; every caller loads the user from the session first.
// canBan and canSetRole arrive with roles in Slice 3.

export type PolicyUser = {
    id: string;
    email: string;
    emailVerified: boolean;
    /** Set by the admin plugin (Slice 3); absent until then. */
    role?: string | null;
    banned?: boolean | null;
    banExpires?: Date | string | null;
};

export type OwnedEvent = { organiserId?: string | null };

const superAdminEmail = () => process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() || null;

/**
 * Decided on every check, never trusted from storage (AC-15): the user is super admin
 * exactly when their email equals SUPER_ADMIN_EMAIL and is verified.
 */
export function isSuperAdmin(user: PolicyUser | null | undefined): boolean {
    const email = superAdminEmail();
    return Boolean(user && email && user.emailVerified && user.email.trim().toLowerCase() === email);
}

/** A ban counts only while it hasn't expired (spec 0001, State transitions). */
export function isEffectivelyBanned(user: PolicyUser, now = new Date()): boolean {
    if (!user.banned) return false;
    if (!user.banExpires) return true;
    return new Date(user.banExpires).getTime() > now.getTime();
}

/** Stored role `admin` and not banned, or the super admin. */
export function isAdmin(user: PolicyUser | null | undefined): boolean {
    if (!user) return false;
    if (isSuperAdmin(user)) return true;
    return user.role === 'admin' && !isEffectivelyBanned(user);
}

export const isOwner = (user: PolicyUser, event: OwnedEvent) =>
    Boolean(event.organiserId) && event.organiserId === user.id;

/** Edit (AC-11): a verified owner, or the super admin. Admins can't edit other people's events. */
export function canEditEvent(user: PolicyUser, event: OwnedEvent): boolean {
    return isSuperAdmin(user) || (isOwner(user, event) && user.emailVerified);
}

/** Delete (AC-4, AC-13): the owner, verified or not, or the super admin. */
export function canDeleteEvent(user: PolicyUser, event: OwnedEvent): boolean {
    return isSuperAdmin(user) || isOwner(user, event);
}

/** Bookings page and CSV (AC-14): the owner, any admin, and the super admin. */
export function canViewBookings(user: PolicyUser, event: OwnedEvent): boolean {
    return isOwner(user, event) || isAdmin(user);
}

export type Denied = { ok: false; status: 400 | 403; message: string };
export type Allowed = { ok: true };

const deny = (status: 400 | 403, message: string): Denied => ({ ok: false, status, message });

/**
 * Ban or unban (AC-18): admins only ban role `user`; the super admin bans anyone
 * except themselves; nobody bans the super admin.
 */
export function canBan(caller: PolicyUser, target: PolicyUser): Allowed | Denied {
    if (!isAdmin(caller)) return deny(403, "You can't moderate users");
    if (caller.id === target.id) return deny(403, "You can't ban yourself");
    if (isSuperAdmin(target)) return deny(403, "The super admin can't be banned");
    if (!isSuperAdmin(caller) && (target.role ?? 'user') !== 'user') return deny(403, 'Admins can only ban organisers, not other admins');
    return { ok: true };
}

/**
 * Promote to admin or demote to user (AC-16): only the super admin, never on themselves,
 * promote only verified and unbanned users, and never a no op.
 */
export function canSetRole(caller: PolicyUser, target: PolicyUser, makeAdmin: boolean): Allowed | Denied {
    if (!isSuperAdmin(caller)) return deny(403, 'Only the super admin can change roles');
    if (caller.id === target.id || isSuperAdmin(target)) return deny(403, "The super admin's role can't be changed");
    const role = target.role ?? 'user';
    if (makeAdmin) {
        if (role === 'admin') return deny(400, 'This user is already an admin');
        if (!target.emailVerified) return deny(400, "This user hasn't confirmed their email");
        if (isEffectivelyBanned(target)) return deny(400, 'This user is banned');
    } else if (role !== 'admin') {
        return deny(400, "This user isn't an admin");
    }
    return { ok: true };
}
