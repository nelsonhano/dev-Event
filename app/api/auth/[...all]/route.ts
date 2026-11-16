import { toNextJsHandler } from 'better-auth/next-js';

import { auth, ensureAuthIndexes } from '@/lib/auth';

const handlers = toNextJsHandler(auth);

// Better Auth's 429 carries only `X-Retry-After`; AC-7 asks for the standard header too.
async function withRetryAfter(res: Response): Promise<Response> {
    if (res.status !== 429 || res.headers.has('Retry-After')) return res;
    const retryAfter = res.headers.get('X-Retry-After');
    if (!retryAfter) return res;
    const headers = new Headers(res.headers);
    headers.set('Retry-After', retryAfter);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

// The one_superadmin index is built here, outside any auth transaction (see
// ensureAuthIndexes). After the first success it is a cached, already settled promise.
export async function GET(req: Request) {
    await ensureAuthIndexes();
    return withRetryAfter(await handlers.GET(req));
}

export async function POST(req: Request) {
    await ensureAuthIndexes();
    return withRetryAfter(await handlers.POST(req));
}
