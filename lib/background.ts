import { after } from 'next/server';

/**
 * Runs work after the response is sent (spec 0001: verification, reset, and
 * attendee emails go through `after()`), so the response time never depends on
 * the email and the platform keeps the work alive after responding.
 * Outside a request (scripts, tests) it just runs the work detached.
 */
export function runAfter(task: () => Promise<unknown>): void {
    const run = () =>
        task().catch((e) => console.error('Background task failed', e instanceof Error ? e.message : e));
    try {
        after(run);
    } catch {
        void run();
    }
}
