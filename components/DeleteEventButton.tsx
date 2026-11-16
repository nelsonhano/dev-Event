'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';

type Props = {
    slug: string;
    title: string;
    bookingCount: number;
    /** Text for the trigger button; the dashboard row uses a shorter one. */
    label?: string;
};

/** Delete with a confirm dialog (spec 0001, AC-13). On success it lands on /dashboard. */
const DeleteEventButton = ({ slug, title, bookingCount, label = 'Delete' }: Props) => {
    const router = useRouter();
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [isPending, setIsPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const open = () => {
        setError(null);
        dialogRef.current?.showModal();
    };

    const close = () => {
        if (!isPending) dialogRef.current?.close();
    };

    const confirm = async () => {
        setIsPending(true);
        setError(null);
        try {
            const res = await fetch(`/api/events/${encodeURIComponent(slug)}`, { method: 'DELETE' });
            if (res.status === 204) {
                dialogRef.current?.close();
                router.push('/dashboard');
                router.refresh();
                return;
            }
            const data: { message?: string } = await res.json().catch(() => ({}));
            setError(data.message ?? 'Something went wrong. Please try again.');
        } catch {
            setError('Could not reach the server. Check your connection and try again.');
        }
        setIsPending(false);
    };

    const titleId = `delete-${slug}-title`;
    const bookings = `${bookingCount} booking${bookingCount === 1 ? '' : 's'}`;

    return (
        <>
            <button type="button" className="delete-trigger" onClick={open}>
                <Trash2 aria-hidden="true" />
                {label}
            </button>

            <dialog ref={dialogRef} className="confirm-dialog" aria-labelledby={titleId} onCancel={(e) => { if (isPending) e.preventDefault(); }}>
                <h2 id={titleId}>Delete {title}?</h2>
                <p>This cancels {bookings} and emails every attendee. This can&apos;t be undone.</p>
                {error && <p role="alert" className="form-alert">{error}</p>}
                <div className="actions">
                    <button type="button" className="secondary" onClick={close} disabled={isPending}>Keep event</button>
                    <button type="button" className="danger" onClick={confirm} disabled={isPending}>
                        {isPending ? 'Deleting...' : 'Delete event'}
                    </button>
                </div>
            </dialog>
        </>
    );
};

export default DeleteEventButton;
