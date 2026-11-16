// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import EventCard from './EventCard';

const card = {
    title: 'React Summit 2026',
    image: 'https://img.test/react-summit.png',
    slug: 'react-summit-2026',
    location: 'San Francisco, CA',
    date: '2026-05-01',
    time: '09:00',
};

describe('EventCard', () => {
    it('links the whole card to the event page', () => {
        render(<EventCard {...card} />);

        expect(screen.getByRole('link')).toHaveAttribute('href', '/events/react-summit-2026');
    });

    it('shows the title, location, date and time', () => {
        render(<EventCard {...card} />);

        for (const text of ['React Summit 2026', 'San Francisco, CA', '2026-05-01', '09:00']) {
            expect(screen.getByText(text)).toBeInTheDocument();
        }
    });

    it('shows the poster with the event title as its alt text', () => {
        render(<EventCard {...card} />);

        expect(screen.getByRole('img', { name: 'React Summit 2026' })).toHaveAttribute('src', card.image);
    });
});
