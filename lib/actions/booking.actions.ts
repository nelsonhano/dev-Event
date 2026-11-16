'use server';

import {Error as MongooseError, isValidObjectId} from "mongoose";
import {updateTag} from "next/cache";

import Booking from '@/database/booking.model';
import connectDB from "@/lib/mongodb";
import {bookingsTag} from "@/lib/actions/event.actions";

export type BookingResult = { success: true } | { success: false; message: string };

export const createBooking = async ({ eventId, email }: { eventId: string; email: string; }): Promise<BookingResult> => {
    if (!isValidObjectId(eventId)) return { success: false, message: 'This event could not be found.' };
    if (!email?.trim()) return { success: false, message: 'Please enter your email address.' };

    try {
        await connectDB();
        await Booking.create({ eventId, email });
        updateTag(bookingsTag(eventId));

        return { success: true };
    } catch (e) {
        if ((e as { code?: number }).code === 11000) {
            return { success: false, message: "You've already booked this event with that email." };
        }
        if (e instanceof MongooseError.ValidationError) {
            const first = Object.values(e.errors)[0];
            return { success: false, message: first?.message ?? 'Please check your details and try again.' };
        }
        if (e instanceof Error && e.name === 'ValidationError') {
            // Raised by the booking pre save hook when the event doesn't exist.
            return { success: false, message: 'This event could not be found.' };
        }
        console.error('create booking failed', e);
        return { success: false, message: 'Something went wrong. Please try again.' };
    }
}
