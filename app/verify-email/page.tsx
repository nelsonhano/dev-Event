import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import AuthShell from '@/components/auth/AuthShell';
import FormSkeleton from '@/components/auth/FormSkeleton';
import VerifyEmailNotice from '@/components/auth/VerifyEmailNotice';
import { getSession } from '@/lib/auth/guards';
import { param, type SearchParams } from '@/lib/auth/search-params';

export const metadata: Metadata = {
    title: 'Confirm your email | DevEvent',
    description: 'Confirm your email to publish events on DevEvent.',
};

// The verification link (lib/auth.ts) comes back here. Success forwards to the
// dashboard (spec 0001, AC-1); a bad or expired link shows why, with a resend.
async function VerifyCard({ searchParams }: { searchParams: SearchParams }) {
    const error = param(await searchParams, 'error');
    const session = await getSession();

    if (!error && session?.user.emailVerified) redirect('/dashboard');

    const expired = error?.toUpperCase() === 'TOKEN_EXPIRED';
    const title = error ? (expired ? 'That link has expired' : 'That link didn’t work') : 'Check your inbox';
    const body = error
        ? 'Confirmation links work once and expire after 24 hours. Send yourself a fresh one.'
        : 'Open the link we emailed you to confirm your address. Then you can publish events.';

    return (
        <>
            <div className="card-header">
                <h2>{title}</h2>
                <p>{body}</p>
            </div>
            {session && !session.user.emailVerified ? (
                <VerifyEmailNotice email={session.user.email} message={`We’ll send the link to ${session.user.email}.`} />
            ) : session ? (
                <Link href="/dashboard" className="nav-signin text-center">Go to your dashboard</Link>
            ) : (
                <p className="switch">
                    <Link href="/sign-in?callbackURL=/verify-email">Sign in</Link> to get a new link.
                </p>
            )}
        </>
    );
}

const VerifyEmailPage = ({ searchParams }: { searchParams: SearchParams }) => (
    <AuthShell heading="One quick step" intro="Confirming your email keeps spam off DevEvent, so attendees can trust every event they see.">
        <Suspense fallback={<FormSkeleton />}>
            <VerifyCard searchParams={searchParams} />
        </Suspense>
    </AuthShell>
);

export default VerifyEmailPage;
