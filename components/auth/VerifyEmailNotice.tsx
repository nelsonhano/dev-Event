'use client';

import { useState } from 'react';

import { authClient } from '@/lib/auth-client';
import { readRetryAfter, retryMessage } from '@/lib/auth/messages';

/** "Confirm your email to publish events" with a resend button (spec 0001, AC-4). */
const VerifyEmailNotice = ({ email, message }: { email: string; message?: string }) => {
    const [status, setStatus] = useState<string | null>(null);
    const [isPending, setIsPending] = useState(false);

    const resend = async () => {
        setIsPending(true);
        setStatus(null);
        let retryAfter: number | null = null;
        const { error } = await authClient.sendVerificationEmail(
            { email, callbackURL: '/verify-email' },
            { onError: (ctx) => { retryAfter = readRetryAfter(ctx.response); } },
        );
        setIsPending(false);
        if (!error) setStatus(`Sent. Check your inbox at ${email}.`);
        else if (error.status === 429) setStatus(retryMessage(retryAfter).replace('Too many attempts. ', ''));
        else setStatus("We couldn't send it right now. Please try again.");
    };

    return (
        <div className="verify-notice" role="region" aria-label="Email not confirmed">
            <p>{message ?? `Confirm your email to publish events. We sent a link to ${email}.`}</p>
            <button type="button" onClick={resend} disabled={isPending}>
                {isPending ? 'Sending...' : 'Resend email'}
            </button>
            {status && <p role="status" className="status">{status}</p>}
        </div>
    );
};

export default VerifyEmailNotice;
