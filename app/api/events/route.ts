import {NextRequest, NextResponse} from "next/server";
import {revalidateTag} from "next/cache";
import {Error as MongooseError} from "mongoose";

import connectDB from "@/lib/mongodb";
import Event from '@/database/event.model';
import {EVENTS_TAG} from "@/lib/actions/event.actions";
import {checkOrigin, requireApiSession, requireVerified} from "@/lib/auth/guards";
import {parseEventInput} from "@/lib/events/input";
import {releaseEventSlot, reserveEventSlot} from "@/lib/events/quota";
import {destroyImage, imageProblem, uploadImage, uploadsConfigured} from "@/lib/events/image";
import {publicVisibility} from "@/lib/events/visibility";

const isProd = process.env.NODE_ENV === 'production';

const badRequest = (message: string, errors?: Record<string, string>, status = 400) =>
    NextResponse.json({ message, ...(errors && { errors }) }, { status });

export async function POST(req: NextRequest) {
    // 1. Who is asking, from where, and may they publish? Headers only: nothing
    //    is read from the body or uploaded until all three pass (spec 0001, AC-4, AC-8).
    const signedIn = await requireApiSession(req);
    if (!signedIn.ok) return signedIn.response;

    const badOrigin = checkOrigin(req);
    if (badOrigin) return badOrigin;

    const verified = requireVerified(signedIn.session);
    if (!verified.ok) return verified.response;

    const organiserId = signedIn.session.user.id;

    if (!req.headers.get('content-type')?.includes('multipart/form-data')) {
        return badRequest('Request body must be multipart/form-data', undefined, 415);
    }

    // 2. Take a create slot atomically (AC-9). It is given back if anything below fails.
    await connectDB();
    const reservation = await reserveEventSlot(organiserId);
    if (!reservation.ok) {
        const retryAfter = Math.max(1, Math.ceil((reservation.nextSlotAt.getTime() - Date.now()) / 1000));
        return NextResponse.json(
            { message: 'You can create 3 events every 24 hours', code: 'EVENT_QUOTA', nextSlotAt: reservation.nextSlotAt.toISOString() },
            { status: 429, headers: { 'Retry-After': String(retryAfter) } },
        );
    }

    let uploadedPublicId: string | null = null;
    let saved = false;

    try {
        let formData: FormData;
        try {
            formData = await req.formData();
        } catch {
            return badRequest('Could not read the form data');
        }

        // 3. Validate the file
        const file = formData.get('image');
        const problem = imageProblem(file);
        if (problem) return badRequest(problem);

        // 4. Only the whitelisted fields; the owner always comes from the session.
        const parsed = parseEventInput(formData);
        if (!parsed.ok) return badRequest(parsed.message);

        // A placeholder image URL lets the schema validate everything else first.
        const event = new Event({ ...parsed.input, organiserId, image: 'pending-upload' });
        await event.validate();

        if (!uploadsConfigured()) {
            console.error('CLOUDINARY_URL is not set, so image uploads are disabled');
            return NextResponse.json({ message: 'Image uploads are not configured on this server' }, { status: 500 });
        }

        // 5. Upload, then save; remove the upload if the save fails
        const upload = await uploadImage(Buffer.from(await (file as File).arrayBuffer()));
        uploadedPublicId = upload.public_id;
        event.image = upload.secure_url;
        event.imagePublicId = upload.public_id;

        const createdEvent = await event.save();
        saved = true;
        uploadedPublicId = null;

        revalidateTag(EVENTS_TAG, { expire: 0 });

        return NextResponse.json({ message: 'Event created successfully', event: createdEvent }, { status: 201 });
    } catch (e) {
        if (uploadedPublicId) {
            await destroyImage(uploadedPublicId);
        }

        if (e instanceof MongooseError.ValidationError) {
            const errors = Object.fromEntries(Object.entries(e.errors).map(([path, err]) => [path, err.message]));
            return badRequest('Validation failed', errors);
        }
        if ((e as { code?: number }).code === 11000) {
            return badRequest('An event with this title already exists', undefined, 409);
        }

        console.error(e);
        return NextResponse.json({
            message: 'Event Creation Failed',
            ...(!isProd && { error: e instanceof Error ? e.message : 'Unknown' }),
        }, { status: 500 });
    } finally {
        // Every path that didn't save gives the slot back.
        if (!saved) {
            await releaseEventSlot(organiserId, reservation.slot).catch((err) => console.error('Failed to release quota slot', err));
        }
    }
}

export async function GET() {
    try {
        await connectDB();

        const events = await Event.find(publicVisibility()).sort({ createdAt: -1 });

        return NextResponse.json({ message: 'Events fetched successfully', events }, { status: 200 });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ message: 'Event fetching failed' }, { status: 500 });
    }
}
