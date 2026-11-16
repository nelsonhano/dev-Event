// Email templates from spec 0001 (Feature design, Email templates).

export type RenderedEmail = { subject: string; html: string; text: string };

const FOOTER = 'You got this because of activity on DevEvent';

const escapeHtml = (value: string) =>
    value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function layout(paragraphs: string[], link?: { href: string; label: string }): Pick<RenderedEmail, 'html' | 'text'> {
    const htmlParts = paragraphs.map((p) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`);
    if (link) {
        htmlParts.push(
            `<p style="margin:0 0 16px"><a href="${escapeHtml(link.href)}" ` +
                `style="display:inline-block;background:#59deca;color:#000;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">` +
                `${escapeHtml(link.label)}</a></p>`,
            `<p style="margin:0 0 16px;font-size:13px;color:#555">Or paste this link into your browser: ${escapeHtml(link.href)}</p>`,
        );
    }
    const html =
        `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:520px">` +
        htmlParts.join('') +
        `<p style="margin:24px 0 0;font-size:12px;color:#777">${FOOTER}</p></div>`;

    const text = [...paragraphs, ...(link ? [`${link.label}: ${link.href}`] : []), '', FOOTER].join('\n\n');
    return { html, text };
}

export const templates = {
    'verify-email': ({ name, url }: { name: string; url: string }): RenderedEmail => ({
        subject: 'Confirm your email for DevEvent',
        ...layout(
            [
                `Hi ${name},`,
                'Confirm your email to start publishing events on DevEvent. The link expires in 24 hours.',
            ],
            { href: url, label: 'Confirm email' },
        ),
    }),

    'reset-password': ({ name, url }: { name: string; url: string }): RenderedEmail => ({
        subject: 'Reset your DevEvent password',
        ...layout(
            [
                `Hi ${name},`,
                'Someone asked to reset the password on your DevEvent account. The link expires in 1 hour.',
                "If this wasn't you, you can ignore this email. Your password stays the same.",
            ],
            { href: url, label: 'Reset password' },
        ),
    }),

    // Attendees have no name on file, so attendee emails open with "Hi there".
    'event-updated': ({ title, url, changes }: { title: string; url: string; changes: EventChange[] }): RenderedEmail => ({
        subject: `Update: ${title} has changed`,
        ...layout(
            [
                'Hi there,',
                `The organiser of ${title}, which you booked, changed some details:`,
                ...changes.map((c) => `${c.label}: ${c.from || '(none)'} → ${c.to || '(none)'}`),
                'Your booking stays as it is.',
            ],
            { href: url, label: 'View the event' },
        ),
    }),

    'event-cancelled': ({ title, date }: { title: string; date: string }): RenderedEmail => ({
        subject: `Cancelled: ${title}`,
        ...layout([
            'Hi there,',
            `${title}, planned for ${date}, has been cancelled by its organiser.`,
            'Your booking has been removed. There is nothing else you need to do.',
        ]),
    }),

    'role-granted': ({ name, granter, url }: { name: string; granter: string; url: string }): RenderedEmail => ({
        subject: "You're now a DevEvent admin",
        ...layout(
            [`Hi ${name},`, `${granter} made you a DevEvent admin. You can now review organisers and suspend spam accounts.`],
            { href: url, label: 'Open the admin console' },
        ),
    }),

    'role-revoked': ({ name, granter }: { name: string; granter: string }): RenderedEmail => ({
        subject: 'Your DevEvent admin access was removed',
        ...layout([`Hi ${name},`, `${granter} removed your admin access. Your organiser account and events are unchanged.`]),
    }),

    'user-banned': ({ name, reason, until }: { name: string; reason: string; until: string | null }): RenderedEmail => ({
        subject: 'Your DevEvent account is suspended',
        ...layout([
            `Hi ${name},`,
            `Your DevEvent account has been suspended ${until ? `until ${until}` : 'permanently'}.`,
            `Reason: ${reason}`,
            'While it is suspended you cannot sign in, and your events are hidden from DevEvent.',
        ]),
    }),

    'user-unbanned': ({ name }: { name: string }): RenderedEmail => ({
        subject: 'Your DevEvent account is active again',
        ...layout([`Hi ${name},`, 'Your DevEvent account is active again. You can sign in, and your events are visible again.']),
    }),
} as const;

export type EventChange = { field: string; label: string; from: string; to: string };

export type TemplateName = keyof typeof templates;
export type TemplateData<T extends TemplateName> = Parameters<(typeof templates)[T]>[0];
