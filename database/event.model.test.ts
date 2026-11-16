import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Error as MongooseError } from 'mongoose';

import Event from './event.model';
import { clearDatabase, connectTestDB, eventInput, seedEvent } from '@/test/db';

/** Runs schema validation (including the pre validate hook) and returns { path: message }. */
async function validationErrors(doc: InstanceType<typeof Event>): Promise<Record<string, string>> {
    try {
        await doc.validate();
        return {};
    } catch (e) {
        if (!(e instanceof MongooseError.ValidationError)) throw e;
        return Object.fromEntries(Object.entries(e.errors).map(([path, err]) => [path, err.message]));
    }
}

const build = (overrides: Record<string, unknown> = {}) => new Event(eventInput(overrides));

beforeAll(connectTestDB);
afterEach(clearDatabase);

describe('Event slug', () => {
    it('derives a URL friendly slug from the title', async () => {
        const event = await seedEvent({ title: 'Hello, World! 2026' });

        expect(event.slug).toBe('hello-world-2026');
    });

    it('collapses repeated spaces and hyphens and trims them from the edges', async () => {
        const event = await seedEvent({ title: '  --Next   JS -- Conf--  ' });

        expect(event.slug).toBe('next-js-conf');
    });

    it('ignores a slug supplied by the client', async () => {
        const event = await seedEvent({ title: 'Real Title', slug: 'hijacked-slug' });

        expect(event.slug).toBe('real-title');
    });

    it('rejects a title with no letters or numbers, since it cannot make a slug', async () => {
        const errors = await validationErrors(build({ title: '!!! ???' }));

        expect(errors.title).toBe('Title must contain at least one letter or number');
    });

    it('appends -2, -3 when other events already use the slug', async () => {
        await seedEvent({ title: 'DevFest' });
        const second = await seedEvent({ title: 'DevFest' });
        const third = await seedEvent({ title: 'devfest!' });

        expect([second.slug, third.slug]).toEqual(['devfest-2', 'devfest-3']);
    });

    it('keeps its own slug when saved again without a title change', async () => {
        const event = await seedEvent({ title: 'DevFest' });

        event.venue = 'New Venue';
        await event.save();

        expect(event.slug).toBe('devfest');
    });

    it('does not count itself as a clash when its title is edited to the same slug', async () => {
        const event = await seedEvent({ title: 'DevFest' });

        event.title = 'DevFest!';
        await event.save();

        expect(event.slug).toBe('devfest');
    });
});

describe('Event date', () => {
    it('keeps a valid YYYY-MM-DD date as is', async () => {
        const event = build({ date: '2026-05-01' });

        expect(await validationErrors(event)).toEqual({});
        expect(event.date).toBe('2026-05-01');
    });

    it('accepts a leap day', async () => {
        const event = build({ date: '2028-02-29' });

        expect(await validationErrors(event)).toEqual({});
        expect(event.date).toBe('2028-02-29');
    });

    it('converts a written date to YYYY-MM-DD without shifting the day', async () => {
        const event = build({ date: 'May 1, 2026' });

        expect(await validationErrors(event)).toEqual({});
        expect(event.date).toBe('2026-05-01');
    });

    it('rejects a calendar date that does not exist', async () => {
        const errors = await validationErrors(build({ date: '2026-02-30' }));

        expect(errors.date).toBe('Invalid date. Use YYYY-MM-DD');
    });

    it('rejects text that is not a date', async () => {
        const errors = await validationErrors(build({ date: 'next friday' }));

        expect(errors.date).toBe('Invalid date format. Use YYYY-MM-DD');
    });
});

describe('Event time', () => {
    it.each([
        ['09:00', '09:00'],
        ['9:05', '09:05'],
        ['1:30 pm', '13:30'],
        ['11:59PM', '23:59'],
        ['12:00 AM', '00:00'],
        ['12:15 PM', '12:15'],
        [' 23:45 ', '23:45'],
    ])('normalises %j to 24 hour %j', async (input, expected) => {
        const event = build({ time: input });

        expect(await validationErrors(event)).toEqual({});
        expect(event.time).toBe(expected);
    });

    it.each(['13:00 PM', '0:30 AM'])('rejects %j because AM/PM hours must be 1 to 12', async (input) => {
        const errors = await validationErrors(build({ time: input }));

        expect(errors.time).toBe('With AM/PM, hours must be between 1 and 12');
    });

    it.each(['24:00', '09:60'])('rejects out of range time %j', async (input) => {
        const errors = await validationErrors(build({ time: input }));

        expect(errors.time).toBe('Invalid time values');
    });

    it.each(['noon', '9am', '09-00'])('rejects unrecognised time %j', async (input) => {
        const errors = await validationErrors(build({ time: input }));

        expect(errors.time).toBe('Invalid time format. Use HH:MM or HH:MM AM/PM');
    });
});

describe('Event field validation', () => {
    it('accepts a complete valid event', async () => {
        expect(await validationErrors(build())).toEqual({});
    });

    it('lowercases mode so "Online" is accepted', async () => {
        const event = build({ mode: 'Online' });

        expect(await validationErrors(event)).toEqual({});
        expect(event.mode).toBe('online');
    });

    it('rejects a mode outside online, offline and hybrid', async () => {
        const errors = await validationErrors(build({ mode: 'virtual' }));

        expect(errors.mode).toBe('Mode must be either online, offline, or hybrid');
    });

    it('reports every missing required field at once', async () => {
        const errors = await validationErrors(build({ title: undefined, venue: undefined, organizer: undefined }));

        expect(errors).toMatchObject({
            title: 'Title is required',
            venue: 'Venue is required',
            organizer: 'Organizer is required',
        });
    });

    it('requires at least one agenda item and one tag', async () => {
        const errors = await validationErrors(build({ agenda: [], tags: [] }));

        expect(errors).toMatchObject({
            agenda: 'At least one agenda item is required',
            tags: 'At least one tag is required',
        });
    });

    it('allows a 100 character title but rejects 101', async () => {
        expect((await validationErrors(build({ title: 'a'.repeat(100) }))).title).toBeUndefined();
        expect((await validationErrors(build({ title: 'a'.repeat(101) }))).title).toBe('Title cannot exceed 100 characters');
    });
});
