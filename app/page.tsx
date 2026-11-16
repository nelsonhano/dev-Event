import ExploreBtn from "@/components/ExploreBtn";
import EventCard from "@/components/EventCard";
import {getAllEvents} from "@/lib/actions/event.actions";

const Page = async () => {
    const events = await getAllEvents();

    return (
        <section>
            <h1 className="text-center">The Hub for Every Dev <br /> Event You Can&apos;t Miss</h1>
            <p className="text-center mt-5">Hackathons, Meetups, and Conferences, All in One Place</p>

            <ExploreBtn />

            <div id="events" className="mt-20 space-y-7 scroll-mt-24">
                <h3>Featured Events</h3>

                <ul className="events">
                    {events.map((event) => (
                        <li key={event._id} className="list-none">
                            <EventCard {...event} />
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    )
}

export default Page;
