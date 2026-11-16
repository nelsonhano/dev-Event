import { Schema, model, models, Document } from 'mongoose';

// TypeScript interface for Event document
export interface IEvent extends Document {
  title: string;
  slug: string;
  description: string;
  overview: string;
  image: string;
  venue: string;
  location: string;
  date: string;
  time: string;
  mode: string;
  audience: string;
  agenda: string[];
  organizer: string;
  tags: string[];
  /** Better Auth user id (the string form of `session.user.id`). */
  organiserId: string;
  /** Cloudinary public id of `image`; empty on events made before ownership existed. */
  imagePublicId?: string;
  /** Mirrors the owner's ban, so public reads can hide the event. */
  ownerBanned: boolean;
  ownerBanExpires?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const EventSchema = new Schema<IEvent>(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    overview: {
      type: String,
      required: [true, 'Overview is required'],
      trim: true,
      maxlength: [500, 'Overview cannot exceed 500 characters'],
    },
    image: {
      type: String,
      required: [true, 'Image URL is required'],
      trim: true,
    },
    venue: {
      type: String,
      required: [true, 'Venue is required'],
      trim: true,
    },
    location: {
      type: String,
      required: [true, 'Location is required'],
      trim: true,
    },
    date: {
      type: String,
      required: [true, 'Date is required'],
    },
    time: {
      type: String,
      required: [true, 'Time is required'],
    },
    mode: {
      type: String,
      required: [true, 'Mode is required'],
      lowercase: true,
      trim: true,
      enum: {
        values: ['online', 'offline', 'hybrid'],
        message: 'Mode must be either online, offline, or hybrid',
      },
    },
    audience: {
      type: String,
      required: [true, 'Audience is required'],
      trim: true,
    },
    agenda: {
      type: [String],
      required: [true, 'Agenda is required'],
      validate: {
        validator: (v: string[]) => v.length > 0,
        message: 'At least one agenda item is required',
      },
    },
    organizer: {
      type: String,
      required: [true, 'Organizer is required'],
      trim: true,
    },
    tags: {
      type: [String],
      required: [true, 'Tags are required'],
      validate: {
        validator: (v: string[]) => v.length > 0,
        message: 'At least one tag is required',
      },
    },
    organiserId: {
      type: String,
      required: [true, 'Organiser is required'],
      trim: true,
    },
    imagePublicId: {
      type: String,
      trim: true,
    },
    ownerBanned: {
      type: Boolean,
      default: false,
    },
    ownerBanExpires: {
      type: Date,
    },
  },
  {
    timestamps: true, // Auto-generate createdAt and updatedAt
  }
);

// Normalise and derive fields before validation, so `doc.validate()` catches
// bad slugs, dates and times before anything is uploaded or saved.
EventSchema.pre('validate', async function () {
  const event = this as IEvent;

  // The slug is set once, when the event is created, and never rewritten (spec 0001, AC-11).
  if (event.title && event.isNew) {
    const base = generateSlug(event.title);
    if (!base) {
      event.invalidate('title', 'Title must contain at least one letter or number');
    } else {
      event.slug = await uniqueSlug(this.constructor as typeof Event, base, event._id);
    }
  }

  // Normalize date to YYYY-MM-DD
  if (event.date && event.isModified('date')) {
    try {
      event.date = normalizeDate(event.date);
    } catch (e) {
      event.invalidate('date', (e as Error).message);
    }
  }

  // Normalize time format (HH:MM)
  if (event.time && event.isModified('time')) {
    try {
      event.time = normalizeTime(event.time);
    } catch (e) {
      event.invalidate('time', (e as Error).message);
    }
  }
});

// Appends -2, -3, ... until the slug is free. The unique index still guards races.
async function uniqueSlug(EventModel: typeof Event, base: string, selfId: unknown): Promise<string> {
  let candidate = base;
  for (let n = 2; await EventModel.exists({ slug: candidate, _id: { $ne: selfId } }); n++) {
    candidate = `${base}-${n}`;
  }
  return candidate;
}

// Helper function to generate URL-friendly slug
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

// Helper function to normalize a date to YYYY-MM-DD without timezone shifts
function normalizeDate(dateString: string): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const iso = dateString.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (iso) {
    const [, y, m, d] = iso.map(Number);
    const check = new Date(Date.UTC(y, m - 1, d));
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
      throw new Error('Invalid date. Use YYYY-MM-DD');
    }
    return `${y}-${pad(m)}-${pad(d)}`;
  }

  // Other formats (e.g. "May 1, 2026") parse as local time, so read local parts back.
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    throw new Error('Invalid date format. Use YYYY-MM-DD');
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Helper function to normalize time format
function normalizeTime(timeString: string): string {
  // Handle various time formats and convert to HH:MM (24-hour format)
  const timeRegex = /^(\d{1,2}):(\d{2})(\s*(AM|PM))?$/i;
  const match = timeString.trim().match(timeRegex);
  
  if (!match) {
    throw new Error('Invalid time format. Use HH:MM or HH:MM AM/PM');
  }
  
  let hours = parseInt(match[1]);
  const minutes = match[2];
  const period = match[4]?.toUpperCase();
  
  if (period) {
    if (hours < 1 || hours > 12) {
      throw new Error('With AM/PM, hours must be between 1 and 12');
    }
    // Convert 12-hour to 24-hour format
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
  }
  
  if (hours < 0 || hours > 23 || parseInt(minutes) < 0 || parseInt(minutes) > 59) {
    throw new Error('Invalid time values');
  }
  
  return `${hours.toString().padStart(2, '0')}:${minutes}`;
}

// Create compound index for common queries
EventSchema.index({ date: 1, mode: 1 });
// The organiser dashboard lists one owner's events, newest first.
EventSchema.index({ organiserId: 1, createdAt: -1 });
// Public reads filter out events whose owner is banned.
EventSchema.index({ ownerBanned: 1 });

const Event = models.Event || model<IEvent>('Event', EventSchema);

export default Event;