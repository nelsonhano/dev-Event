import { Suspense } from "react";
import type {Metadata} from "next";
import Link from "next/link";

import CreateEventForm from "@/components/CreateEventForm";
import FormSkeleton from "@/components/auth/FormSkeleton";
import VerifyEmailNotice from "@/components/auth/VerifyEmailNotice";
import {requireSession} from "@/lib/auth/guards";

export const metadata: Metadata = {
    title: 'Create an event | DevEvent',
    description: 'Share your hackathon, meetup, or conference with the DevEvent community.',
};

// The session part streams inside Suspense (cacheComponents). proxy.ts already sent
// signed out visitors to /sign-in; this is the real check (spec 0001, AC-4, AC-8, AC-23).
async function CreateEventGate() {
    const session = await requireSession('/events/create');

    if (!session.user.emailVerified) {
        return (
            <div className="flex flex-col gap-4">
                <VerifyEmailNotice email={session.user.email} />
                <p className="text-light-200 text-sm">
                    Once your email is confirmed, this page shows the event form. Meanwhile you can visit your{' '}
                    <Link href="/dashboard" className="text-primary underline">dashboard</Link>.
                </p>
            </div>
        );
    }

    return <CreateEventForm defaultOrganizer={session.user.name} />;
}

const CreateEventPage = () => (
    <section id="create-event-page">
        <div className="header">
            <h1>Create an Event</h1>
            <p>Share your hackathon, meetup, or conference. It goes live on the home page as soon as you submit.</p>
        </div>

        <Suspense fallback={<FormSkeleton />}>
            <CreateEventGate />
        </Suspense>
    </section>
);

export default CreateEventPage;
