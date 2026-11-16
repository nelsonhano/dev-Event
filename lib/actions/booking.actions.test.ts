import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';

vi.mock('next/cache', () => ({ updateTag: vi.fn(), cacheLife: vi.fn(), cacheTag: vi.fn() }));

import { updateTag } from 'next/cache';
import Booking from '@/database/booking.model';
import { createBooking } from './booking.actions';
import { bookingsTag } from './event.actions';
import { clearDatabase, connectTestDB, seedEvent } from '@/test/db';

beforeAll(connectTestDB);
afterEach(async () => {
    await clearDatabase();
    vi.mocked(updateTag).mockClear();
});

describe('createBooking', () => {
    it('books the event and refreshes that event\'s booking count', async () => {
        const event = await seedEvent();
        const eventId = event._id.toString();

        const result = await createBooking({ eventId, email: 'ada@example.com' });

        expect(result).toEqual({ success: true });
        expect(await Booking.countDocuments({ eventId })).toBe(1);
        expect(updateTag).toHaveBeenCalledWith(bookingsTag(eventId));
    });

    it('rejects an event id that is not a valid id, without touching the database', async () => {
        const create = vi.spyOn(Booking, 'create');

        const result = await createBooking({ eventId: 'not-an-id', email: 'ada@example.com' });

        expect(result).toEqual({ success: false, message: 'This event could not be found.' });
        expect(create).not.toHaveBeenCalled();
    });

    it.each(['', '   '])('asks for an email when it is %j', async (email) => {
        const event = await seedEvent();

        const result = await createBooking({ eventId: event._id.toString(), email });

        expect(result).toEqual({ success: false, message: 'Please enter your email address.' });
        expect(await Booking.countDocuments()).toBe(0);
    });

    it('explains when the email is not valid', async () => {
        const event = await seedEvent();

        const result = await createBooking({ eventId: event._id.toString(), email: 'ada@' });

        expect(result).toEqual({ success: false, message: 'Please provide a valid email address' });
    });

    it('tells the user they already booked, even with different email casing', async () => {
        const event = await seedEvent();
        const eventId = event._id.toString();
        await createBooking({ eventId, email: 'ada@example.com' });
        vi.mocked(updateTag).mockClear();

        const result = await createBooking({ eventId, email: ' ADA@Example.com ' });

        expect(result).toEqual({ success: false, message: "You've already booked this event with that email." });
        expect(await Booking.countDocuments({ eventId })).toBe(1);
        expect(updateTag).not.toHaveBeenCalled();
    });

    it('says the event was not found when a valid id points to no event', async () => {
        const result = await createBooking({ eventId: new Types.ObjectId().toString(), email: 'ada@example.com' });

        expect(result).toEqual({ success: false, message: 'This event could not be found.' });
        expect(await Booking.countDocuments()).toBe(0);
    });

    it('returns a generic message and logs the cause when the database fails unexpectedly', async () => {
        const event = await seedEvent();
        const cause = new Error('connection reset');
        vi.spyOn(Booking, 'create').mockRejectedValueOnce(cause);
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});

        const result = await createBooking({ eventId: event._id.toString(), email: 'ada@example.com' });

        expect(result).toEqual({ success: false, message: 'Something went wrong. Please try again.' });
        expect(log).toHaveBeenCalledWith('create booking failed', cause);
        expect(updateTag).not.toHaveBeenCalled();
    });
});
