'use client';

import { useState } from 'react';

import { signIn } from '@/lib/auth-client';
import type { SocialProvider } from '@/lib/auth';

const GitHubIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.4-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
);

const GoogleIcon = () => (
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.5 5.5 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.17 3.57-8.81Z" />
        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.3v3.1A12 12 0 0 0 12 24Z" />
        <path fill="#FBBC05" d="M5.29 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.3a12 12 0 0 0 0 10.78l3.99-3.1Z" />
        <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.43-3.43A11.5 11.5 0 0 0 12 0 12 12 0 0 0 1.3 6.61l3.99 3.1C6.23 6.88 8.88 4.77 12 4.77Z" />
    </svg>
);

const LABELS: Record<SocialProvider, { label: string; Icon: () => React.JSX.Element }> = {
    github: { label: 'GitHub', Icon: GitHubIcon },
    google: { label: 'Google', Icon: GoogleIcon },
};

type Props = {
    providers: SocialProvider[];
    callbackURL: string;
    onError: (message: string) => void;
};

const SocialButtons = ({ providers, callbackURL, onError }: Props) => {
    const [pending, setPending] = useState<SocialProvider | null>(null);
    if (providers.length === 0) return null;

    const start = async (provider: SocialProvider) => {
        setPending(provider);
        const { error } = await signIn.social({ provider, callbackURL, errorCallbackURL: '/sign-in' });
        // On success the browser is already leaving for the provider.
        if (error) {
            onError(error.message ?? "We couldn't start that sign in. Please try again.");
            setPending(null);
        }
    };

    return (
        <>
            <div className="social">
                {providers.map((p) => {
                    const { label, Icon } = LABELS[p];
                    return (
                        <button key={p} type="button" onClick={() => start(p)} disabled={pending !== null}>
                            <Icon />
                            {pending === p ? 'Redirecting...' : label}
                        </button>
                    );
                })}
            </div>
            <p className="divider">or with email</p>
        </>
    );
};

export default SocialButtons;
