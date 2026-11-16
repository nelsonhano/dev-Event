// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/actions/booking.actions', () => ({ createBooking: vi.fn() }));
vi.mock('posthog-js', () => ({ default: { capture: vi.fn() } }));

import posthog from 'posthog-js';
import { createBooking, type BookingResult } from '@/lib/actions/booking.actions';
import BookEvent from './BookEvent';

const EVENT_ID = '665f1c2ab3d4e5f6a7b8c9d0';

async function submitEmail(email = 'ada@example.com') {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email Address'), email);
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    return user;
}

beforeEach(() => {
    vi.mocked(createBooking).mockReset().mockResolvedValue({ success: true });
    vi.mocked(posthog.capture).mockClear();
});

describe('BookEvent', () => {
    it('shows a labelled email field and a submit button', () => {
        render(<BookEvent eventId={EVENT_ID} />);

        expect(screen.getByLabelText('Email Address')).toHaveAttribute('type', 'email');
        expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();
    });

    it('books the event with the typed email and thanks the user', async () => {
        render(<BookEvent eventId={EVENT_ID} />);

        await submitEmail('ada@example.com');

        expect(await screen.findByText('Thank you for signing up!')).toBeInTheDocument();
        expect(createBooking).toHaveBeenCalledWith({ eventId: EVENT_ID, email: 'ada@example.com' });
        expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
    });

    it('records the booking in analytics without the email address', async () => {
        render(<BookEvent eventId={EVENT_ID} />);

        await submitEmail('ada@example.com');
        await screen.findByText('Thank you for signing up!');

        expect(posthog.capture).toHaveBeenCalledWith('event_booked', { eventId: EVENT_ID });
        expect(JSON.stringify(vi.mocked(posthog.capture).mock.calls)).not.toContain('ada@example.com');
    });

    it('shows the server message as an alert tied to the field when booking fails', async () => {
        vi.mocked(createBooking).mockResolvedValue({
            success: false,
            message: "You've already booked this event with that email.",
        });
        render(<BookEvent eventId={EVENT_ID} />);

        await submitEmail();

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent("You've already booked this event with that email.");
        const input = screen.getByLabelText('Email Address');
        expect(input).toHaveAttribute('aria-invalid', 'true');
        expect(input).toHaveAccessibleDescription("You've already booked this event with that email.");
        expect(posthog.capture).toHaveBeenCalledWith('event_booking_failed', { eventId: EVENT_ID });
    });

    it('clears the old error when the user tries again and succeeds', async () => {
        vi.mocked(createBooking)
            .mockResolvedValueOnce({ success: false, message: "You've already booked this event with that email." })
            .mockResolvedValueOnce({ success: true });
        render(<BookEvent eventId={EVENT_ID} />);
        const user = await submitEmail('ada@example.com');
        await screen.findByRole('alert');

        await user.clear(screen.getByLabelText('Email Address'));
        await user.type(screen.getByLabelText('Email Address'), 'grace@example.com');
        await user.click(screen.getByRole('button', { name: 'Submit' }));

        expect(await screen.findByText('Thank you for signing up!')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it.each(['', 'ada@'])('does not call the server for an empty or malformed email %j', async (email) => {
        const user = userEvent.setup();
        render(<BookEvent eventId={EVENT_ID} />);
        if (email) await user.type(screen.getByLabelText('Email Address'), email);

        await user.click(screen.getByRole('button', { name: 'Submit' }));

        expect(createBooking).not.toHaveBeenCalled();
        expect(screen.getByLabelText('Email Address')).toBeInvalid();
    });

    it('locks the form while the booking is in flight, so it cannot be sent twice', async () => {
        let finish!: (result: BookingResult) => void;
        vi.mocked(createBooking).mockReturnValue(new Promise((resolve) => (finish = resolve)));
        render(<BookEvent eventId={EVENT_ID} />);

        await submitEmail();

        const button = await screen.findByRole('button', { name: 'Booking...' });
        expect(button).toBeDisabled();
        expect(button).toHaveAttribute('aria-busy', 'true');
        expect(screen.getByLabelText('Email Address')).toBeDisabled();
        expect(createBooking).toHaveBeenCalledTimes(1);

        finish({ success: true });
        expect(await screen.findByText('Thank you for signing up!')).toBeInTheDocument();
    });
});
