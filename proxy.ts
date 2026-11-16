import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

// Next 16's middleware. Only a cheap cookie presence check (spec 0001, Guards):
// it saves a round trip for signed out visitors, but it is not a security check.
// The real checks run in every page, route handler, and server action (lib/auth/guards.ts).
export function proxy(req: NextRequest) {
    if (getSessionCookie(req)) return NextResponse.next();

    const { pathname, search } = req.nextUrl;
    const signIn = new URL('/sign-in', req.url);
    signIn.searchParams.set('callbackURL', `${pathname}${search}`);
    return NextResponse.redirect(signIn);
}

export const config = {
    matcher: ['/dashboard/:path*', '/events/create', '/admin/:path*'],
};
