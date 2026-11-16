'use client';

import { useState } from 'react';
import Link from 'next/link';

import { authClient } from '@/lib/auth-client';
import { readRetryAfter, retryMessage } from '@/lib/auth/messages';

const ForgotPasswordForm = () => {
    const [sentTo, setSentTo] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [isPending, setIsPending] = useState(false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (isPending) return;
        const email = String(new FormData(e.currentTarget).get('email') ?? '').trim();

        setIsPending(true);
        setFormError(null);
        let retryAfter: number | null = null;
        const { error } = await authClient.requestPasswordReset(
            { email, redirectTo: '/reset-password' },
            { onError: (ctx) => { retryAfter = readRetryAfter(ctx.response); } },
        );
        setIsPending(false);

        // The same answer whether or not the account exists (spec 0001, AC-5).
        if (!error) setSentTo(email);
        else if (error.status === 429) setFormError(retryMessage(retryAfter));
        else setFormError('Something went wrong. Please try again.');
    };

    return (
        <>
            <div className="card-header">
                <h2>Reset your password</h2>
                <p>Enter the email you signed up with and we’ll send you a link.</p>
            </div>

            {sentTo ? (
                <p role="status" className="form-success">
                    If an account with a password exists for <strong>{sentTo}</strong>, a reset link is on its way.
                    It expires in 1 hour. If you signed up with GitHub or Google, sign in with them instead.
                </p>
            ) : (
                <form onSubmit={handleSubmit} aria-busy={isPending}>
                    <div className="field">
                        <label htmlFor="email">Email</label>
                        <input id="email" name="email" type="email" autoComplete="email" required disabled={isPending} />
                    </div>

                    {formError && <p role="alert" className="form-alert">{formError}</p>}

                    <button type="submit" disabled={isPending}>{isPending ? 'Sending...' : 'Send reset link'}</button>
                </form>
            )}

            <p className="switch">
                Remembered it? <Link href="/sign-in">Back to sign in</Link>
            </p>
        </>
    );
};

export default ForgotPasswordForm;
