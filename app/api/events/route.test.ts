import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { upload_stream, destroy } = vi.hoisted(() => ({ upload_stream: vi.fn(), destroy: vi.fn() }));
vi.mock('cloudinary', () => ({ v2: { uploader: { upload_stream, destroy } } }));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), cacheLife: vi.fn(), cacheTag: vi.fn(), updateTag: vi.fn() }));

// The route asks Better Auth for the session; tests choose who is signed in.
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));

import { revalidateTag } from 'next/cache';
import Event from '@/database/event.model';
import { GET, POST } from './route';
import EventQuota from '@/database/event-quota.model';
import { clearDatabase, connectTestDB, eventInput, seedEvent, TEST_ORGANISER_ID } from '@/test/db';

const APP_ORIGIN = 'http://localhost:3000';
const sessionFor = (overrides: { id?: string; emailVerified?: boolean } = {}) => ({
    session: { id: 'sess_1', userId: overrides.id ?? TEST_ORGANISER_ID },
    user: { id: TEST_ORGANISER_ID, name: 'Ada Organiser', email: 'ada@example.com', emailVerified: true, ...overrides },
});

const UPLOADED = { public_id: 'DevEvent/abc123', secure_url: 'https://res.cloudinary.com/demo/abc123.png' };
const pngFile = (bytes = 8) => new File([new Uint8Array(bytes)], 'cover.png', { type: 'image/png' });

type FormOptions = {
    origin?: string | null;
    fields?: Record<string, string | undefined>;
    image?: File | null;
    tags?: string | null;
    agenda?: string | null;
};

/** A multipart request that passes validation unless a test overrides part of it. */
function createRequest({ origin = APP_ORIGIN, fields = {}, image = pngFile(), tags, agenda }: FormOptions = {}) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { image: _image, tags: defaultTags, agenda: defaultAgenda, organiserId: _owner, ...defaults } = eventInput();
    const form = new FormData();
    for (const [key, value] of Object.entries({ ...defaults, ...fields })) {
        if (value !== undefined) form.append(key, String(value));
    }
    if (image) form.append('image', image);
    if (tags !== null) form.append('tags', tags ?? JSON.stringify(defaultTags));
    if (agenda !== null) form.append('agenda', agenda ?? JSON.stringify(defaultAgenda));

    return new NextRequest('http://localhost/api/events', {
        method: 'POST',
        body: form,
        headers: origin ? { origin } : undefined,
    });
}

beforeAll(connectTestDB);

beforeEach(() => {
    vi.stubEnv('CLOUDINARY_URL', 'cloudinary://key:secret@demo');
    vi.stubEnv('BETTER_AUTH_URL', APP_ORIGIN);
    getSession.mockReset().mockResolvedValue(sessionFor());
    upload_stream.mockReset().mockImplementation((_options, callback) => ({
        end: () => callback(undefined, UPLOADED),
    }));
    destroy.mockReset().mockResolvedValue({ result: 'ok' });
    vi.mocked(revalidateTag).mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(clearDatabase);

describe('POST /api/events', () => {
    it('uploads the image, saves the event and refreshes the events cache', async () => {
        const res = await POST(createRequest());
        const body = await res.json();

        expect(res.status).toBe(201);
        expect(body.message).toBe('Event created successfully');
        expect(body.event).toMatchObject({ slug: 'react-summit-2026', image: UPLOADED.secure_url, tags: ['react', 'frontend'] });
        expect(upload_stream).toHaveBeenCalledWith({ resource_type: 'image', folder: 'DevEvent' }, expect.any(Function));
        expect(revalidateTag).toHaveBeenCalledWith('events', { expire: 0 });
        expect(await Event.countDocuments()).toBe(1);
    });

    it('derives the slug from the title and ignores a slug sent by the client', async () => {
        const res = await POST(createRequest({ fields: { slug: 'hijacked' } }));

        expect((await res.json()).event.slug).toBe('react-summit-2026');
    });

    it('refuses a body that is not multipart form data', async () => {
        const req = new NextRequest('http://localhost/api/events', {
            method: 'POST',
            headers: { 'content-type': 'application/json', origin: APP_ORIGIN },
            body: JSON.stringify(eventInput()),
        });

        const res = await POST(req);

        expect(res.status).toBe(415);
        expect(await res.json()).toEqual({ message: 'Request body must be multipart/form-data' });
    });

    it.each([
        ['missing', null, 'Image file is required'],
        ['empty', new File([], 'empty.png', { type: 'image/png' }), 'Image file is required'],
        ['not an image', new File(['hello'], 'notes.txt', { type: 'text/plain' }), 'Image must be an image file'],
        ['larger than 5 MB', pngFile(5 * 1024 * 1024 + 1), 'Image must be 5 MB or smaller'],
    ])('rejects an image that is %s, before uploading', async (_case, image, message) => {
        const res = await POST(createRequest({ image }));

        expect(res.status).toBe(400);
        expect((await res.json()).message).toBe(message);
        expect(upload_stream).not.toHaveBeenCalled();
    });

    it('accepts an image of exactly 5 MB', async () => {
        const res = await POST(createRequest({ image: pngFile(5 * 1024 * 1024) }));

        expect(res.status).toBe(201);
    });

    it.each([
        ['tags', { tags: null }, 'tags must be a JSON array of strings'],
        ['tags', { tags: 'react, frontend' }, 'tags must be a JSON array of strings'],
        ['tags', { tags: '[1, 2]' }, 'tags must be a JSON array of strings'],
        ['agenda', { agenda: '{"item":"Keynote"}' }, 'agenda must be a JSON array of strings'],
    ])('rejects %s that are not a JSON array of strings', async (_field, options, message) => {
        const res = await POST(createRequest(options));

        expect(res.status).toBe(400);
        expect((await res.json()).message).toBe(message);
        expect(upload_stream).not.toHaveBeenCalled();
    });

    it('returns every field error and uploads nothing when the event is invalid', async () => {
        const res = await POST(createRequest({ fields: { mode: 'virtual', venue: undefined, date: '2026-02-30' } }));
        const body = await res.json();

        expect(res.status).toBe(400);
        expect(body.message).toBe('Validation failed');
        expect(body.errors).toMatchObject({
            mode: 'Mode must be either online, offline, or hybrid',
            venue: 'Venue is required',
            date: 'Invalid date. Use YYYY-MM-DD',
        });
        expect(upload_stream).not.toHaveBeenCalled();
        expect(await Event.countDocuments()).toBe(0);
    });

    it('fails clearly and uploads nothing when Cloudinary is not configured', async () => {
        vi.stubEnv('CLOUDINARY_URL', '');

        const res = await POST(createRequest());

        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({ message: 'Image uploads are not configured on this server' });
        expect(upload_stream).not.toHaveBeenCalled();
        expect(await Event.countDocuments()).toBe(0);
    });

    it('saves nothing when the upload itself fails', async () => {
        upload_stream.mockImplementation((_options, callback) => ({
            end: () => callback(new Error('Cloudinary is down'), undefined),
        }));

        const res = await POST(createRequest());

        expect(res.status).toBe(500);
        expect((await res.json()).message).toBe('Event Creation Failed');
        expect(destroy).not.toHaveBeenCalled();
        expect(await Event.countDocuments()).toBe(0);
    });

    it('deletes the uploaded image when saving the event fails', async () => {
        vi.spyOn(Event.prototype, 'save').mockRejectedValueOnce(new Error('write failed'));

        const res = await POST(createRequest());

        expect(res.status).toBe(500);
        expect(await res.json()).toMatchObject({ message: 'Event Creation Failed', error: 'write failed' });
        expect(destroy).toHaveBeenCalledWith(UPLOADED.public_id);
    });

    it('answers 409 and cleans up the upload when a duplicate slug slips past the check', async () => {
        vi.spyOn(Event.prototype, 'save').mockRejectedValueOnce(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }));

        const res = await POST(createRequest());

        expect(res.status).toBe(409);
        expect(await res.json()).toEqual({ message: 'An event with this title already exists' });
        expect(destroy).toHaveBeenCalledWith(UPLOADED.public_id);
    });

    it('still answers when deleting the orphaned upload also fails', async () => {
        vi.spyOn(Event.prototype, 'save').mockRejectedValueOnce(new Error('write failed'));
        destroy.mockRejectedValueOnce(new Error('cleanup failed'));

        const res = await POST(createRequest());

        expect(res.status).toBe(500);
    });
});

describe('POST /api/events: who may create (spec 0001)', () => {
    it('answers 401 for a signed out request, before reading the body or uploading', async () => {
        getSession.mockResolvedValue(null);
        const req = createRequest();
        const formData = vi.spyOn(req, 'formData');

        const res = await POST(req);

        expect(res.status).toBe(401);
        expect(formData).not.toHaveBeenCalled();
        expect(upload_stream).not.toHaveBeenCalled();
    });

    it.each([
        ['another site', 'https://evil.example'],
        ['no origin at all', null],
    ])('answers 403 when the Origin is %s', async (_case, origin) => {
        const res = await POST(createRequest({ origin }));

        expect(res.status).toBe(403);
        expect(upload_stream).not.toHaveBeenCalled();
    });

    it('answers 403 EMAIL_NOT_VERIFIED for an unverified organiser, and uploads nothing', async () => {
        getSession.mockResolvedValue(sessionFor({ emailVerified: false }));

        const res = await POST(createRequest());

        expect(res.status).toBe(403);
        expect((await res.json()).code).toBe('EMAIL_NOT_VERIFIED');
        expect(upload_stream).not.toHaveBeenCalled();
    });

    it('owns the event as the signed in user and ignores server only fields in the body', async () => {
        const res = await POST(createRequest({
            fields: {
                organiserId: 'someone-else',
                ownerBanned: 'true',
                imagePublicId: 'evil/id',
                createdAt: '2020-01-01T00:00:00.000Z',
            },
        }));
        const { event } = await res.json();

        expect(res.status).toBe(201);
        expect(event).toMatchObject({ organiserId: TEST_ORGANISER_ID, ownerBanned: false, imagePublicId: UPLOADED.public_id });
        expect(new Date(event.createdAt).getFullYear()).not.toBe(2020);
    });

    it('stores the owner as the same string the session reports, so lookups by session.user.id work', async () => {
        await POST(createRequest());

        const found = await Event.findOne({ organiserId: sessionFor().user.id }).lean<{ organiserId: unknown }>();
        expect(found).not.toBeNull();
        expect(typeof found!.organiserId).toBe('string');
    });

    it('answers 429 EVENT_QUOTA with nextSlotAt and Retry-After after 3 creates, uploading nothing', async () => {
        for (let i = 1; i <= 3; i++) {
            expect((await POST(createRequest({ fields: { title: `Event ${i}` } }))).status).toBe(201);
        }
        upload_stream.mockClear();

        const res = await POST(createRequest({ fields: { title: 'Event 4' } }));
        const body = await res.json();

        expect(res.status).toBe(429);
        expect(body.code).toBe('EVENT_QUOTA');
        expect(new Date(body.nextSlotAt).getTime()).toBeGreaterThan(Date.now());
        expect(Number(res.headers.get('Retry-After'))).toBeGreaterThan(0);
        expect(upload_stream).not.toHaveBeenCalled();
    });

    it('lets exactly 3 of 5 parallel creates through', async () => {
        const results = await Promise.all(
            [1, 2, 3, 4, 5].map((i) => POST(createRequest({ fields: { title: `Parallel ${i}` } }))),
        );

        expect(results.filter((r) => r.status === 201)).toHaveLength(3);
        expect(results.filter((r) => r.status === 429)).toHaveLength(2);
        expect(upload_stream).toHaveBeenCalledTimes(3);
        expect(await Event.countDocuments()).toBe(3);
    });

    it('gives the quota slot back when the create fails', async () => {
        await POST(createRequest({ fields: { mode: 'virtual' } }));

        const quota = await EventQuota.findOne({ userId: TEST_ORGANISER_ID }).lean();
        expect(quota?.slots ?? []).toHaveLength(0);
    });
});

describe('GET /api/events', () => {
    it('lists events newest first', async () => {
        await seedEvent({ title: 'Older', createdAt: new Date('2026-01-01') });
        await seedEvent({ title: 'Newer', createdAt: new Date('2026-02-01') });

        const res = await GET();
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.message).toBe('Events fetched successfully');
        expect(body.events.map((e: { title: string }) => e.title)).toEqual(['Newer', 'Older']);
    });

    it('returns an empty list when there are no events', async () => {
        const res = await GET();

        expect(res.status).toBe(200);
        expect((await res.json()).events).toEqual([]);
    });

    it('answers 500 without internal details when the database fails', async () => {
        vi.spyOn(Event, 'find').mockImplementationOnce(() => {
            throw new Error('connection reset');
        });

        const res = await GET();

        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({ message: 'Event fetching failed' });
    });
});

describe('POST /api/events in production', () => {
    // isProd is read once when the route module loads, so load a fresh copy with NODE_ENV=production.
    const loadProdRoute = async () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.resetModules();
        return (await import('./route')).POST;
    };

    it('hides the internal error message from the response', async () => {
        const prodPOST = await loadProdRoute();
        vi.spyOn(Event.prototype, 'save').mockRejectedValueOnce(new Error('E_WRITE at shard-02.internal:27017'));

        const res = await prodPOST(createRequest());
        const body = await res.json();

        expect(res.status).toBe(500);
        expect(body).toEqual({ message: 'Event Creation Failed' });
        expect(JSON.stringify(body)).not.toContain('shard-02');
    });
});
