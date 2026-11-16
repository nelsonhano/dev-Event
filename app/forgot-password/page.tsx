import type { Metadata } from 'next';

import AuthShell from '@/components/auth/AuthShell';
import ForgotPasswordForm from '@/components/auth/ForgotPasswordForm';

export const metadata: Metadata = {
    title: 'Forgot password | DevEvent',
    description: 'Get a link to reset your DevEvent password.',
};

const ForgotPasswordPage = () => (
    <AuthShell heading="Locked out? It happens" intro="We’ll email you a link to choose a new password. Your events stay exactly as they are.">
        <ForgotPasswordForm />
    </AuthShell>
);

export default ForgotPasswordPage;
