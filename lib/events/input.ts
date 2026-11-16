// The only event fields a request body may set (spec 0001, AC-8 and AC-11).
// organiserId, ownerBanned, ownerBanExpires, slug, imagePublicId, createdAt and
// updatedAt are never read from the body; the server sets them.
export const EVENT_TEXT_FIELDS = [
    'title',
    'description',
    'overview',
    'venue',
    'location',
    'date',
    'time',
    'mode',
    'audience',
    'organizer',
] as const;

export const EVENT_LIST_FIELDS = ['tags', 'agenda'] as const;

type TextField = (typeof EVENT_TEXT_FIELDS)[number];
type ListField = (typeof EVENT_LIST_FIELDS)[number];

export type EventInput = Partial<Record<TextField, string> & Record<ListField, string[]>>;

export type ParsedEventInput =
    | { ok: true; input: EventInput }
    | { ok: false; message: string };

const parseJsonArray = (raw: FormDataEntryValue): string[] | null => {
    if (typeof raw !== 'string') return null;
    try {
        const value: unknown = JSON.parse(raw);
        return Array.isArray(value) && value.every((v) => typeof v === 'string') ? value : null;
    } catch {
        return null;
    }
};

/**
 * Reads the whitelisted event fields from multipart form data.
 * `partial` (PATCH) lets any field be left out; otherwise tags and agenda are required.
 */
export function parseEventInput(form: FormData, { partial = false } = {}): ParsedEventInput {
    const input: EventInput = {};

    for (const key of EVENT_TEXT_FIELDS) {
        const value = form.get(key);
        if (typeof value === 'string') input[key] = value;
    }

    for (const key of EVENT_LIST_FIELDS) {
        const raw = form.get(key);
        if (raw === null) {
            if (!partial) return { ok: false, message: `${key} must be a JSON array of strings` };
            continue;
        }
        const list = parseJsonArray(raw);
        if (!list) return { ok: false, message: `${key} must be a JSON array of strings` };
        input[key] = list;
    }

    return { ok: true, input };
}
