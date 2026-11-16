import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import CreateEventForm from '@/components/CreateEventForm';
import DeleteEventButton from '@/components/DeleteEventButton';
import FormSkeleton from '@/components/auth/FormSkeleton';
import VerifyEmailNotice from '@/components/auth/VerifyEmailNotice';
import AccessDenied from '@/components/dashboard/AccessDenied';
import { requireSession } from '@/lib/auth/guards';
import { canDeleteEvent, canEditEvent, isOwner } from '@/lib/auth/policy';
import { countBookings, getEventForManage } from '@/lib/events/dashboard';

export const metadata: Metadata = {
    title: 'Edit event | DevEvent',
    description: 'Update the details of your event.',
};

type Params = Promise<{ slug: string }>;

// Edit an event (spec 0001, AC-11): the owner (verified) or the super admin.
async function EditEvent({ params }: { params: Params }) {
    const { slug } = await params;
    const session = await requireSession(`/dashboard/events/${slug}/edit`);
    const event = await getEventForManage(slug);
    if (!event) notFound();

    const user = session.user;
    if (!canEditEvent(user, event)) {
        if (isOwner(user, event) && !user.emailVerified) {
            return (
                <div className="flex flex-col gap-4">
                    <VerifyEmailNotice email={user.email} message={`Confirm your email to edit events. We sent a link to ${user.email}.`} />
                    <p className="text-light-200 text-sm">You can still delete this event or see its bookings from your dashboard.</p>
                </div>
            );
        }
        return <AccessDenied message="Only the organiser who created this event can edit it." />;
    }

    const bookingCount = await countBookings(event._id);
    // Only what the form shows goes to the browser.
    const { title, description, overview, image, venue, location, date, time, mode, audience, organizer, agenda, tags } = event;
    const values = { title, description, overview, image, venue, location, date, time, mode, audience, organizer, agenda, tags };

    return (
        <>
            <div className="header">
                <div>
                    <h1>Edit event</h1>
                    <p>
                        {bookingCount > 0
                            ? `Changing the date, time, venue, location, or mode emails all ${bookingCount} attendee${bookingCount === 1 ? '' : 's'}.`
                            : 'Changes go live as soon as you save. The link stays the same.'}
                    </p>
                </div>
                {canDeleteEvent(user, event) && (
                    <DeleteEventButton slug={event.slug} title={event.title} bookingCount={bookingCount} label="Delete event" />
                )}
            </div>
            <CreateEventForm edit={{ slug: event.slug, values }} />
        </>
    );
}

const EditEventPage = ({ params }: { params: Params }) => (
    <section id="dashboard" className="edit">
        <Link href="/dashboard" className="back"><ArrowLeft aria-hidden="true" /> Dashboard</Link>
        <Suspense fallback={<FormSkeleton />}>
            <EditEvent params={params} />
        </Suspense>
    </section>
);

export default EditEventPage;
