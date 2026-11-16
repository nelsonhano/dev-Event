'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { setAdminRole, unbanUser } from '@/lib/actions/admin.actions';

type Props =
    | { kind: 'unban'; userId: string; label?: string }
    | { kind: 'role'; userId: string; makeAdmin: boolean; label?: string };

/** Unban, promote, or demote, with the result shown inline (spec 0001, AC-16, AC-18). */
const ModerationButton = (props: Props) => {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const label =
        props.label ?? (props.kind === 'unban' ? 'Unban' : props.makeAdmin ? 'Make admin' : 'Remove admin');

    const run = () =>
        startTransition(async () => {
            setError(null);
            const result =
                props.kind === 'unban' ? await unbanUser(props.userId) : await setAdminRole(props.userId, props.makeAdmin);
            if (!result.ok) setError(result.message);
            else router.refresh();
        });

    const tone = props.kind === 'role' && !props.makeAdmin ? 'danger' : '';
    return (
        <span className="mod-action">
            <button type="button" className={`mod-btn ${tone}`} onClick={run} disabled={isPending}>
                {isPending ? 'Working...' : label}
            </button>
            {error && <span role="alert" className="mod-error">{error}</span>}
        </span>
    );
};

export default ModerationButton;
