import type { ReactNode } from 'react';
import { CalendarPlus, MailCheck, Users } from 'lucide-react';

const POINTS = [
    { icon: CalendarPlus, title: 'Publish in minutes', body: 'Post your meetup, hackathon, or conference and it goes live on the home page.' },
    { icon: Users, title: 'See who is coming', body: 'Every booking for your events, in one dashboard, ready to export.' },
    { icon: MailCheck, title: 'Keep attendees in the loop', body: 'Change the time or venue and everyone who booked hears about it.' },
];

type Props = {
    heading: string;
    intro: string;
    children: ReactNode;
};

/** Two column auth layout: why organisers sign up on the left, the form card on the right. */
const AuthShell = ({ heading, intro, children }: Props) => (
    <section id="auth-page">
        <div className="pitch">
            <h1>{heading}</h1>
            <p>{intro}</p>
            <ul>
                {POINTS.map(({ icon: Icon, title, body }) => (
                    <li key={title}>
                        <Icon aria-hidden="true" />
                        <div>
                            <strong>{title}</strong>
                            <span>{body}</span>
                        </div>
                    </li>
                ))}
            </ul>
        </div>

        <div className="auth-card">{children}</div>
    </section>
);

export default AuthShell;
