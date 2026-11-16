import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Download, Inbox } from 'lucide-react';

import FormSkeleton from '@/components/auth/FormSkeleton';
import AccessDenied from '@/components/dashboard/AccessDenied';
import Pager from '@/components/dashboard/Pager';
import { requireSession } from '@/lib/auth/guards';
import { canViewBookings } from '@/lib/auth/policy';
import { param, type SearchParams } from '@/lib/auth/search-params';
import { getBookingsPage, getEventForManage } from '@/lib/events/dashboard';

export const metadata: Metadata = {
    title: 'Bookings | DevEvent',
    description: 'Everyone who booked your event.',
};

type Params = Promise<{ slug: string }>;

// Bookings (spec 0001, AC-14): owner, any admin, or the super admin. 50 per page,
// newest first, times in UTC ISO. No public visibility filter, so events hidden
// by a ban stay reachable here.
async function Bookings({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
    const { slug } = await params;
    const session = await requireSession(`/dashboard/events/${slug}/bookings`);
    const event = await getEventForManage(slug);
    if (!event) notFound();
    if (!canViewBookings(session.user, event)) {
        return <AccessDenied message="Only the organiser of this event and DevEvent admins can see who booked." />;
    }

    const { items, page, totalPages, total } = await getBookingsPage(event._id, param(await searchParams, 'page'));
    const basePath = `/dashboard/events/${event.slug}/bookings`;

    return (
        <>
            <div className="header">
                <div>
                    <h1>Bookings</h1>
                    <p>
                        <Link href={`/events/${event.slug}`} className="text-primary hover:underline">{event.title}</Link>
                        {' · '}{total} booking{total === 1 ? '' : 's'}
                    </p>
                </div>
                {total > 0 && (
                    // A plain link, so the browser downloads the attachment with the session cookie.
                    <a href={`/api/events/${encodeURIComponent(event.slug)}/bookings.csv`} className="create-btn" download>
                        <Download aria-hidden="true" /> Download CSV
                    </a>
                )}
            </div>

            {total === 0 ? (
                <div className="empty">
                    <Inbox aria-hidden="true" />
                    <h2>No bookings yet</h2>
                    <p>When someone books this event, their email and booking time show up here.</p>
                </div>
            ) : (
                <>
                    <div className="table-wrap">
                        <table className="bookings">
                            <caption className="sr-only">Bookings for {event.title}, newest first</caption>
                            <thead>
                                <tr>
                                    <th scope="col">Email</th>
                                    <th scope="col">Booked at (UTC)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((b) => (
                                    <tr key={b._id}>
                                        <td>{b.email}</td>
                                        <td><time dateTime={b.bookedAt}>{b.bookedAt}</time></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Pager page={page} totalPages={totalPages} basePath={basePath} label="Bookings pages" />
                </>
            )}
        </>
    );
}

const BookingsPage = ({ params, searchParams }: { params: Params; searchParams: SearchParams }) => (
    <section id="dashboard">
        <Link href="/dashboard" className="back"><ArrowLeft aria-hidden="true" /> Dashboard</Link>
        <Suspense fallback={<FormSkeleton />}>
            <Bookings params={params} searchParams={searchParams} />
        </Suspense>
    </section>
);

export default BookingsPage;
