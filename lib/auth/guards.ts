import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { NextResponse } from 'next/server';

import { auth, type Session } from '@/lib/auth';
import { safeCallback } from '@/lib/auth/safe-callback';
import { isAdmin, isSuperAdmin } from '@/lib/auth/policy';

// The real access checks (spec 0001, Security model, Guards). proxy.ts only does a
// cheap cookie redirect; every page, route handler, and server action checks here.

export type { Session };

export async function getSession(requestHeaders?: Headers): Promise<Session | null> {
    return auth.api.getSession({ headers: requestHeaders ?? (await headers()) });
}

/** Pages: the signed in session, or a redirect to /sign-in that comes back here afterwards. */
export async function requireSession(returnTo: string): Promise<Session> {
    const session = await getSession();
    if (!session) redirect(`/sign-in?callbackURL=${encodeURIComponent(safeCallback(returnTo))}`);
    return session;
}

/**
 * Admin pages: signed out goes to /sign-in; signed in without the role gets a 404, so the
 * console's existence isn't advertised (AC-23). Admin means stored role admin (unbanned) or super admin.
 */
export async function requireRole(level: 'admin' | 'superadmin', returnTo: string): Promise<Session> {
    const session = await requireSession(returnTo);
    const allowed = level === 'superadmin' ? isSuperAdmin(session.user) : isAdmin(session.user);
    if (!allowed) notFound();
    return session;
}

type Guarded = { ok: true; session: Session } | { ok: false; response: NextResponse };

const deny = (status: number, message: string, code?: string) =>
    ({ ok: false, response: NextResponse.json({ message, ...(code && { code }) }, { status }) }) as const;

/** Route handlers: 401 without a session. Reads only headers, never the body. */
export async function requireApiSession(req: Request): Promise<Guarded> {
    const session = await getSession(req.headers);
    if (!session) return deny(401, 'Sign in to continue', 'UNAUTHORIZED');
    return { ok: true, session };
}

/** Route handlers: 403 EMAIL_NOT_VERIFIED for a signed in organiser who hasn't confirmed their email (AC-4). */
export function requireVerified(session: Session): Guarded {
    if (!session.user.emailVerified) {
        return deny(403, 'Confirm your email to publish events', 'EMAIL_NOT_VERIFIED');
    }
    return { ok: true, session };
}

/**
 * Route handlers that change data: the request must come from this app's own origin
 * (spec 0001, Security model, Request forgery). Better Auth checks its own routes,
 * and Next checks server actions, so this covers the event routes.
 */
export function checkOrigin(req: Request): NextResponse | null {
    const allowed = process.env.BETTER_AUTH_URL ? new URL(process.env.BETTER_AUTH_URL).origin : null;
    const origin = req.headers.get('origin');
    if (!allowed || origin !== allowed) {
        return NextResponse.json({ message: 'Cross origin request refused', code: 'BAD_ORIGIN' }, { status: 403 });
    }
    return null;
}
