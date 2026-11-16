import {cacheLife, cacheTag} from "next/cache";
import {Types} from "mongoose";

import Event from '@/database/event.model';
import Booking from '@/database/booking.model';
import connectDB from "@/lib/mongodb";
import {publicVisibility} from "@/lib/events/visibility";

// Read side data functions for server components.
// They query MongoDB directly (never the app's own /api routes, which don't
// exist at build time) and return plain, serialisable objects.

export const EVENTS_TAG = 'events';
export const eventTag = (slug: string) => `event:${slug}`;
export const bookingsTag = (eventId: string) => `bookings:${eventId}`;

export type EventCardDTO = {
    _id: string;
    title: string;
    slug: string;
    image: string;
    location: string;
    date: string;
    time: string;
};

export type EventDTO = EventCardDTO & {
    description: string;
    overview: string;
    venue: string;
    mode: string;
    audience: string;
    agenda: string[];
    organizer: string;
    tags: string[];
};

const CARD_FIELDS = '_id title slug image location date time';

type LeanDoc = Record<string, unknown> & { _id: Types.ObjectId };

const toCard = (doc: LeanDoc): EventCardDTO => ({
    _id: doc._id.toString(),
    title: doc.title as string,
    slug: doc.slug as string,
    image: doc.image as string,
    location: doc.location as string,
    date: doc.date as string,
    time: doc.time as string,
});

export const getAllEvents = async (): Promise<EventCardDTO[]> => {
    'use cache';
    cacheLife('hours');
    cacheTag(EVENTS_TAG);

    await connectDB();
    const events = await Event.find(publicVisibility()).sort({ createdAt: -1 }).select(CARD_FIELDS).lean<LeanDoc[]>();

    return events.map(toCard);
}

export const getEventBySlug = async (slug: string): Promise<EventDTO | null> => {
    'use cache';
    cacheLife('hours');
    cacheTag(EVENTS_TAG, eventTag(slug));

    await connectDB();
    const event = await Event.findOne({ slug: slug.trim().toLowerCase(), ...publicVisibility() }).lean<LeanDoc>();
    if (!event) return null;

    return {
        ...toCard(event),
        description: event.description as string,
        overview: event.overview as string,
        venue: event.venue as string,
        mode: event.mode as string,
        audience: event.audience as string,
        agenda: [...(event.agenda as string[])],
        organizer: event.organizer as string,
        tags: [...(event.tags as string[])],
    };
}

export const getSimilarEventsBySlug = async (slug: string): Promise<EventCardDTO[]> => {
    'use cache';
    cacheLife('hours');
    cacheTag(EVENTS_TAG);

    await connectDB();
    const visible = publicVisibility();
    const event = await Event.findOne({ slug, ...visible }).select('_id tags').lean<LeanDoc>();
    if (!event) return [];

    const similar = await Event.find({ _id: { $ne: event._id }, tags: { $in: event.tags }, ...visible })
        .sort({ createdAt: -1 })
        .limit(3)
        .select(CARD_FIELDS)
        .lean<LeanDoc[]>();

    return similar.map(toCard);
}

export const getBookingCount = async (eventId: string): Promise<number> => {
    'use cache';
    cacheLife('hours');
    cacheTag(bookingsTag(eventId));

    await connectDB();
    return Booking.countDocuments({ eventId });
}
