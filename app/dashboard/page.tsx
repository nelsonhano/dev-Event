import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarDays, Plus } from 'lucide-react';

import VerifyEmailNotice from '@/components/auth/VerifyEmailNotice';
import FormSkeleton from '@/components/auth/FormSkeleton';
import DeleteEventButton from '@/components/DeleteEventButton';
import Pager from '@/components/dashboard/Pager';
import { requireSession } from '@/lib/auth/guards';
import { param, type SearchParams } from '@/lib/auth/search-params';
import { getOwnEventsPage } from '@/lib/events/dashboard';

export const metadata: Metadata = {
    title: 'Dashboard | DevEvent',
    description: 'Manage the events you organise on DevEvent.',
};

// The organiser dashboard (spec 0001, AC-4, AC-10): own events newest created first,
// 20 per page, with booking counts and View, Edit, Bookings, and Delete per row.
async function DashboardContent({ searchParams }: { searchParams: SearchParams }) {
    const session = await requireSession('/dashboard');
    const { items, page, totalPages, total } = await getOwnEventsPage(session.user.id, param(await searchParams, 'page'));
    const verified = session.user.emailVerified;
    const firstName = session.user.name.split(' ')[0];

    return (
        <>
            <div className="header">
                <div>
                    <h1>Hi, {firstName}</h1>
                    <p>{total === 0 ? 'Your events will show up here.' : `${total} event${total === 1 ? '' : 's'}, newest first.`}</p>
                </div>
                {verified && total > 0 && (
                    <Link href="/events/create" className="create-btn">
                        <Plus aria-hidden="true" /> Create event
                    </Link>
                )}
            </div>

            {!verified && <VerifyEmailNotice email={session.user.email} />}

            {total === 0 ? (
                <div className="empty">
                    <CalendarDays aria-hidden="true" />
                    <h2>You haven&apos;t created any events yet</h2>
                    <p>Post your first meetup, hackathon, or conference. It goes live on the home page right away.</p>
                    <Link href="/events/create" className="create-btn">
                        <Plus aria-hidden="true" /> Create event
                    </Link>
                </div>
            ) : (
                <>
                    <ul className="own-events" aria-label="Your events">
                        {items.map((e) => (
                            <li key={e._id}>
                                <div className="info">
                                    <p className="title">{e.title}</p>
                                    <p className="meta">
                                        {e.date} · {e.time} ·{' '}
                                        <span className="count">{e.bookingCount} booking{e.bookingCount === 1 ? '' : 's'}</span>
                                    </p>
                                </div>
                                <div className="row-actions">
                                    <Link href={`/events/${e.slug}`}>View</Link>
                                    <Link href={`/dashboard/events/${e.slug}/edit`}>Edit</Link>
                                    <Link href={`/dashboard/events/${e.slug}/bookings`}>Bookings</Link>
                                    <DeleteEventButton slug={e.slug} title={e.title} bookingCount={e.bookingCount} />
                                </div>
                            </li>
                        ))}
                    </ul>
                    <Pager page={page} totalPages={totalPages} basePath="/dashboard" label="Your events pages" />
                </>
            )}
        </>
    );
}

const DashboardPage = ({ searchParams }: { searchParams: SearchParams }) => (
    <section id="dashboard">
        <Suspense fallback={<FormSkeleton />}>
            <DashboardContent searchParams={searchParams} />
        </Suspense>
    </section>
);

export default DashboardPage;
