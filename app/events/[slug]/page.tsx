import {Suspense} from "react";
import type {Metadata} from "next";
import EventDetails from "@/components/EventDetails";
import {getEventBySlug} from "@/lib/actions/event.actions";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { slug } = await params;
    const event = await getEventBySlug(slug);

    if (!event) return { title: 'Event not found | DevEvent' };

    return {
        title: `${event.title} | DevEvent`,
        description: event.description,
        openGraph: { title: event.title, description: event.description, images: [event.image] },
    };
}

const EventDetailsPage = async ({ params }: Props) => {
    const slug = params.then((p) => p.slug);

    // The root layout already renders <main>, so this is a plain wrapper.
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <EventDetails params={slug} />
        </Suspense>
    )
}
export default EventDetailsPage
