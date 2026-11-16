'use client';

import { useState } from 'react';
import Link from 'next/link';

import { authClient } from '@/lib/auth-client';

// Mirrors PASSWORD_* in lib/auth.ts (spec 0001, AC-5 uses the AC-1 rule).
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

const ResetPasswordForm = ({ token }: { token: string | null }) => {
    const [done, setDone] = useState(false);
    const [fieldError, setFieldError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(
        token ? null : 'This reset link is invalid or has expired. Ask for a new one.',
    );
    const [isPending, setIsPending] = useState(false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (isPending || !token) return;
        const form = new FormData(e.currentTarget);
        const password = String(form.get('password') ?? '');
        const confirm = String(form.get('confirm') ?? '');

        if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
            setFieldError(`Use ${PASSWORD_MIN} to ${PASSWORD_MAX} characters.`);
            return;
        }
        if (password !== confirm) {
            setFieldError('The two passwords don’t match.');
            return;
        }

        setFieldError(null);
        setFormError(null);
        setIsPending(true);
        const { error } = await authClient.resetPassword({ newPassword: password, token });
        setIsPending(false);

        if (!error) setDone(true);
        else if (error.code === 'INVALID_TOKEN') setFormError('This reset link is invalid or has expired. Ask for a new one.');
        else setFormError(error.message ?? 'Something went wrong. Please try again.');
    };

    if (done) {
        return (
            <>
                <div className="card-header">
                    <h2>Password updated</h2>
                    <p>You’ve been signed out everywhere else. Sign in with your new password.</p>
                </div>
                <Link href="/sign-in" className="nav-signin text-center">Go to sign in</Link>
            </>
        );
    }

    return (
        <>
            <div className="card-header">
                <h2>Choose a new password</h2>
                <p>Saving it signs you out of every other device.</p>
            </div>

            <form onSubmit={handleSubmit} aria-busy={isPending}>
                <div className="field">
                    <label htmlFor="password">New password</label>
                    <input
                        id="password" name="password" type="password" autoComplete="new-password" required
                        minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} disabled={isPending || !token}
                        aria-invalid={fieldError ? true : undefined} aria-describedby={fieldError ? 'password-error' : 'password-hint'}
                    />
                    {fieldError
                        ? <p id="password-error" className="field-error">{fieldError}</p>
                        : <p id="password-hint" className="hint">At least {PASSWORD_MIN} characters.</p>}
                </div>

                <div className="field">
                    <label htmlFor="confirm">Confirm new password</label>
                    <input id="confirm" name="confirm" type="password" autoComplete="new-password" required disabled={isPending || !token} />
                </div>

                {formError && (
                    <p role="alert" className="form-alert">
                        {formError} {!token || formError.includes('expired') ? <Link href="/forgot-password" className="underline">Request a new link</Link> : null}
                    </p>
                )}

                <button type="submit" disabled={isPending || !token}>{isPending ? 'Saving...' : 'Save new password'}</button>
            </form>
        </>
    );
};

export default ResetPasswordForm;
