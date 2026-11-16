// Events whose owner is banned are hidden from every public read (spec 0001, AC-18, AC-19).
// `$ne: true` keeps older documents with no ownerBanned field visible. Callers compute
// `now` at read time (inside the cached function, never passed in as a cache key), so a
// ban that expires shows the events again within the cache window.
export const publicVisibility = (now = new Date()) => ({
    $or: [{ ownerBanned: { $ne: true } }, { ownerBanExpires: { $lte: now } }],
});
