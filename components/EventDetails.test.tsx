// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('@/lib/actions/event.actions', () => ({
    getEventBySlug: vi.fn(),
    getBookingCount: vi.fn(),
    getSimilarEventsBySlug: vi.fn(),
}));
vi.mock('@/lib/actions/booking.actions', () => ({ createBooking: vi.fn() }));
vi.mock('posthog-js', () => ({ default: { capture: vi.fn() } }));
vi.mock('next/navigation', () => ({
    notFound: vi.fn(() => {
        throw new Error('NEXT_NOT_FOUND');
    }),
}));

import { notFound } from 'next/navigation';
import {
    getBookingCount,
    getEventBySlug,
    getSimilarEventsBySlug,
    type EventCardDTO,
    type EventDTO,
} from '@/lib/actions/event.actions';
import EventDetails from './EventDetails';

const EVENT: EventDTO = {
    _id: '665f1c2ab3d4e5f6a7b8c9d0',
    title: 'React Summit 2026',
    slug: 'react-summit-2026',
    image: 'https://img.test/react-summit.png',
    location: 'San Francisco, CA',
    date: '2026-05-01',
    time: '09:00',
    description: 'A full day of talks about React.',
    overview: 'Talks, workshops and networking.',
    venue: 'Moscone Center',
    mode: 'offline',
    audience: 'Developers',
    agenda: ['Keynote', 'Workshops'],
    organizer: 'React Org',
    tags: ['react', 'frontend'],
};

const similar = (n: number): EventCardDTO => ({
    _id: `similar-${n}`,
    title: `Similar ${n}`,
    slug: `similar-${n}`,
    image: 'https://img.test/s.png',
    location: 'Online',
    date: '2026-06-01',
    time: '10:00',
});

const renderDetails = async (slug = 'react-summit-2026') =>
    render(await EventDetails({ params: Promise.resolve(slug) }));

beforeEach(() => {
    vi.mocked(getEventBySlug).mockReset().mockResolvedValue(EVENT);
    vi.mocked(getBookingCount).mockReset().mockResolvedValue(0);
    vi.mocked(getSimilarEventsBySlug).mockReset().mockResolvedValue([]);
});

describe('EventDetails', () => {
    it('shows the event heading, description and overview', async () => {
        await renderDetails();

        expect(screen.getByRole('heading', { level: 1, name: 'React Summit 2026' })).toBeInTheDocument();
        expect(screen.getByText('A full day of talks about React.')).toBeInTheDocument();
        expect(screen.getByText('Talks, workshops and networking.')).toBeInTheDocument();
    });

    it('lists the date, time, location, mode, audience, organizer and banner', async () => {
        await renderDetails();

        for (const text of ['2026-05-01', '09:00', 'San Francisco, CA', 'offline', 'Developers', 'React Org']) {
            expect(screen.getByText(text)).toBeInTheDocument();
        }
        expect(screen.getByRole('img', { name: 'React Summit 2026' })).toHaveAttribute('src', EVENT.image);
    });

    it('shows each agenda item in order and each tag', async () => {
        await renderDetails();

        const agenda = screen.getByRole('heading', { name: 'Agenda' }).parentElement!;
        expect(within(agenda).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Keynote', 'Workshops']);
        expect(screen.getByText('react')).toBeInTheDocument();
        expect(screen.getByText('frontend')).toBeInTheDocument();
    });

    it('invites the first booking when nobody has booked yet', async () => {
        await renderDetails();

        expect(screen.getByText('Be the first to book your spot!')).toBeInTheDocument();
    });

    it('shows how many people booked when there are bookings', async () => {
        vi.mocked(getBookingCount).mockResolvedValue(12);

        await renderDetails();

        expect(screen.getByText('Join 12 people who have already booked their spot!')).toBeInTheDocument();
    });

    it('shows the booking form for anonymous visitors', async () => {
        await renderDetails();

        expect(screen.getByLabelText('Email Address')).toBeInTheDocument();
    });

    it('asks for the count and similar events using the loaded event, not the raw URL', async () => {
        await renderDetails('  React-Summit-2026 ');

        expect(getBookingCount).toHaveBeenCalledWith(EVENT._id);
        expect(getSimilarEventsBySlug).toHaveBeenCalledWith('react-summit-2026');
    });

    it('links each similar event to its page', async () => {
        vi.mocked(getSimilarEventsBySlug).mockResolvedValue([similar(1), similar(2)]);

        await renderDetails();

        const section = screen.getByRole('heading', { name: 'Similar Events' }).parentElement!;
        expect(within(section).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
            '/events/similar-1',
            '/events/similar-2',
        ]);
    });

    it('shows the not found page for an unknown slug', async () => {
        vi.mocked(getEventBySlug).mockResolvedValue(null);

        await expect(renderDetails('missing')).rejects.toThrow('NEXT_NOT_FOUND');
        expect(notFound).toHaveBeenCalled();
    });

    it('lets a database failure reach the error page instead of showing not found', async () => {
        vi.mocked(getEventBySlug).mockRejectedValue(new Error('connection reset'));
        vi.mocked(notFound).mockClear();

        await expect(renderDetails()).rejects.toThrow('connection reset');
        expect(notFound).not.toHaveBeenCalled();
    });
});
