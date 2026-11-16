import { Schema, model, models, Document, Model } from 'mongoose';

// How many events one organiser may create in a rolling 24 hours (spec 0001, AC-9).
export const EVENT_QUOTA_LIMIT = 3;
export const EVENT_QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface IEventQuota extends Document {
  /** Better Auth user id (the string form of `session.user.id`). */
  userId: string;
  /** Create times within the last 24 hours. Kept even when the event is later deleted. */
  slots: Date[];
}

const EventQuotaSchema = new Schema<IEventQuota>({
  userId: { type: String, required: true, unique: true },
  slots: { type: [Date], default: [] },
});

const EventQuota: Model<IEventQuota> =
  (models.EventQuota as Model<IEventQuota>) || model<IEventQuota>('EventQuota', EventQuotaSchema);

export default EventQuota;
