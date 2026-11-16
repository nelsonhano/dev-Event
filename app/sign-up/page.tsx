import { Suspense } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import AuthShell from '@/components/auth/AuthShell';
import FormSkeleton from '@/components/auth/FormSkeleton';
import SignUpForm from '@/components/auth/SignUpForm';
import { configuredProviders } from '@/lib/auth';
import { getSession } from '@/lib/auth/guards';
import { safeCallback } from '@/lib/auth/safe-callback';
import { param, type SearchParams } from '@/lib/auth/search-params';

export const metadata: Metadata = {
    title: 'Create an organiser account | DevEvent',
    description: 'Sign up to post your hackathon, meetup, or conference on DevEvent.',
};

async function SignUpCard({ searchParams }: { searchParams: SearchParams }) {
    const callbackURL = safeCallback(param(await searchParams, 'callbackURL'));
    if (await getSession()) redirect(callbackURL);
    return <SignUpForm providers={configuredProviders()} callbackURL={callbackURL} />;
}

const SignUpPage = ({ searchParams }: { searchParams: SearchParams }) => (
    <AuthShell heading="Bring your event to every dev" intro="Create a free organiser account. Attendees still book with just their email.">
        <Suspense fallback={<FormSkeleton />}>
            <SignUpCard searchParams={searchParams} />
        </Suspense>
    </AuthShell>
);

export default SignUpPage;
