'use server';

import { headers } from 'next/headers';

import { getSession } from '@/lib/auth/guards';
import { banUserAs, setAdminRoleAs, unbanUserAs, type ActionResult, type BanInput, type Caller } from '@/lib/admin/moderation';

// The only way in for moderation (spec 0001, AC-21). A server action is a public
// endpoint, so each one loads the caller from the session; the policy checks live in
// lib/admin/moderation.ts and lib/auth/policy.ts.

async function caller(): Promise<{ user: Caller; headers: Headers } | null> {
    const requestHeaders = await headers();
    const session = await getSession(requestHeaders);
    if (!session) return null;
    return { user: session.user as Caller, headers: requestHeaders };
}

const signedOut: ActionResult = { ok: false, message: 'Sign in again to continue.' };

export async function banUser(input: BanInput): Promise<ActionResult> {
    const c = await caller();
    return c ? banUserAs(c.user, c.headers, input) : signedOut;
}

export async function unbanUser(userId: string): Promise<ActionResult> {
    const c = await caller();
    return c ? unbanUserAs(c.user, c.headers, userId) : signedOut;
}

export async function setAdminRole(userId: string, makeAdmin: boolean): Promise<ActionResult> {
    const c = await caller();
    return c ? setAdminRoleAs(c.user, c.headers, userId, makeAdmin) : signedOut;
}
