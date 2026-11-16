// User facing auth messages, shared by the auth forms (client) and pages (server).

/** "Try again in N minutes" for a 429 (spec 0001, AC-4 and AC-7). */
export function retryMessage(retryAfterSeconds: number | null): string {
    if (!retryAfterSeconds || retryAfterSeconds <= 0) return 'Too many attempts. Try again in a minute.';
    const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
    return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

export function readRetryAfter(res: Response | undefined): number | null {
    const raw = res?.headers.get('Retry-After') ?? res?.headers.get('X-Retry-After');
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
}

/** Messages for `?error=` codes that Better Auth (or our own pages) redirect back with. */
const ERROR_MESSAGES: Record<string, string> = {
    email_not_verified:
        "Your account with that provider has no verified email, so we can't sign you in with it. Verify the email there, or sign up with email and password.",
    account_not_linked: 'An account with this email already exists. Sign in with your email and password first.',
    unable_to_link_account: "We couldn't connect that account. Try again, or sign in another way.",
    access_denied: 'Sign in was cancelled.',
    state_mismatch: 'That sign in link expired. Please try again.',
    please_restart_the_process: 'That sign in attempt expired. Please try again.',
    internal_server_error: 'Something went wrong on our side. Please try again.',
};

export function authErrorMessage(code: string | null | undefined): string | null {
    if (!code) return null;
    return ERROR_MESSAGES[code.toLowerCase()] ?? "We couldn't sign you in. Please try again.";
}
