import { Types } from 'mongoose';

import Event from '@/database/event.model';
import Booking from '@/database/booking.model';
import connectDB from '@/lib/mongodb';
import { clampPage } from '@/lib/events/paging';

// Organiser dashboard reads (spec 0001, AC-10 and AC-14). Per user and per request,
// so not cached; callers render them inside <Suspense>. Plain DTOs with string ids.

export const DASHBOARD_PAGE_SIZE = 20;
export const BOOKINGS_PAGE_SIZE = 50;

export type DashboardEvent = {
    _id: string;
    title: string;
    slug: string;
    date: string;
    time: string;
    bookingCount: number;
};

export type Paged<T> = { items: T[]; page: number; totalPages: number; total: number };

/** The organiser's own events, newest created first, with booking counts (one aggregate). */
export async function getOwnEventsPage(organiserId: string, rawPage: string | null): Promise<Paged<DashboardEvent>> {
    await connectDB();
    const total = await Event.countDocuments({ organiserId });
    const { page, totalPages, skip } = clampPage(rawPage, total, DASHBOARD_PAGE_SIZE);

    const events = await Event.find({ organiserId })
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(DASHBOARD_PAGE_SIZE)
        .select('_id title slug date time')
        .lean<{ _id: Types.ObjectId; title: string; slug: string; date: string; time: string }[]>();

    const counts = await Booking.aggregate<{ _id: Types.ObjectId; count: number }>([
        { $match: { eventId: { $in: events.map((e) => e._id) } } },
        { $group: { _id: '$eventId', count: { $sum: 1 } } },
    ]);
    const countById = new Map(counts.map((c) => [String(c._id), c.count]));

    return {
        items: events.map((e) => ({
            _id: String(e._id),
            title: e.title,
            slug: e.slug,
            date: e.date,
            time: e.time,
            bookingCount: countById.get(String(e._id)) ?? 0,
        })),
        page,
        totalPages,
        total,
    };
}

export type ManagedEvent = {
    _id: string;
    slug: string;
    title: string;
    description: string;
    overview: string;
    image: string;
    imagePublicId: string | null;
    venue: string;
    location: string;
    date: string;
    time: string;
    mode: string;
    audience: string;
    agenda: string[];
    organizer: string;
    tags: string[];
    organiserId: string | null;
};

/**
 * One event for the owner tools (edit, bookings), with no public visibility filter,
 * so events hidden by a ban stay reachable here (AC-14).
 */
export async function getEventForManage(slug: string): Promise<ManagedEvent | null> {
    await connectDB();
    const e = await Event.findOne({ slug: slug.trim().toLowerCase() }).lean<Record<string, unknown> & { _id: Types.ObjectId }>();
    if (!e) return null;
    return {
        _id: String(e._id),
        slug: e.slug as string,
        title: e.title as string,
        description: e.description as string,
        overview: e.overview as string,
        image: e.image as string,
        imagePublicId: (e.imagePublicId as string | undefined) || null,
        venue: e.venue as string,
        location: e.location as string,
        date: e.date as string,
        time: e.time as string,
        mode: e.mode as string,
        audience: e.audience as string,
        agenda: [...(e.agenda as string[])],
        organizer: e.organizer as string,
        tags: [...(e.tags as string[])],
        organiserId: (e.organiserId as string | undefined) ?? null,
    };
}

export type BookingRow = { _id: string; email: string; bookedAt: string };

/** One page of an event's bookings, newest first; `bookedAt` is UTC ISO. */
export async function getBookingsPage(eventId: string, rawPage: string | null): Promise<Paged<BookingRow>> {
    await connectDB();
    const total = await Booking.countDocuments({ eventId });
    const { page, totalPages, skip } = clampPage(rawPage, total, BOOKINGS_PAGE_SIZE);
    const rows = await Booking.find({ eventId })
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(BOOKINGS_PAGE_SIZE)
        .select('_id email createdAt')
        .lean<{ _id: Types.ObjectId; email: string; createdAt: Date }[]>();
    return {
        items: rows.map((r) => ({ _id: String(r._id), email: r.email, bookedAt: r.createdAt.toISOString() })),
        page,
        totalPages,
        total,
    };
}

/** Every booking for the CSV (not just one page), newest first. */
export async function getAllBookings(eventId: string) {
    await connectDB();
    const rows = await Booking.find({ eventId })
        .sort({ createdAt: -1, _id: -1 })
        .select('email createdAt')
        .lean<{ email: string; createdAt: Date }[]>();
    return rows.map((r) => ({ email: r.email, bookedAt: r.createdAt }));
}

export async function countBookings(eventId: string): Promise<number> {
    await connectDB();
    return Booking.countDocuments({ eventId });
}
