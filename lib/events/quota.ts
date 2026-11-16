import EventQuota, { EVENT_QUOTA_LIMIT, EVENT_QUOTA_WINDOW_MS } from '@/database/event-quota.model';

export type QuotaReservation =
  | { ok: true; slot: Date }
  | { ok: false; nextSlotAt: Date };

const isDuplicateKey = (e: unknown) => (e as { code?: number }).code === 11000;

/**
 * Atomically takes one create slot for this organiser (spec 0001, AC-9).
 * The push only matches while fewer than EVENT_QUOTA_LIMIT slots remain after
 * pruning, so parallel requests can never take more than the limit.
 */
export async function reserveEventSlot(userId: string, now = new Date()): Promise<QuotaReservation> {
  const cutoff = new Date(now.getTime() - EVENT_QUOTA_WINDOW_MS);

  // Make sure the document exists. Two first time requests can race here; the loser hits the unique index.
  try {
    await EventQuota.updateOne({ userId }, { $setOnInsert: { userId, slots: [] } }, { upsert: true });
  } catch (e) {
    if (!isDuplicateKey(e)) throw e;
  }

  // Drop slots older than 24 hours. Safe to repeat, and safe under concurrency.
  await EventQuota.updateOne({ userId }, { $pull: { slots: { $lte: cutoff } } });

  const reserved = await EventQuota.findOneAndUpdate(
    { userId, [`slots.${EVENT_QUOTA_LIMIT - 1}`]: { $exists: false } },
    { $push: { slots: now } },
    { new: true },
  );
  if (reserved) return { ok: true, slot: now };

  const quota = await EventQuota.findOne({ userId }).lean();
  const live = (quota?.slots ?? []).filter((d) => d.getTime() > cutoff.getTime());
  const oldest = live.reduce((min, d) => (d.getTime() < min.getTime() ? d : min), live[0] ?? now);
  return { ok: false, nextSlotAt: new Date(oldest.getTime() + EVENT_QUOTA_WINDOW_MS) };
}

/** Gives a slot back when the create fails after reserving (validation, upload, or save). */
export async function releaseEventSlot(userId: string, slot: Date): Promise<void> {
  await EventQuota.updateOne({ userId }, { $pull: { slots: slot } });
}
