import { MongoMemoryServer } from 'mongodb-memory-server';
import type { TestProject } from 'vitest/node';

// One throwaway MongoDB for the whole run. Each test file gets its own database on it (see setup.ts).
let server: MongoMemoryServer | undefined;

export async function setup(project: TestProject) {
    // A cold mongod start on Windows (antivirus scanning the binary) can exceed the 10 s default.
    server = await MongoMemoryServer.create({ instance: { launchTimeout: 120_000 } });
    project.provide('mongoUri', server.getUri());
}

export async function teardown() {
    await server?.stop();
}

declare module 'vitest' {
    export interface ProvidedContext {
        mongoUri: string;
    }
}
