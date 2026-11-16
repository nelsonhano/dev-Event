import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Error as MongooseError, Types } from 'mongoose';

import Booking from './booking.model';
import { clearDatabase, connectTestDB, seedEvent } from '@/test/db';

beforeAll(connectTestDB);
afterEach(clearDatabase);

describe('Booking', () => {
    it('stores the email trimmed and lowercased', async () => {
        const event = await seedEvent();

        const booking = await Booking.create({ eventId: event._id, email: '  Ada@Example.COM ' });

        expect(booking.email).toBe('ada@example.com');
    });

    it('rejects an invalid email address', async () => {
        const event = await seedEvent();

        const error = await Booking.create({ eventId: event._id, email: 'not-an-email' }).catch((e) => e);

        expect(error).toBeInstanceOf(MongooseError.ValidationError);
        expect(error.errors.email.message).toBe('Please provide a valid email address');
    });

    it('requires both an event and an email', async () => {
        const error = await Booking.create({}).catch((e) => e);

        expect(error).toBeInstanceOf(MongooseError.ValidationError);
        expect(error.errors.eventId.message).toBe('Event ID is required');
        expect(error.errors.email.message).toBe('Email is required');
    });

    it('refuses a booking for an event that does not exist', async () => {
        const missingId = new Types.ObjectId();

        const error = await Booking.create({ eventId: missingId, email: 'ada@example.com' }).catch((e) => e);

        expect(error.name).toBe('ValidationError');
        expect(error.message).toBe(`Event with ID ${missingId} does not exist`);
        expect(await Booking.countDocuments()).toBe(0);
    });

    it('allows only one booking per email per event, ignoring email case', async () => {
        const event = await seedEvent();
        await Booking.create({ eventId: event._id, email: 'ada@example.com' });

        const error = await Booking.create({ eventId: event._id, email: 'ADA@example.com' }).catch((e) => e);

        expect(error.code).toBe(11000);
        expect(await Booking.countDocuments()).toBe(1);
    });

    it('lets the same email book different events, and different emails book the same event', async () => {
        const first = await seedEvent({ title: 'First' });
        const second = await seedEvent({ title: 'Second' });

        await Booking.create({ eventId: first._id, email: 'ada@example.com' });
        await Booking.create({ eventId: second._id, email: 'ada@example.com' });
        await Booking.create({ eventId: first._id, email: 'grace@example.com' });

        expect(await Booking.countDocuments()).toBe(3);
    });
});
