export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The first value of a search param, or null. */
export const param = (params: Record<string, string | string[] | undefined>, key: string): string | null => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value) ?? null;
};
