import mongoose from 'mongoose';

import connectDB from '@/lib/mongodb';
import Event from '@/database/event.model';
import Booking from '@/database/booking.model';
import EventQuota from '@/database/event-quota.model';

/** Connects to this file's test database and builds the unique indexes the app relies on. */
export async function connectTestDB() {
    await connectDB();
    // Model.init() only runs once per process, so build indexes explicitly on this database.
    await Promise.all([Event.createIndexes(), Booking.createIndexes(), EventQuota.createIndexes()]);
}

export async function clearDatabase() {
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
}

export const TEST_ORGANISER_ID = '665f1c2ab3d4e5f6a7b8c9d0';

/** A valid event payload; override only what a test cares about. */
export const eventInput = (overrides: Record<string, unknown> = {}) => ({
    title: 'React Summit 2026',
    description: 'A full day of talks about React and its ecosystem.',
    overview: 'Talks, workshops and networking.',
    image: 'https://img.test/react-summit.png',
    venue: 'Moscone Center',
    location: 'San Francisco, CA',
    date: '2026-05-01',
    time: '09:00',
    mode: 'offline',
    audience: 'Developers',
    agenda: ['Keynote', 'Workshops'],
    organizer: 'React Org',
    tags: ['react', 'frontend'],
    // A Better Auth user id string (spec 0001: every event has an owner).
    organiserId: TEST_ORGANISER_ID,
    ...overrides,
});

export const seedEvent = (overrides: Record<string, unknown> = {}) => Event.create(eventInput(overrides));
