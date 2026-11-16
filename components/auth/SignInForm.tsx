'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { signIn } from '@/lib/auth-client';
import type { SocialProvider } from '@/lib/auth';
import { readRetryAfter, retryMessage } from '@/lib/auth/messages';
import SocialButtons from '@/components/auth/SocialButtons';
import type { BanNotice } from '@/lib/auth/ban-notice';

type Props = {
    providers: SocialProvider[];
    callbackURL: string;
    initialError: string | null;
    /** Set on /sign-in?error=banned; `notice` is null when the token is missing, forged, or stale. */
    ban?: { notice: BanNotice | null };
};

const formatUntil = (iso: string) =>
    new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** "Your account is suspended", with the reason and expiry when the signed notice is valid (AC-18). */
const BanPanel = ({ notice }: { notice: BanNotice | null }) => (
    <div role="alert" className="form-alert ban-panel">
        <p className="font-semibold">Your account is suspended.</p>
        {notice ? (
            <>
                <p>{notice.expiresAt ? `It is suspended until ${formatUntil(notice.expiresAt)}.` : 'The suspension is permanent.'}</p>
                {notice.reason && <p>Reason: {notice.reason}</p>}
            </>
        ) : (
            <p>You can&apos;t sign in while it is suspended. We emailed you the details.</p>
        )}
    </div>
);

const SignInForm = ({ providers, callbackURL, initialError, ban }: Props) => {
    const router = useRouter();
    const [formError, setFormError] = useState<string | null>(initialError);
    const [isPending, setIsPending] = useState(false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (isPending) return;
        const form = new FormData(e.currentTarget);

        setIsPending(true);
        setFormError(null);
        let retryAfter: number | null = null;
        const { error } = await signIn.email(
            { email: String(form.get('email') ?? '').trim(), password: String(form.get('password') ?? '') },
            { onError: (ctx) => { retryAfter = readRetryAfter(ctx.response); } },
        );

        if (!error) {
            router.replace(callbackURL);
            router.refresh();
            return;
        }

        if (error.code === 'BANNED_USER') {
            // The plugin's message is the signed ban notice (lib/auth.ts).
            router.replace(`/sign-in?error=banned&ban=${encodeURIComponent(error.message ?? '')}`);
            setIsPending(false);
            return;
        }
        if (error.status === 429) setFormError(retryMessage(retryAfter));
        else if (error.status === 401) setFormError('That email and password don’t match an account.');
        else setFormError(error.message ?? 'Something went wrong. Please try again.');
        setIsPending(false);
    };

    const signUpHref = `/sign-up?callbackURL=${encodeURIComponent(callbackURL)}`;

    return (
        <>
            <div className="card-header">
                <h2>Sign in</h2>
                <p>Welcome back. Pick up where you left off.</p>
            </div>

            {ban && <BanPanel notice={ban.notice} />}

            <SocialButtons providers={providers} callbackURL={callbackURL} onError={setFormError} />

            <form onSubmit={handleSubmit} aria-busy={isPending}>
                <div className="field">
                    <label htmlFor="email">Email</label>
                    <input id="email" name="email" type="email" autoComplete="email" required disabled={isPending} />
                </div>

                <div className="field">
                    <div className="label-row">
                        <label htmlFor="password">Password</label>
                        <Link href="/forgot-password">Forgot password?</Link>
                    </div>
                    <input id="password" name="password" type="password" autoComplete="current-password" required disabled={isPending} />
                </div>

                {formError && <p role="alert" className="form-alert">{formError}</p>}

                <button type="submit" disabled={isPending}>{isPending ? 'Signing in...' : 'Sign in'}</button>
            </form>

            <p className="switch">
                New to DevEvent? <Link href={signUpHref}>Create an account</Link>
            </p>
        </>
    );
};

export default SignInForm;
