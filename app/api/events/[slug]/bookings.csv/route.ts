import { NextRequest, NextResponse } from 'next/server';

import { requireApiSession } from '@/lib/auth/guards';
import { canViewBookings } from '@/lib/auth/policy';
import { bookingsCsv } from '@/lib/events/csv';
import { getAllBookings, getEventForManage } from '@/lib/events/dashboard';

type RouteParams = { params: Promise<{ slug: string }> };

/**
 * GET /api/events/[slug]/bookings.csv (spec 0001, AC-14)
 * Every booking (not one page) for the owner, any admin, or the super admin.
 * No public visibility filter, so events hidden by a ban are still exportable.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
    const signedIn = await requireApiSession(req);
    if (!signedIn.ok) return signedIn.response;

    const { slug } = await params;
    const event = await getEventForManage(slug);
    if (!event) return NextResponse.json({ message: 'Event not found' }, { status: 404 });
    if (!canViewBookings(signedIn.session.user, event)) {
        return NextResponse.json({ message: "You can't see this event's bookings", code: 'FORBIDDEN' }, { status: 403 });
    }

    const csv = bookingsCsv(await getAllBookings(event._id));
    return new NextResponse(csv, {
        status: 200,
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${event.slug}-bookings.csv"`,
            // Attendee emails are personal data; never cache them in a shared cache.
            'Cache-Control': 'private, no-store',
        },
    });
}
