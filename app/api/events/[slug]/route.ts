import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { Error as MongooseError } from 'mongoose';

import connectDB from '@/lib/mongodb';
import Event from '@/database/event.model';
import Booking from '@/database/booking.model';
import { bookingsTag, EVENTS_TAG, eventTag } from '@/lib/actions/event.actions';
import { checkOrigin, requireApiSession } from '@/lib/auth/guards';
import { canDeleteEvent, canEditEvent } from '@/lib/auth/policy';
import { runAfter } from '@/lib/background';
import { sendEmail } from '@/lib/email';
import { isTodayOrLater, noticeChanges } from '@/lib/events/changes';
import { destroyImage, imageProblem, uploadImage, uploadsConfigured } from '@/lib/events/image';
import { parseEventInput } from '@/lib/events/input';
import { auditEventModeration, type Caller } from '@/lib/admin/moderation';
import { publicVisibility } from '@/lib/events/visibility';

// Define route params type for type safety
type RouteParams = {
  params: Promise<{
    slug: string;
  }>;
};

/**
 * GET /api/events/[slug]
 * Fetches a single events by its slug
 */
export async function GET(
  req: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    // Connect to database
    await connectDB();

    // Await and extract slug from params
    const { slug } = await params;

    // Validate slug parameter
    if (!slug || typeof slug !== 'string' || slug.trim() === '') {
      return NextResponse.json(
        { message: 'Invalid or missing slug parameter' },
        { status: 400 }
      );
    }

    // Sanitize slug (remove any potential malicious input)
    const sanitizedSlug = slug.trim().toLowerCase();

    // Query events by slug
    // Hidden while the owner is banned (AC-18).
    const event = await Event.findOne({ slug: sanitizedSlug, ...publicVisibility() }).lean();

    // Handle events not found
    if (!event) {
      return NextResponse.json(
        { message: `Event with slug '${sanitizedSlug}' not found` },
        { status: 404 }
      );
    }

    // Return successful response with events data
    return NextResponse.json(
      { message: 'Event fetched successfully', event },
      { status: 200 }
    );
  } catch (error) {
    // Log error for debugging (only in development)
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching events by slug:', error);
    }

    // Handle specific error types
    if (error instanceof Error) {
      // Handle database connection errors
      if (error.message.includes('MONGODB_URI')) {
        return NextResponse.json(
          { message: 'Database configuration error' },
          { status: 500 }
        );
      }

      // Return generic error (details only outside production)
      return NextResponse.json(
        {
          message: 'Failed to fetch events',
          ...(process.env.NODE_ENV !== 'production' && { error: error.message }),
        },
        { status: 500 }
      );
    }

    // Handle unknown errors
    return NextResponse.json(
      { message: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}

const isProd = process.env.NODE_ENV === 'production';

const json = (status: number, message: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ message, ...extra }, { status });

const appUrl = () => process.env.BETTER_AUTH_URL ?? '';

/** Attendee addresses, read before any write so a later failure can't lose them (AC-12, AC-13). */
const attendeeEmails = async (eventId: unknown) =>
  (await Booking.find({ eventId }).select('email').lean<{ email: string }[]>()).map((b) => b.email);

/**
 * PATCH /api/events/[slug] (spec 0001, AC-11, AC-12)
 * Owner (verified) or super admin. Fields left out keep their values; tags and agenda,
 * when sent, replace the old lists; the slug never changes.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const signedIn = await requireApiSession(req);
  if (!signedIn.ok) return signedIn.response;
  const badOrigin = checkOrigin(req);
  if (badOrigin) return badOrigin;

  const { slug } = await params;
  await connectDB();
  const event = await Event.findOne({ slug: slug.trim().toLowerCase() });
  if (!event) return json(404, 'Event not found');

  const user = signedIn.session.user;
  if (!canEditEvent(user, event)) {
    // An owner who hasn't confirmed their email gets the same code as on create (AC-4).
    if (event.organiserId === user.id && !user.emailVerified) {
      return json(403, 'Confirm your email to publish events', { code: 'EMAIL_NOT_VERIFIED' });
    }
    return json(403, "You can't edit this event", { code: 'FORBIDDEN' });
  }

  if (!req.headers.get('content-type')?.includes('multipart/form-data')) {
    return json(415, 'Request body must be multipart/form-data');
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return json(400, 'Could not read the form data');
  }

  const parsed = parseEventInput(formData, { partial: true });
  if (!parsed.ok) return json(400, parsed.message);

  // A new banner is optional on edit; an empty file input means "keep the current one".
  const rawImage = formData.get('image');
  const newImage = rawImage instanceof File && rawImage.size > 0 ? rawImage : null;
  if (newImage) {
    const problem = imageProblem(newImage);
    if (problem) return json(400, problem);
  }

  const before = { date: event.date, time: event.time, venue: event.venue, location: event.location, mode: event.mode };
  const titleBefore = event.title;
  const oldPublicId = event.imagePublicId || null;
  let uploadedPublicId: string | null = null;

  try {
    const recipients = await attendeeEmails(event._id);

    event.set(parsed.input);
    await event.validate();

    if (newImage) {
      if (!uploadsConfigured()) {
        console.error('CLOUDINARY_URL is not set, so image uploads are disabled');
        return json(500, 'Image uploads are not configured on this server');
      }
      const upload = await uploadImage(Buffer.from(await newImage.arrayBuffer()));
      uploadedPublicId = upload.public_id;
      event.image = upload.secure_url;
      event.imagePublicId = upload.public_id;
    }

    const saved = await event.save();
    uploadedPublicId = null;

    revalidateTag(EVENTS_TAG, { expire: 0 });
    revalidateTag(eventTag(saved.slug), { expire: 0 });

    if (newImage) {
      if (oldPublicId) runAfter(() => destroyImage(oldPublicId));
      else console.warn('Replaced the banner of an event with no imagePublicId; the old image stays in Cloudinary', saved.slug);
    }

    // Someone other than the owner (the super admin) leaves an audit entry (AC-20).
    await auditEventModeration(user as Caller, 'event.update', { _id: saved._id, title: titleBefore, organiserId: saved.organiserId }, {
      fields: Object.keys(parsed.input).concat(newImage ? ['image'] : []),
    });

    const changes = noticeChanges(before, saved);
    if (changes.length > 0 && recipients.length > 0 && isTodayOrLater(before.date)) {
      const data = { title: saved.title, url: `${appUrl()}/events/${saved.slug}`, changes };
      runAfter(() => sendEmail({ template: 'event-updated', to: recipients, data }));
    }

    return NextResponse.json({ message: 'Event updated', event: saved }, { status: 200 });
  } catch (e) {
    if (uploadedPublicId) await destroyImage(uploadedPublicId);

    if (e instanceof MongooseError.ValidationError) {
      const errors = Object.fromEntries(Object.entries(e.errors).map(([path, err]) => [path, err.message]));
      return json(400, 'Validation failed', { errors });
    }
    console.error(e);
    return json(500, 'Event update failed', !isProd && e instanceof Error ? { error: e.message } : {});
  }
}

/**
 * DELETE /api/events/[slug] (spec 0001, AC-4, AC-13)
 * Owner (verified or not) or super admin. Reads attendee emails, deletes the event,
 * then its bookings; cancel emails and the image removal run after the response.
 */
export async function DELETE(req: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  const signedIn = await requireApiSession(req);
  if (!signedIn.ok) return signedIn.response;
  const badOrigin = checkOrigin(req);
  if (badOrigin) return badOrigin;

  const { slug } = await params;
  await connectDB();
  const event = await Event.findOne({ slug: slug.trim().toLowerCase() });
  if (!event) return json(404, 'Event not found');
  if (!canDeleteEvent(signedIn.session.user, event)) return json(403, "You can't delete this event", { code: 'FORBIDDEN' });

  try {
    const recipients = await attendeeEmails(event._id);
    const { title, date, imagePublicId } = event;
    const eventId = String(event._id);

    await Event.deleteOne({ _id: event._id });
    await Booking.deleteMany({ eventId: event._id });
    await auditEventModeration(signedIn.session.user as Caller, 'event.delete', event, { bookings: recipients.length });

    revalidateTag(EVENTS_TAG, { expire: 0 });
    revalidateTag(eventTag(event.slug), { expire: 0 });
    revalidateTag(bookingsTag(eventId), { expire: 0 });

    runAfter(async () => {
      await sendEmail({ template: 'event-cancelled', to: recipients, data: { title, date } });
      if (imagePublicId) await destroyImage(imagePublicId);
      else console.warn('Deleted an event with no imagePublicId; its image stays in Cloudinary', event.slug);
    });

    return new NextResponse(null, { status: 204 });
  } catch (e) {
    console.error(e);
    return json(500, 'Event delete failed', !isProd && e instanceof Error ? { error: e.message } : {});
  }
}
