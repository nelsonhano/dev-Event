export const DEFAULT_CALLBACK = '/dashboard';

/**
 * Returns `callbackURL` only when it is a relative path starting with exactly one `/`
 * (spec 0001, AC-23). Anything else, including `//evil.example` and `/\evil.example`,
 * falls back to the dashboard so the parameter can't be used as an open redirect.
 */
export function safeCallback(raw: string | null | undefined, fallback = DEFAULT_CALLBACK): string {
    if (typeof raw !== 'string' || raw.length === 0) return fallback;
    if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
    // Control characters (tabs, newlines) can be stripped by browsers into `//`.
    if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback;
    return raw;
}
