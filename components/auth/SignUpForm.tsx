'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { signUp } from '@/lib/auth-client';
import type { SocialProvider } from '@/lib/auth';
import { readRetryAfter, retryMessage } from '@/lib/auth/messages';
import SocialButtons from '@/components/auth/SocialButtons';

// Mirrors NAME_* and PASSWORD_* in lib/auth.ts (spec 0001, AC-1).
const NAME_MAX = 100;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

type FieldErrors = Partial<Record<'name' | 'email' | 'password', string>>;

type Props = {
    providers: SocialProvider[];
    callbackURL: string;
};

const SignUpForm = ({ providers, callbackURL }: Props) => {
    const router = useRouter();
    const [errors, setErrors] = useState<FieldErrors>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [isPending, setIsPending] = useState(false);

    const fieldProps = (name: keyof FieldErrors) => ({
        id: name,
        name,
        disabled: isPending,
        'aria-invalid': errors[name] ? true : undefined,
        'aria-describedby': errors[name] ? `${name}-error` : `${name}-hint`,
    });

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (isPending) return;
        const form = new FormData(e.currentTarget);
        const name = String(form.get('name') ?? '').trim();
        const email = String(form.get('email') ?? '').trim();
        const password = String(form.get('password') ?? '');

        const next: FieldErrors = {};
        if (name.length < 1 || name.length > NAME_MAX) next.name = `Use 1 to ${NAME_MAX} characters.`;
        if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
            next.password = `Use ${PASSWORD_MIN} to ${PASSWORD_MAX} characters.`;
        }
        setErrors(next);
        setFormError(null);
        if (Object.keys(next).length > 0) return;

        setIsPending(true);
        let retryAfter: number | null = null;
        const { error } = await signUp.email(
            // The verification link comes back through /verify-email, which forwards to the dashboard.
            { name, email, password, callbackURL: '/verify-email' },
            { onError: (ctx) => { retryAfter = readRetryAfter(ctx.response); } },
        );

        if (!error) {
            router.replace(callbackURL);
            router.refresh();
            return;
        }

        if (error.status === 429) setFormError(retryMessage(retryAfter));
        else if (error.code === 'USER_ALREADY_EXISTS' || error.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') {
            setErrors({ email: 'An account with this email already exists. Sign in instead.' });
        } else setFormError(error.message ?? 'Something went wrong. Please try again.');
        setIsPending(false);
    };

    return (
        <>
            <div className="card-header">
                <h2>Create your organiser account</h2>
                <p>Free, and it takes under a minute.</p>
            </div>

            <SocialButtons providers={providers} callbackURL={callbackURL} onError={setFormError} />

            <form onSubmit={handleSubmit} aria-busy={isPending}>
                <div className="field">
                    <label htmlFor="name">Name</label>
                    <input type="text" autoComplete="name" required maxLength={NAME_MAX} {...fieldProps('name')} />
                    {errors.name
                        ? <p id="name-error" className="field-error">{errors.name}</p>
                        : <p id="name-hint" className="hint">Shown as the organiser on your events. You can change it per event.</p>}
                </div>

                <div className="field">
                    <label htmlFor="email">Email</label>
                    <input type="email" autoComplete="email" required {...fieldProps('email')} />
                    {errors.email
                        ? <p id="email-error" className="field-error">{errors.email}</p>
                        : <p id="email-hint" className="hint">We’ll send a link to confirm it before you publish.</p>}
                </div>

                <div className="field">
                    <label htmlFor="password">Password</label>
                    <input type="password" autoComplete="new-password" required minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} {...fieldProps('password')} />
                    {errors.password
                        ? <p id="password-error" className="field-error">{errors.password}</p>
                        : <p id="password-hint" className="hint">At least {PASSWORD_MIN} characters.</p>}
                </div>

                {formError && <p role="alert" className="form-alert">{formError}</p>}

                <button type="submit" disabled={isPending}>{isPending ? 'Creating account...' : 'Create account'}</button>
            </form>

            <p className="switch">
                Already have an account? <Link href={`/sign-in?callbackURL=${encodeURIComponent(callbackURL)}`}>Sign in</Link>
            </p>
        </>
    );
};

export default SignUpForm;
