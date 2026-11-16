import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { upload_stream, destroy } = vi.hoisted(() => ({ upload_stream: vi.fn(), destroy: vi.fn() }));
vi.mock('cloudinary', () => ({ v2: { uploader: { upload_stream, destroy } } }));
vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), cacheLife: vi.fn(), cacheTag: vi.fn(), updateTag: vi.fn() }));

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession } } }));

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/email', () => ({ sendEmail }));

// Run background work inline so tests can see its effects.
vi.mock('@/lib/background', () => ({ runAfter: (task: () => Promise<unknown>) => { void task(); } }));

import { revalidateTag } from 'next/cache';
import Event from '@/database/event.model';
import Booking from '@/database/booking.model';
import { DELETE, PATCH } from './route';
import { GET as CSV } from './bookings.csv/route';
import { clearDatabase, connectTestDB, seedEvent, TEST_ORGANISER_ID } from '@/test/db';

const APP_ORIGIN = 'http://localhost:3000';
const OTHER_ID = '665f1c2ab3d4e5f6a7b8c9ff';

type U = { id?: string; email?: string; emailVerified?: boolean; role?: string };
const as = (u: U = {}) =>
    getSession.mockResolvedValue({
        session: { id: 's1' },
        user: { id: TEST_ORGANISER_ID, name: 'Ada', email: 'ada@example.com', emailVerified: true, ...u },
    });

const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });

function patch(slug: string, fields: Record<string, string>, { origin = APP_ORIGIN, image }: { origin?: string | null; image?: File } = {}) {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    if (image) form.append('image', image);
    return PATCH(new NextRequest(`http://localhost/api/events/${slug}`, { method: 'PATCH', body: form, headers: origin ? { origin } : undefined }), ctx(slug));
}

const del = (slug: string, origin: string | null = APP_ORIGIN) =>
    DELETE(new NextRequest(`http://localhost/api/events/${slug}`, { method: 'DELETE', headers: origin ? { origin } : undefined }), ctx(slug));

const csv = (slug: string) => CSV(new NextRequest(`http://localhost/api/events/${slug}/bookings.csv`), ctx(slug));

const future = '2099-06-01';
const past = '2000-01-01';

beforeAll(connectTestDB);
beforeEach(() => {
    vi.stubEnv('BETTER_AUTH_URL', APP_ORIGIN);
    vi.stubEnv('CLOUDINARY_URL', 'cloudinary://key:secret@demo');
    vi.stubEnv('SUPER_ADMIN_EMAIL', 'boss@example.com');
    as();
    sendEmail.mockReset().mockResolvedValue(true);
    destroy.mockReset().mockResolvedValue({ result: 'ok' });
    upload_stream.mockReset().mockImplementation((_o, cb) => ({ end: () => cb(undefined, { public_id: 'DevEvent/new', secure_url: 'https://res.cloudinary.com/demo/new.png' }) }));
    vi.mocked(revalidateTag).mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(clearDatabase);

async function eventWithBookings(overrides: Record<string, unknown> = {}, emails = ['a@x.com', 'b@x.com']) {
    const event = await seedEvent({ date: future, imagePublicId: 'DevEvent/old', ...overrides });
    for (const email of emails) await Booking.create({ eventId: event._id, email });
    return event;
}

describe('PATCH /api/events/[slug] (spec 0001, AC-11, AC-12)', () => {
    it('answers 401 signed out, 403 for a foreign origin, and 404 for a missing slug', async () => {
        await eventWithBookings();
        getSession.mockResolvedValueOnce(null);
        expect((await patch('react-summit-2026', { venue: 'X' })).status).toBe(401);
        expect((await patch('react-summit-2026', { venue: 'X' }, { origin: 'https://evil.example' })).status).toBe(403);
        expect((await patch('nope', { venue: 'X' })).status).toBe(404);
    });

    it('refuses another organiser and an admin with 403, and an unverified owner with EMAIL_NOT_VERIFIED', async () => {
        await eventWithBookings();
        as({ id: OTHER_ID, email: 'other@example.com' });
        expect((await patch('react-summit-2026', { venue: 'X' })).status).toBe(403);
        as({ id: OTHER_ID, email: 'mod@example.com', role: 'admin' });
        expect((await patch('react-summit-2026', { venue: 'X' })).status).toBe(403);
        as({ emailVerified: false });
        const res = await patch('react-summit-2026', { venue: 'X' });
        expect(res.status).toBe(403);
        expect((await res.json()).code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('keeps left out fields, replaces tags, and never changes the slug even when the title does', async () => {
        await eventWithBookings();
        const res = await patch('react-summit-2026', { title: 'A New Name', tags: JSON.stringify(['vue']), organiserId: OTHER_ID });

        expect(res.status).toBe(200);
        const saved = await Event.findOne({ slug: 'react-summit-2026' }).lean<Record<string, unknown>>();
        expect(saved).toMatchObject({ title: 'A New Name', tags: ['vue'], venue: 'Moscone Center', organiserId: TEST_ORGANISER_ID });
        expect(revalidateTag).toHaveBeenCalledWith('events', { expire: 0 });
        expect(revalidateTag).toHaveBeenCalledWith('event:react-summit-2026', { expire: 0 });
    });

    it('lets the super admin edit someone else\'s event', async () => {
        await eventWithBookings();
        as({ id: OTHER_ID, email: 'BOSS@example.com' });
        expect((await patch('react-summit-2026', { audience: 'Everyone' })).status).toBe(200);
    });

    it('emails each attendee once, listing old and new values, when a notice field changes', async () => {
        await eventWithBookings();
        await patch('react-summit-2026', { venue: 'Pier 48', time: '10:30', audience: 'Everyone' });

        expect(sendEmail).toHaveBeenCalledTimes(1);
        const call = sendEmail.mock.calls[0][0];
        expect(call.template).toBe('event-updated');
        expect([...call.to].sort()).toEqual(['a@x.com', 'b@x.com']);
        expect(call.data.changes).toEqual([
            { field: 'time', label: 'Time', from: '09:00', to: '10:30' },
            { field: 'venue', label: 'Venue', from: 'Moscone Center', to: 'Pier 48' },
        ]);
        expect(call.data.url).toBe(`${APP_ORIGIN}/events/react-summit-2026`);
    });

    it('sends nothing when only other fields change, or when values match after normalising', async () => {
        await eventWithBookings();
        await patch('react-summit-2026', { audience: 'Everyone', time: '9:00', mode: ' OFFLINE ', venue: ' Moscone Center ' });
        expect(sendEmail).not.toHaveBeenCalled();
    });

    it('sends nothing for a past event', async () => {
        await eventWithBookings({ date: past });
        await patch('react-summit-2026', { venue: 'Pier 48' });
        expect(sendEmail).not.toHaveBeenCalled();
    });

    it('replaces the banner and removes the old image after saving', async () => {
        await eventWithBookings();
        const res = await patch('react-summit-2026', {}, { image: new File([new Uint8Array(8)], 'b.png', { type: 'image/png' }) });

        expect(res.status).toBe(200);
        expect(await Event.findOne({ slug: 'react-summit-2026' }).lean()).toMatchObject({ imagePublicId: 'DevEvent/new' });
        await vi.waitFor(() => expect(destroy).toHaveBeenCalledWith('DevEvent/old'));
    });

    it('returns per field errors and changes nothing for invalid values', async () => {
        await eventWithBookings();
        const res = await patch('react-summit-2026', { mode: 'virtual' });
        expect(res.status).toBe(400);
        expect((await res.json()).errors).toHaveProperty('mode');
        expect(await Event.findOne({ slug: 'react-summit-2026' }).lean()).toMatchObject({ mode: 'offline' });
    });
});

describe('DELETE /api/events/[slug] (spec 0001, AC-4, AC-13)', () => {
    it('deletes the event and its bookings, emails every attendee, and removes the image', async () => {
        await eventWithBookings();
        const res = await del('react-summit-2026');

        expect(res.status).toBe(204);
        expect(await Event.countDocuments()).toBe(0);
        expect(await Booking.countDocuments()).toBe(0);
        await vi.waitFor(() => expect(destroy).toHaveBeenCalledWith('DevEvent/old'));
        const call = sendEmail.mock.calls[0][0];
        expect(call).toMatchObject({ template: 'event-cancelled', data: { title: 'React Summit 2026', date: future } });
        expect([...call.to].sort()).toEqual(['a@x.com', 'b@x.com']);
    });

    it('lets an unverified owner delete, but not another organiser or an admin', async () => {
        await eventWithBookings();
        as({ id: OTHER_ID, email: 'mod@example.com', role: 'admin' });
        expect((await del('react-summit-2026')).status).toBe(403);
        as({ emailVerified: false });
        expect((await del('react-summit-2026')).status).toBe(204);
    });

    it('still deletes when the email can\'t be sent (AC-25)', async () => {
        await eventWithBookings();
        sendEmail.mockResolvedValue(false);
        expect((await del('react-summit-2026')).status).toBe(204);
        expect(await Booking.countDocuments()).toBe(0);
    });

    it('answers 401, 403 for a foreign origin, and 404 for a missing slug', async () => {
        await eventWithBookings();
        getSession.mockResolvedValueOnce(null);
        expect((await del('react-summit-2026')).status).toBe(401);
        expect((await del('react-summit-2026', 'https://evil.example')).status).toBe(403);
        expect((await del('missing')).status).toBe(404);
    });
});

describe('audit of event moderation (spec 0001, AC-20)', () => {
    it("logs the super admin editing and deleting someone else's event, with the title at the time", async () => {
        const { default: AuditLog } = await import('@/database/audit-log.model');
        await eventWithBookings();
        as({ id: OTHER_ID, email: 'boss@example.com' });

        await patch('react-summit-2026', { title: 'Cleaned Up', venue: 'Pier 48' });
        await del('react-summit-2026');

        const entries = await AuditLog.find().sort({ createdAt: 1 }).lean();
        expect(entries.map((e) => e.action)).toEqual(['event.update', 'event.delete']);
        expect(entries[0]).toMatchObject({ actorEmail: 'boss@example.com', targetLabel: 'React Summit 2026', meta: { fields: ['title', 'venue'] } });
        expect(entries[1]).toMatchObject({ targetLabel: 'Cleaned Up', meta: { bookings: 2 } });
    });

    it('logs nothing when owners (including the super admin) act on their own events', async () => {
        const { default: AuditLog } = await import('@/database/audit-log.model');
        await eventWithBookings();
        await patch('react-summit-2026', { venue: 'Pier 48' });
        await del('react-summit-2026');
        expect(await AuditLog.countDocuments()).toBe(0);
    });
});

describe('GET /api/events/[slug]/bookings.csv (spec 0001, AC-14)', () => {
    it('exports every booking with BOM, CRLF, quoted fields, and formula protection', async () => {
        await eventWithBookings({}, Array.from({ length: 60 }, (_, i) => `user${i}@x.com`));
        const event = await Event.findOne({ slug: 'react-summit-2026' });
        // Booking emails must pass the model's validator, so set a risky one directly.
        await Booking.collection.insertOne({ eventId: event!._id, email: '=cmd@x.com', createdAt: new Date(), updatedAt: new Date() });

        const res = await csv('react-summit-2026');
        // Read raw bytes: Response.text() would silently drop the BOM.
        const bytes = new Uint8Array(await res.arrayBuffer());
        const body = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);

        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/csv');
        expect(res.headers.get('content-disposition')).toContain('filename="react-summit-2026-bookings.csv"');
        expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
        const lines = body.slice(1).split('\r\n').filter(Boolean);
        expect(lines[0]).toBe('"email","booked_at_utc"');
        expect(lines).toHaveLength(62);
        expect(body).toContain(`"'=cmd@x.com"`);
        expect(lines[1]).toMatch(/^"[^"]+","\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z"$/);
    });

    it('allows the owner and an admin, refuses another organiser, and 404s a missing slug', async () => {
        await eventWithBookings();
        expect((await csv('react-summit-2026')).status).toBe(200);
        as({ id: OTHER_ID, email: 'mod@example.com', role: 'admin' });
        expect((await csv('react-summit-2026')).status).toBe(200);
        as({ id: OTHER_ID, email: 'other@example.com' });
        expect((await csv('react-summit-2026')).status).toBe(403);
        expect((await csv('missing')).status).toBe(404);
        getSession.mockResolvedValueOnce(null);
        expect((await csv('react-summit-2026')).status).toBe(401);
    });

    it('still exports an event hidden by its owner\'s ban', async () => {
        await eventWithBookings({ ownerBanned: true });
        expect((await csv('react-summit-2026')).status).toBe(200);
    });
});
