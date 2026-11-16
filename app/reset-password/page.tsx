import { Suspense } from 'react';
import type { Metadata } from 'next';

import AuthShell from '@/components/auth/AuthShell';
import FormSkeleton from '@/components/auth/FormSkeleton';
import ResetPasswordForm from '@/components/auth/ResetPasswordForm';
import { param, type SearchParams } from '@/lib/auth/search-params';

export const metadata: Metadata = {
    title: 'Choose a new password | DevEvent',
    description: 'Set a new password for your DevEvent account.',
};

async function ResetCard({ searchParams }: { searchParams: SearchParams }) {
    const params = await searchParams;
    // Better Auth sends ?error=INVALID_TOKEN here when the link is bad or expired.
    const token = param(params, 'error') ? null : param(params, 'token');
    return <ResetPasswordForm token={token} />;
}

const ResetPasswordPage = ({ searchParams }: { searchParams: SearchParams }) => (
    <AuthShell heading="Almost back in" intro="Pick a new password. The link in your email works once and expires after 1 hour.">
        <Suspense fallback={<FormSkeleton />}>
            <ResetCard searchParams={searchParams} />
        </Suspense>
    </AuthShell>
);

export default ResetPasswordPage;
