'use client';

const EventError = ({ reset }: { error: Error & { digest?: string }; reset: () => void }) => {
    return (
        <section className="flex-center flex-col gap-4 py-20 text-center">
            <h2>We couldn&apos;t load this event</h2>
            <p>Something went wrong on our side. Please try again in a moment.</p>
            <button type="button" id="explore-btn" className="mx-auto" onClick={reset}>
                Try again
            </button>
        </section>
    )
}

export default EventError
