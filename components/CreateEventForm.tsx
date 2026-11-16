'use client';

import {useEffect, useState} from "react";
import {useRouter} from "next/navigation";
import posthog from "posthog-js";

// Mirrors the limits in database/event.model.ts and app/api/events/route.ts.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const LIMITS = { title: 100, overview: 500, description: 1000 } as const;

type FieldErrors = Record<string, string>;

// Splits "a, b\nc" into ["a", "b", "c"], dropping blanks and duplicates.
const toList = (raw: string, separator: RegExp) =>
    [...new Set(raw.split(separator).map((s) => s.trim()).filter(Boolean))];

const FieldError = ({ name, errors }: { name: string; errors: FieldErrors }) =>
    errors[name] ? <p id={`${name}-error`} className="field-error">{errors[name]}</p> : null;

/** Current values when editing (spec 0001, AC-11). */
export type EventFormValues = {
    title: string; description: string; overview: string; image: string;
    venue: string; location: string; date: string; time: string; mode: string;
    audience: string; organizer: string; agenda: string[]; tags: string[];
};

type Props = {
    /** Prefills the Organizer field with the signed in user's name; it stays editable (spec 0001, AC-8). */
    defaultOrganizer?: string;
    /** Edit mode: the event's slug and current values. The banner becomes optional. */
    edit?: { slug: string; values: EventFormValues };
};

const CreateEventForm = ({ defaultOrganizer = '', edit }: Props) => {
    const isEdit = Boolean(edit);
    const values: Partial<Record<keyof EventFormValues, string>> = edit
        ? { ...edit.values, agenda: edit.values.agenda.join('\n'), tags: edit.values.tags.join(', ') }
        : { organizer: defaultOrganizer };
    const router = useRouter();
    const [errors, setErrors] = useState<FieldErrors>({});
    const [formError, setFormError] = useState<string | null>(null);
    const [isPending, setIsPending] = useState(false);
    const [preview, setPreview] = useState<string | null>(null);

    // Free the object URL when the preview changes or the form unmounts.
    useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

    const fieldProps = (name: string) => ({
        id: name,
        name,
        'aria-invalid': errors[name] ? true : undefined,
        'aria-describedby': errors[name] ? `${name}-error` : undefined,
    });

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        setPreview(file ? URL.createObjectURL(file) : null);
        setErrors((prev) => {
            const next = { ...prev };
            delete next.image;
            return next;
        });
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (isPending) return;

        const form = new FormData(e.currentTarget);
        const nextErrors: FieldErrors = {};

        const image = form.get('image');
        const keepBanner = isEdit && image instanceof File && image.size === 0;
        if (keepBanner) form.delete('image');
        else if (!(image instanceof File) || image.size === 0) nextErrors.image = 'Please choose a banner image';
        else if (!image.type.startsWith('image/')) nextErrors.image = 'The banner must be an image file';
        else if (image.size > MAX_IMAGE_BYTES) nextErrors.image = 'The banner must be 5 MB or smaller';

        const tags = toList(String(form.get('tags') ?? ''), /[,\n]/);
        const agenda = toList(String(form.get('agenda') ?? ''), /\n/);
        if (tags.length === 0) nextErrors.tags = 'Add at least one tag';
        if (agenda.length === 0) nextErrors.agenda = 'Add at least one agenda item';

        setErrors(nextErrors);
        setFormError(null);
        if (Object.keys(nextErrors).length > 0) return;

        // The API expects tags and agenda as JSON arrays of strings.
        form.set('tags', JSON.stringify(tags));
        form.set('agenda', JSON.stringify(agenda));

        setIsPending(true);
        try {
            const res = edit
                ? await fetch(`/api/events/${encodeURIComponent(edit.slug)}`, { method: 'PATCH', body: form })
                : await fetch('/api/events', { method: 'POST', body: form });
            const data: { message?: string; code?: string; nextSlotAt?: string; errors?: FieldErrors; event?: { slug: string } } =
                await res.json().catch(() => ({}));

            if (res.ok && data.event?.slug && edit) {
                router.push('/dashboard');
                router.refresh();
                return;
            }

            if (res.ok && data.event?.slug) {
                posthog.capture('event_created', { slug: data.event.slug });
                router.push(`/events/${data.event.slug}`);
                return;
            }

            if (res.status === 401) {
                const back = edit ? `/dashboard/events/${edit.slug}/edit` : '/events/create';
                router.push(`/sign-in?callbackURL=${encodeURIComponent(back)}`);
                return;
            }

            if (res.status === 429 && data.code === 'EVENT_QUOTA' && data.nextSlotAt) {
                const next = new Date(data.nextSlotAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
                setFormError(`You can create 3 events every 24 hours. Your next one can go live after ${next}.`);
            } else if (res.status === 403 && data.code === 'EMAIL_NOT_VERIFIED') {
                setFormError('Confirm your email to publish events. Check your inbox for the link, then try again.');
            } else if (res.status === 403 || res.status === 404) {
                setFormError(data.message ?? "You can't edit this event.");
            } else if (res.status === 409) {
                setErrors({ title: data.message ?? 'An event with this title already exists' });
            } else if (data.errors) {
                setErrors(data.errors);
                setFormError('Please fix the highlighted fields.');
            } else {
                setFormError(data.message ?? 'Something went wrong. Please try again.');
            }
            setIsPending(false);
        } catch {
            setFormError('Could not reach the server. Check your connection and try again.');
            setIsPending(false);
        }
    };

    return (
        <form id="create-event" onSubmit={handleSubmit} aria-busy={isPending}>
            <fieldset disabled={isPending}>
                <legend>Basics</legend>

                <div className="field">
                    <label htmlFor="title">Event title</label>
                    <input type="text" required maxLength={LIMITS.title} placeholder="React Summit 2026" defaultValue={values.title} {...fieldProps('title')} />
                    <FieldError name="title" errors={errors} />
                </div>

                <div className="field">
                    <label htmlFor="description">Short description</label>
                    <textarea required rows={3} maxLength={LIMITS.description} placeholder="One or two sentences shown under the title" defaultValue={values.description} {...fieldProps('description')} />
                    <FieldError name="description" errors={errors} />
                </div>

                <div className="field">
                    <label htmlFor="overview">Overview</label>
                    <textarea required rows={4} maxLength={LIMITS.overview} placeholder="What attendees can expect" defaultValue={values.overview} {...fieldProps('overview')} />
                    <FieldError name="overview" errors={errors} />
                </div>

                <div className="field">
                    <label htmlFor="image">Banner image</label>
                    <input type="file" required={!isEdit} accept="image/*" onChange={handleImageChange} {...fieldProps('image')} />
                    <p className="hint">
                        {isEdit ? 'Leave empty to keep the current banner. ' : ''}PNG, JPG, or WebP, up to 5 MB.
                    </p>
                    {isEdit && !preview && values.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={values.image} alt="Current banner" className="preview" />
                    )}
                    {preview && (
                        // A blob URL can't go through next/image, so a plain img is used for the local preview.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={preview} alt="Banner preview" className="preview" />
                    )}
                    <FieldError name="image" errors={errors} />
                </div>
            </fieldset>

            <fieldset disabled={isPending}>
                <legend>When and where</legend>

                <div className="row">
                    <div className="field">
                        <label htmlFor="date">Date</label>
                        <input type="date" required defaultValue={values.date} {...fieldProps('date')} />
                        <FieldError name="date" errors={errors} />
                    </div>

                    <div className="field">
                        <label htmlFor="time">Start time</label>
                        <input type="time" required defaultValue={values.time} {...fieldProps('time')} />
                        <FieldError name="time" errors={errors} />
                    </div>
                </div>

                <div className="row">
                    <div className="field">
                        <label htmlFor="venue">Venue</label>
                        <input type="text" required placeholder="Moscone Center" defaultValue={values.venue} {...fieldProps('venue')} />
                        <FieldError name="venue" errors={errors} />
                    </div>

                    <div className="field">
                        <label htmlFor="location">Location</label>
                        <input type="text" required placeholder="San Francisco, CA" defaultValue={values.location} {...fieldProps('location')} />
                        <FieldError name="location" errors={errors} />
                    </div>
                </div>

                <div className="field">
                    <label htmlFor="mode">Mode</label>
                    <select required defaultValue={values.mode ?? ''} {...fieldProps('mode')}>
                        <option value="" disabled>Choose a mode</option>
                        <option value="offline">In person</option>
                        <option value="online">Online</option>
                        <option value="hybrid">Hybrid</option>
                    </select>
                    <FieldError name="mode" errors={errors} />
                </div>
            </fieldset>

            <fieldset disabled={isPending}>
                <legend>Program</legend>

                <div className="row">
                    <div className="field">
                        <label htmlFor="audience">Audience</label>
                        <input type="text" required placeholder="Frontend developers" defaultValue={values.audience} {...fieldProps('audience')} />
                        <FieldError name="audience" errors={errors} />
                    </div>

                    <div className="field">
                        <label htmlFor="organizer">Organizer</label>
                        <input type="text" required placeholder="Who is running this event" defaultValue={values.organizer} {...fieldProps('organizer')} />
                        <FieldError name="organizer" errors={errors} />
                    </div>
                </div>

                <div className="field">
                    <label htmlFor="agenda">Agenda</label>
                    <textarea required rows={5} placeholder={'09:00 Doors open\n09:30 Keynote\n11:00 Workshops'} defaultValue={values.agenda} {...fieldProps('agenda')} />
                    <p className="hint">One item per line.</p>
                    <FieldError name="agenda" errors={errors} />
                </div>

                <div className="field">
                    <label htmlFor="tags">Tags</label>
                    <input type="text" required placeholder="react, frontend, conference" defaultValue={values.tags} {...fieldProps('tags')} />
                    <p className="hint">Separate tags with commas. Similar events are matched by tag.</p>
                    <FieldError name="tags" errors={errors} />
                </div>
            </fieldset>

            {formError && <p role="alert" className="field-error">{formError}</p>}

            <button type="submit" disabled={isPending}>
                {isEdit
                    ? (isPending ? 'Saving changes...' : 'Save changes')
                    : (isPending ? 'Creating event...' : 'Create event')}
            </button>
        </form>
    );
};

export default CreateEventForm;
