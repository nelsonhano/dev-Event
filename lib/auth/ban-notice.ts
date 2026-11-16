import { createHmac, timingSafeEqual } from 'node:crypto';

// The ban reason and expiry travel from the admin plugin's error to /sign-in?error=banned
// (spec 0001, AC-18) inside a short lived token signed with BETTER_AUTH_SECRET.
// So the page never looks a user up by email, and a hand made URL can't put fake
// text on our sign in page: an unsigned or stale token shows only a generic notice.

const MAX_AGE_MS = 60 * 60 * 1000;

export type BanNotice = { reason: string; expiresAt: string | null };

const secret = () => process.env.BETTER_AUTH_SECRET ?? '';
const sign = (payload: string) => createHmac('sha256', secret()).update(`ban-notice:${payload}`).digest('base64url');

export function encodeBanNotice(user: { banReason?: string | null; banExpires?: Date | string | null }, now = Date.now()): string {
    const payload = Buffer.from(
        JSON.stringify({
            r: user.banReason ?? '',
            e: user.banExpires ? new Date(user.banExpires).toISOString() : null,
            t: now,
        }),
    ).toString('base64url');
    return `${payload}.${sign(payload)}`;
}

export function decodeBanNotice(token: string | null | undefined, now = Date.now()): BanNotice | null {
    if (!token || !secret()) return null;
    const [payload, mac] = token.split('.');
    if (!payload || !mac) return null;
    const expected = Buffer.from(sign(payload));
    const given = Buffer.from(mac);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    try {
        const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { r: string; e: string | null; t: number };
        if (typeof data.t !== 'number' || now - data.t > MAX_AGE_MS) return null;
        return { reason: String(data.r ?? ''), expiresAt: data.e ?? null };
    } catch {
        return null;
    }
}
