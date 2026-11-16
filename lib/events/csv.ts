// Bookings CSV (spec 0001, AC-14): a UTF 8 BOM, CRLF line endings, every field quoted,
// and a field starting with = + - @ tab or carriage return prefixed with ' so a
// spreadsheet never runs it as a formula.

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvField(value: string): string {
    const safe = FORMULA_START.test(value) ? `'${value}` : value;
    return `"${safe.replace(/"/g, '""')}"`;
}

export function bookingsCsv(rows: { email: string; bookedAt: Date }[]): string {
    const lines = [
        ['email', 'booked_at_utc'],
        ...rows.map((r) => [r.email, r.bookedAt.toISOString()]),
    ].map((cells) => cells.map(csvField).join(','));
    return `\uFEFF${lines.join('\r\n')}\r\n`;
}

