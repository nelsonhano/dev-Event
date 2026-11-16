'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ban } from 'lucide-react';

import { banUser } from '@/lib/actions/admin.actions';

const REASON_MAX = 500;
const HOUR = 60 * 60 * 1000;
const YEAR = 365 * 24 * HOUR;

/** A Date as the value a datetime-local input expects, in the viewer's own time zone. */
const toLocalInput = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

type Props = { user: { id: string; email: string; banned: boolean; banReason: string | null } };

/**
 * Ban, or update a ban (spec 0001, AC-18). Reason 1 to 500 characters; empty expiry means
 * permanent, else 1 hour to 1 year ahead, picked in the admin's local time and sent as UTC.
 */
const BanDialog = ({ user }: Props) => {
    const router = useRouter();
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [limits, setLimits] = useState<{ min: string; max: string } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPending, setIsPending] = useState(false);

    const open = () => {
        const now = Date.now();
        // Computed when opened (not at render), so the bounds are current and match the viewer's clock.
        setLimits({ min: toLocalInput(new Date(now + HOUR + 60_000)), max: toLocalInput(new Date(now + YEAR)) });
        setError(null);
        dialogRef.current?.showModal();
    };

    const submit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const reason = String(form.get('reason') ?? '').trim();
        const until = String(form.get('until') ?? '');
        if (!reason) return setError('Give a reason. The user sees it.');

        setIsPending(true);
        setError(null);
        const result = await banUser({ userId: user.id, reason, expiresAt: until ? new Date(until).toISOString() : null });
        setIsPending(false);
        if (!result.ok) return setError(result.message);
        dialogRef.current?.close();
        router.refresh();
    };

    const titleId = `ban-${user.id}`;
    return (
        <>
            <button type="button" className="mod-btn danger" onClick={open}>
                <Ban aria-hidden="true" /> {user.banned ? 'Edit ban' : 'Ban'}
            </button>
            <dialog ref={dialogRef} className="confirm-dialog" aria-labelledby={titleId} onCancel={(e) => { if (isPending) e.preventDefault(); }}>
                <h2 id={titleId}>{user.banned ? 'Update the ban on' : 'Ban'} {user.email}?</h2>
                <p>They are signed out everywhere, can&apos;t sign in, and their events are hidden. They get an email with the reason.</p>
                <form onSubmit={submit} className="ban-form">
                    <label htmlFor={`${titleId}-reason`}>Reason</label>
                    <textarea
                        id={`${titleId}-reason`} name="reason" required maxLength={REASON_MAX} rows={3}
                        defaultValue={user.banReason ?? ''} placeholder="Posting spam events" disabled={isPending}
                    />
                    <label htmlFor={`${titleId}-until`}>Until (your local time)</label>
                    <input id={`${titleId}-until`} name="until" type="datetime-local" min={limits?.min} max={limits?.max} disabled={isPending} />
                    <p className="hint">Leave empty for a permanent ban. At least 1 hour, at most 1 year.</p>
                    {error && <p role="alert" className="form-alert">{error}</p>}
                    <div className="actions">
                        <button type="button" className="secondary" onClick={() => dialogRef.current?.close()} disabled={isPending}>Cancel</button>
                        <button type="submit" className="danger" disabled={isPending}>{isPending ? 'Saving...' : user.banned ? 'Update ban' : 'Ban user'}</button>
                    </div>
                </form>
            </dialog>
        </>
    );
};

export default BanDialog;
