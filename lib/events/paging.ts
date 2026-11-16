/** Turns `?page=` into a page number within 1..totalPages (past the end shows the last page). */
export function clampPage(raw: string | null | undefined, total: number, perPage: number) {
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const asked = Number.parseInt(raw ?? '', 10);
    const page = Number.isFinite(asked) && asked >= 1 ? Math.min(asked, totalPages) : 1;
    return { page, totalPages, skip: (page - 1) * perPage };
}
