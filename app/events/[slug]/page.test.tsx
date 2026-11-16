import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/actions/event.actions', () => ({ getEventBySlug: vi.fn() }));
// The page body only wraps EventDetails in Suspense; EventDetails has its own tests.
vi.mock('@/components/EventDetails', () => ({ default: () => null }));

import { getEventBySlug, type EventDTO } from '@/lib/actions/event.actions';
import { generateMetadata } from './page';

const EVENT = {
    _id: 'id-1',
    title: 'React Summit 2026',
    slug: 'react-summit-2026',
    description: 'A full day of talks about React.',
    image: 'https://img.test/react-summit.png',
} as EventDTO;

const metadataFor = (slug: string) => generateMetadata({ params: Promise.resolve({ slug }) });

beforeEach(() => {
    vi.mocked(getEventBySlug).mockReset();
});

describe('event page metadata', () => {
    it('uses the event title, description and banner for search and link previews', async () => {
        vi.mocked(getEventBySlug).mockResolvedValue(EVENT);

        const metadata = await metadataFor('react-summit-2026');

        expect(metadata).toEqual({
            title: 'React Summit 2026 | DevEvent',
            description: 'A full day of talks about React.',
            openGraph: {
                title: 'React Summit 2026',
                description: 'A full day of talks about React.',
                images: ['https://img.test/react-summit.png'],
            },
        });
        expect(getEventBySlug).toHaveBeenCalledWith('react-summit-2026');
    });

    it('titles the page "Event not found" for an unknown slug', async () => {
        vi.mocked(getEventBySlug).mockResolvedValue(null);

        expect(await metadataFor('missing')).toEqual({ title: 'Event not found | DevEvent' });
    });
});
