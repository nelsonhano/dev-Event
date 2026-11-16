import '@testing-library/jest-dom/vitest';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { afterAll, afterEach, inject, vi } from 'vitest';

// A database per test file, so files running in parallel never see each other's data.
// Set before any app module loads, because lib/mongodb.ts reads MONGODB_URI at import time.
const base = inject('mongoUri').replace(/\/?$/, '/');
process.env.MONGODB_URI = `${base}devevents_${randomUUID().slice(0, 8)}`;

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
});

// Component tests (files marked `// @vitest-environment jsdom`) unmount between tests.
if (typeof document !== 'undefined') {
    const { cleanup } = await import('@testing-library/react');
    afterEach(cleanup);
}

// next/image needs the Next image loader; in tests a plain <img> shows the same src and alt.
vi.mock('next/image', async () => {
    const { createElement } = await import('react');
    return {
        default: ({ src, alt, width, height, className }: Record<string, unknown>) =>
            createElement('img', { src, alt, width, height, className }),
    };
});

afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
        await mongoose.connection.dropDatabase();
    }
    await mongoose.disconnect();
    // lib/mongodb.ts caches the connection on globalThis; clear it so the next file connects fresh.
    globalThis.mongoose = undefined;
});
