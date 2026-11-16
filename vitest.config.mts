import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: { '@': import.meta.dirname },
    },
    test: {
        // Server code by default; component tests opt in with `// @vitest-environment jsdom`.
        environment: 'node',
        globalSetup: ['./test/global-setup.ts'],
        setupFiles: ['./test/setup.ts'],
        // The first run downloads the MongoDB binary, which can take a while.
        hookTimeout: 180_000,
        testTimeout: 20_000,
    },
});
