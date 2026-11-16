import type { EventChange } from '@/lib/email/templates';

// The five fields that trigger an "event updated" email (spec 0001, AC-12).
export const NOTICE_FIELDS = [
    { field: 'date', label: 'Date' },
    { field: 'time', label: 'Time' },
    { field: 'venue', label: 'Venue' },
    { field: 'location', label: 'Location' },
    { field: 'mode', label: 'Mode' },
] as const;

type NoticeValues = Partial<Record<(typeof NOTICE_FIELDS)[number]['field'], unknown>>;

/**
 * What changed, comparing the stored document before the edit with the saved document
 * after the model's normalising (YYYY-MM-DD, HH:MM, lowercased mode, trimmed text),
 * so "9:00" → "09:00" is not a change.
 */
export function noticeChanges(before: NoticeValues, after: NoticeValues): EventChange[] {
    return NOTICE_FIELDS.flatMap(({ field, label }) => {
        const from = String(before[field] ?? '');
        const to = String(after[field] ?? '');
        return from === to ? [] : [{ field, label, from, to }];
    });
}

/** Today's date in UTC as YYYY-MM-DD. */
export const todayUtc = (now = new Date()) => now.toISOString().slice(0, 10);

/** The stored date (YYYY-MM-DD) is today or later in UTC; past events send no notice. */
export const isTodayOrLater = (storedDate: string, now = new Date()) => storedDate >= todayUtc(now);
