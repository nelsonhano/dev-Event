'use client';

import {useState, useTransition} from "react";
import {createBooking} from "@/lib/actions/booking.actions";
import posthog from "posthog-js";

const BookEvent = ({ eventId }: { eventId: string }) => {
    const [email, setEmail] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (isPending) return;
        setError(null);

        startTransition(async () => {
            const result = await createBooking({ eventId, email });

            if (result.success) {
                setSubmitted(true);
                // No email here: keep personal data out of analytics.
                posthog.capture('event_booked', { eventId });
            } else {
                setError(result.message);
                posthog.capture('event_booking_failed', { eventId });
            }
        });
    }

    return (
        <div id="book-event">
            {submitted ? (
                <p className="text-sm">Thank you for signing up!</p>
            ): (
                <form onSubmit={handleSubmit}>
                    <div>
                        <label htmlFor="email">Email Address</label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            id="email"
                            placeholder="Enter your email address"
                            aria-invalid={error ? true : undefined}
                            aria-describedby={error ? 'book-event-error' : undefined}
                            disabled={isPending}
                        />
                    </div>

                    {error && (
                        <p id="book-event-error" role="alert" className="text-sm text-red-400">{error}</p>
                    )}

                    <button type="submit" className="button-submit" disabled={isPending} aria-busy={isPending}>
                        {isPending ? 'Booking...' : 'Submit'}
                    </button>
                </form>
            )}
        </div>
    )
}
export default BookEvent
