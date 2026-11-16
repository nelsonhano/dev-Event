import nodemailer, { type Transporter } from 'nodemailer';

import { templates, type TemplateData, type TemplateName } from './templates';

declare global {
    var mailTransport: Transporter | undefined;
}

// One pooled transport per server instance, reused across requests and hot reloads.
function getTransport(): Transporter {
    if (!globalThis.mailTransport) {
        const port = Number(process.env.SMTP_PORT ?? 587);
        globalThis.mailTransport = nodemailer.createTransport({
            pool: true,
            host: process.env.SMTP_HOST,
            port,
            secure: process.env.SMTP_SECURE === 'true',
            auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
        });
    }
    return globalThis.mailTransport;
}

type SendOptions<T extends TemplateName> = {
    template: T;
    to: string | string[];
    data: TemplateData<T>;
};

/**
 * Sends one templated email. It never throws (spec 0001, AC-25): a failure is
 * logged with the template name and recipient count only, never the addresses,
 * and the caller's action still succeeds.
 */
export async function sendEmail<T extends TemplateName>({ template, to, data }: SendOptions<T>): Promise<boolean> {
    const recipients = Array.isArray(to) ? to : [to];
    if (recipients.length === 0) return true;

    const fail = (failed: number, e: unknown) => {
        console.error('Email send failed', {
            template,
            recipients: failed,
            error: e instanceof Error ? e.message : String(e),
        });
        return false;
    };

    if (!process.env.SMTP_HOST || !process.env.EMAIL_FROM) {
        return fail(recipients.length, new Error('SMTP_HOST and EMAIL_FROM must be set to send email'));
    }

    let message: ReturnType<(typeof templates)[T]>;
    try {
        const render = templates[template] as (d: TemplateData<T>) => ReturnType<(typeof templates)[T]>;
        message = render(data);
    } catch (e) {
        return fail(recipients.length, e);
    }

    // One message per recipient, so attendees never see each other's addresses.
    const results = await Promise.allSettled(
        recipients.map((address) =>
            getTransport().sendMail({ from: process.env.EMAIL_FROM, to: address, ...message }),
        ),
    );
    const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    return failures.length === 0 ? true : fail(failures.length, failures[0].reason);
}
