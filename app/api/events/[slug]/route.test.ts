import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Wrap the real connectDB so one test can simulate a missing MONGODB_URI.
vi.mock('@/lib/mongodb', async (importOriginal) => {
    const real = await importOriginal<typeof import('@/lib/mongodb')>();
    return { default: vi.fn(real.default) };
});

import connectDB from '@/lib/mongodb';
import Event from '@/database/event.model';
import { GET } from './route';
import { clearDatabase, connectTestDB, seedEvent } from '@/test/db';

const get = (slug: string) =>
    GET(new NextRequest(`http://localhost/api/events/${encodeURIComponent(slug)}`), {
        params: Promise.resolve({ slug }),
    });

beforeAll(connectTestDB);
afterEach(clearDatabase);

describe('GET /api/events/[slug]', () => {
    it('returns the event for its slug', async () => {
        await seedEvent();

        const res = await get('react-summit-2026');
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.message).toBe('Event fetched successfully');
        expect(body.event).toMatchObject({ slug: 'react-summit-2026', title: 'React Summit 2026' });
    });

    it('matches regardless of case and surrounding spaces', async () => {
        await seedEvent();

        const res = await get('  React-Summit-2026 ');

        expect(res.status).toBe(200);
        expect((await res.json()).event.slug).toBe('react-summit-2026');
    });

    it('answers 404 naming the slug when no event matches', async () => {
        const res = await get('Missing-Event');

        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ message: "Event with slug 'missing-event' not found" });
    });

    it.each(['', '   '])('answers 400 for a blank slug %j', async (slug) => {
        const res = await get(slug);

        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ message: 'Invalid or missing slug parameter' });
    });

    it('reports a configuration error without leaking details when MONGODB_URI is missing', async () => {
        vi.mocked(connectDB).mockRejectedValueOnce(
            new Error('Please define the MONGODB_URI environment variable inside .env.local'),
        );

        const res = await get('react-summit-2026');

        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({ message: 'Database configuration error' });
    });

    it('answers 500 when the query fails', async () => {
        vi.spyOn(Event, 'findOne').mockImplementationOnce(() => {
            throw new Error('connection reset');
        });

        const res = await get('react-summit-2026');

        expect(res.status).toBe(500);
        expect((await res.json()).message).toBe('Failed to fetch events');
    });
});

describe('GET /api/events/[slug] in production', () => {
    it('hides the internal error message from the response', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.spyOn(Event, 'findOne').mockImplementationOnce(() => {
            throw new Error('E_READ at shard-02.internal:27017');
        });

        const res = await get('react-summit-2026');

        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({ message: 'Failed to fetch events' });
    });
});
