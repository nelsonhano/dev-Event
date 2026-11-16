import { Suspense } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import AuthShell from '@/components/auth/AuthShell';
import FormSkeleton from '@/components/auth/FormSkeleton';
import SignInForm from '@/components/auth/SignInForm';
import { configuredProviders } from '@/lib/auth';
import { getSession } from '@/lib/auth/guards';
import { authErrorMessage } from '@/lib/auth/messages';
import { decodeBanNotice } from '@/lib/auth/ban-notice';
import { safeCallback } from '@/lib/auth/safe-callback';
import { param, type SearchParams } from '@/lib/auth/search-params';

export const metadata: Metadata = {
    title: 'Sign in | DevEvent',
    description: 'Sign in to publish and manage your events on DevEvent.',
};

async function SignInCard({ searchParams }: { searchParams: SearchParams }) {
    const params = await searchParams;
    const callbackURL = safeCallback(param(params, 'callbackURL'));
    const error = param(params, 'error');

    // GitHub and Google bans arrive as ?error=BANNED_USER with the signed notice in
    // error_description; every sign in method ends on the same URL (spec 0001, AC-18).
    if (error && error !== 'banned' && error.toUpperCase() === 'BANNED_USER') {
        redirect(`/sign-in?error=banned&ban=${encodeURIComponent(param(params, 'error_description') ?? '')}`);
    }
    if (error === 'banned') {
        const notice = decodeBanNotice(param(params, 'ban'));
        return <SignInForm providers={configuredProviders()} callbackURL={callbackURL} initialError={null} ban={{ notice }} />;
    }

    // Already signed in: go straight on, unless we're here to explain an error.
    if (!error && (await getSession())) redirect(callbackURL);

    return <SignInForm providers={configuredProviders()} callbackURL={callbackURL} initialError={authErrorMessage(error)} />;
}

const SignInPage = ({ searchParams }: { searchParams: SearchParams }) => (
    <AuthShell heading="Your events, your dashboard" intro="Sign in to publish events, update them, and see everyone who booked.">
        <Suspense fallback={<FormSkeleton />}>
            <SignInCard searchParams={searchParams} />
        </Suspense>
    </AuthShell>
);

export default SignInPage;
