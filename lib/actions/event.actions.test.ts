import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';

// Outside Next there is no 'use cache' compiler, so the cache APIs are boundaries to observe.
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), updateTag: vi.fn() }));

import { cacheTag } from 'next/cache';
import Booking from '@/database/booking.model';
import {
    EVENTS_TAG,
    bookingsTag,
    eventTag,
    getAllEvents,
    getBookingCount,
    getEventBySlug,
    getSimilarEventsBySlug,
} from './event.actions';
import { clearDatabase, connectTestDB, seedEvent } from '@/test/db';

const CARD_KEYS = ['_id', 'date', 'image', 'location', 'slug', 'time', 'title'];
const at = (iso: string) => ({ createdAt: new Date(iso) });

beforeAll(connectTestDB);
afterEach(async () => {
    await clearDatabase();
    vi.mocked(cacheTag).mockClear();
});

describe('cache tags', () => {
    it('builds stable tag names', () => {
        expect(EVENTS_TAG).toBe('events');
        expect(eventTag('devfest')).toBe('event:devfest');
        expect(bookingsTag('abc')).toBe('bookings:abc');
    });
});

describe('getAllEvents', () => {
    it('returns every event as a card, newest first', async () => {
        await seedEvent({ title: 'Oldest', ...at('2026-01-01') });
        await seedEvent({ title: 'Newest', ...at('2026-03-01') });
        await seedEvent({ title: 'Middle', ...at('2026-02-01') });

        const events = await getAllEvents();

        expect(events.map((e) => e.title)).toEqual(['Newest', 'Middle', 'Oldest']);
    });

    it('returns only card fields, as plain serialisable values', async () => {
        await seedEvent();

        const [card] = await getAllEvents();

        expect(Object.keys(card).sort()).toEqual(CARD_KEYS);
        expect(typeof card._id).toBe('string');
        expect(JSON.parse(JSON.stringify(card))).toEqual(card);
    });

    it('returns an empty list when there are no events', async () => {
        expect(await getAllEvents()).toEqual([]);
    });

    it('tags its cache so creating an event can refresh it', async () => {
        await getAllEvents();

        expect(cacheTag).toHaveBeenCalledWith(EVENTS_TAG);
    });
});

describe('getEventBySlug', () => {
    it('returns the full event details for a slug', async () => {
        const created = await seedEvent();

        const event = await getEventBySlug('react-summit-2026');

        expect(event).toMatchObject({
            _id: created._id.toString(),
            slug: 'react-summit-2026',
            title: 'React Summit 2026',
            venue: 'Moscone Center',
            mode: 'offline',
            agenda: ['Keynote', 'Workshops'],
            tags: ['react', 'frontend'],
        });
        expect(JSON.parse(JSON.stringify(event))).toEqual(event);
    });

    it('matches regardless of case and surrounding spaces', async () => {
        await seedEvent();

        const event = await getEventBySlug('  React-Summit-2026 ');

        expect(event?.slug).toBe('react-summit-2026');
    });

    it('returns null when no event has that slug', async () => {
        expect(await getEventBySlug('missing')).toBeNull();
    });

    it('tags its cache for all events and for this event', async () => {
        await getEventBySlug('devfest');

        expect(cacheTag).toHaveBeenCalledWith(EVENTS_TAG, eventTag('devfest'));
    });
});

describe('getSimilarEventsBySlug', () => {
    it('returns other events that share at least one tag, never the event itself', async () => {
        await seedEvent({ title: 'Base', tags: ['react', 'ai'] });
        await seedEvent({ title: 'Shares React', tags: ['react'] });
        await seedEvent({ title: 'Shares AI', tags: ['ai', 'python'] });
        await seedEvent({ title: 'Unrelated', tags: ['golang'] });

        const similar = await getSimilarEventsBySlug('base');

        expect(similar.map((e) => e.title).sort()).toEqual(['Shares AI', 'Shares React']);
    });

    it('returns at most three, newest first, as cards', async () => {
        await seedEvent({ title: 'Base', tags: ['react'], ...at('2026-01-01') });
        for (const [title, month] of [['A', '02'], ['B', '03'], ['C', '04'], ['D', '05']]) {
            await seedEvent({ title, tags: ['react'], ...at(`2026-${month}-01`) });
        }

        const similar = await getSimilarEventsBySlug('base');

        expect(similar.map((e) => e.title)).toEqual(['D', 'C', 'B']);
        expect(Object.keys(similar[0]).sort()).toEqual(CARD_KEYS);
    });

    it('returns an empty list when nothing shares a tag', async () => {
        await seedEvent({ title: 'Base', tags: ['react'] });
        await seedEvent({ title: 'Other', tags: ['golang'] });

        expect(await getSimilarEventsBySlug('base')).toEqual([]);
    });

    it('returns an empty list for an unknown slug', async () => {
        expect(await getSimilarEventsBySlug('missing')).toEqual([]);
    });
});

describe('getBookingCount', () => {
    it('counts only the bookings for that event', async () => {
        const event = await seedEvent({ title: 'Counted' });
        const other = await seedEvent({ title: 'Other' });
        await Booking.create({ eventId: event._id, email: 'a@example.com' });
        await Booking.create({ eventId: event._id, email: 'b@example.com' });
        await Booking.create({ eventId: other._id, email: 'a@example.com' });

        expect(await getBookingCount(event._id.toString())).toBe(2);
    });

    it('returns 0 for an event with no bookings', async () => {
        expect(await getBookingCount(new Types.ObjectId().toString())).toBe(0);
    });

    it('uses the same cache tag that createBooking refreshes', async () => {
        const id = new Types.ObjectId().toString();

        await getBookingCount(id);

        expect(cacheTag).toHaveBeenCalledWith(bookingsTag(id));
    });
});
