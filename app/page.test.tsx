// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('@/lib/actions/event.actions', () => ({ getAllEvents: vi.fn() }));

import { getAllEvents, type EventCardDTO } from '@/lib/actions/event.actions';
import Page from './page';

const card = (n: number): EventCardDTO => ({
    _id: `id-${n}`,
    title: `Event ${n}`,
    slug: `event-${n}`,
    image: `https://img.test/${n}.png`,
    location: 'Online',
    date: '2026-05-01',
    time: '09:00',
});

const renderHome = async () => render(await Page());

beforeEach(() => {
    vi.mocked(getAllEvents).mockReset().mockResolvedValue([]);
});

describe('Home page', () => {
    it('shows the headline and an Explore link that jumps to the events list', async () => {
        await renderHome();

        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("The Hub for Every Dev Event You Can't Miss");
        expect(screen.getByRole('link', { name: 'Explore Events' })).toHaveAttribute('href', '#events');
        expect(document.getElementById('events')).toContainElement(screen.getByRole('heading', { name: 'Featured Events' }));
    });

    it('shows one card per event, in the order the server returned them', async () => {
        vi.mocked(getAllEvents).mockResolvedValue([card(3), card(1), card(2)]);

        await renderHome();

        const list = screen.getByRole('list');
        expect(within(list).getAllByRole('listitem')).toHaveLength(3);
        expect(within(list).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
            '/events/event-3',
            '/events/event-1',
            '/events/event-2',
        ]);
    });

    it('still renders the page with an empty list when there are no events', async () => {
        await renderHome();

        expect(screen.getByRole('heading', { name: 'Featured Events' })).toBeInTheDocument();
        expect(within(screen.getByRole('list')).queryAllByRole('listitem')).toHaveLength(0);
    });
});
