import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('posthog-js', () => ({ default: { init: vi.fn() } }));

import posthog from 'posthog-js';

async function loadWithKey(key: string) {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', key);
    vi.resetModules();
    await import('./instrumentation-client');
}

beforeEach(() => {
    vi.mocked(posthog.init).mockClear();
});

describe('instrumentation-client', () => {
    it('starts PostHog through the /ingest proxy when a key is set', async () => {
        await loadWithKey('phc_test_key');

        expect(posthog.init).toHaveBeenCalledTimes(1);
        expect(posthog.init).toHaveBeenCalledWith(
            'phc_test_key',
            expect.objectContaining({ api_host: '/ingest', capture_exceptions: true, debug: false }),
        );
    });

    it('stays off when no key is configured', async () => {
        await loadWithKey('');

        expect(posthog.init).not.toHaveBeenCalled();
    });
});
