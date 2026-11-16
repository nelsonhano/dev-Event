# DevEvent: Issues To Fix

Audit date: 2026-11-11. No source files were changed while testing.

## How this was tested

- **Static checks:** `tsc --noEmit`, `eslint .`, and `next build`, run both with and without env vars.
- **API:** every route in `app/api/events` was called with `curl`, using valid, missing and malformed input.
- **Database:** the Mongoose models and their pre-save hooks were run against a throwaway in-memory MongoDB. This covered slugs, dates, times, enums, unique indexes and booking validation.
- **UI:** the home page, the event details page and the booking form were driven in headless Chrome, at desktop and mobile widths.
- **Not testable here:** the Cloudinary upload, because no `CLOUDINARY_URL` was available, and PostHog delivery, because there was no real key or network. Remote images showed as broken during the test only because the sandbox had no network access. That is not an app bug.

Severity:
- 🔴 **Blocker:** a core flow is broken.
- 🟠 **Major:** wrong behaviour users will hit.
- 🟡 **Minor:** code quality, correctness edge cases or hygiene.

---

## 🔴 Blockers

### 1. Production build fails: the pages fetch the app's own API at build time
- **Files:** [app/page.tsx:11](app/page.tsx#L11), [components/EventDetails.tsx:45](components/EventDetails.tsx#L45)
- **Problem:** Server components call `fetch(\`${NEXT_PUBLIC_BASE_URL}/api/events\`)`. During `next build` the home page is prerendered, but no server is running yet.
- **Evidence:**
  - Without env vars, the build fails with `TypeError: Failed to parse URL from undefined/api/events`.
  - With env vars set, it fails with `TypeError: fetch failed … ECONNREFUSED`, then `Export encountered an error on /page: /, exiting the build`.
- **Impact:** The app cannot be deployed (for example to Vercel) or built in CI.
- **Fix:** Query MongoDB directly in server components through server functions such as `getAllEvents()` and `getEventBySlug()` in `lib/actions/event.actions.ts`. Keep the `/api` routes for external clients only. This also removes the need for `NEXT_PUBLIC_BASE_URL`.

### 2. New events never appear on the home page: stale cache, no revalidation
- **Files:** [app/page.tsx:9-10](app/page.tsx#L9-L10), [components/EventDetails.tsx:39-40](components/EventDetails.tsx#L39-L40), [app/api/events/route.ts](app/api/events/route.ts)
- **Problem:** The pages use `'use cache'` with `cacheLife('hours')`, but nothing tags or invalidates that cache when an event is created.
- **Evidence:** `GET /api/events` returned 5 events, while the home page rendered **0** event cards. It had cached the empty result from its first load.
- **Fix:**
  - Add `cacheTag('events')` to the cached functions.
  - Call `revalidateTag('events')` or `updateTag('events')` after a successful `POST /api/events`, and after any future update or delete.
  - Do the same per slug for the details page.

### 3. Nobody can create an event from the UI
- **Files:** [components/Navbar.tsx:17](components/Navbar.tsx#L17)
- **Problem:** The "Create Event" link points to `/`, and no create-event page or form exists. `POST /api/events` can only be reached with a hand-built multipart request.
- **Fix:** Build `/events/create` with a form that sends `multipart/form-data` containing `image`, `tags` and `agenda` (both as JSON strings), plus the other fields. Point the nav link to it.

### 4. `POST /api/events` has no authentication
- **Files:** [app/api/events/route.ts:7](app/api/events/route.ts#L7)
- **Problem:** Anyone on the internet can create events and upload files to your Cloudinary account. There is no auth, no rate limit and no file-type or size check.
- **Fix:**
  - Require an authenticated admin or organiser session.
  - Validate the file's MIME type (`image/*`) and size, for example ≤ 5 MB, before uploading.
  - Rate-limit the route.

---

## 🟠 Major

### 5. The image is uploaded to Cloudinary before any other field is validated
- **Files:** [app/api/events/route.ts:25-45](app/api/events/route.ts#L25-L45)
- **Problem:** The order is upload first, then `Event.create()`, which is where validation runs. Requests with missing or invalid fields still upload the image and then fail. That leaves orphaned images in Cloudinary.
- **Fix:** Validate every field first, for example with a Zod schema, then upload, then insert. If the insert fails, delete the uploaded asset.

### 6. Bad input returns 500 instead of 400, and leaks internal error messages
- **Files:** [app/api/events/route.ts:25-26, 48-51, 61-63](app/api/events/route.ts#L25-L63)
- **Evidence:**

  | Request | Actual response | Should be |
  |---|---|---|
  | JSON body instead of multipart | 500 `Content-Type was not one of "multipart/form-data"…` | 400 / 415 |
  | `image` sent as a text field | 500 `file.arrayBuffer is not a function` | 400 |
  | `tags` missing or invalid JSON | `JSON.parse` throws or returns `null`, giving a 500 | 400 |
  | Duplicate title | 500 `E11000 duplicate key … slug_1` | 409 |
  | Mongoose `ValidationError` (bad mode, empty agenda) | 500 | 400 with per-field messages |
- **Other problems:**
  - `GET /api/events` returns the raw error object (`error: e`).
  - The `try/catch` around `Object.fromEntries` (lines 15-19) can never trigger, so it is dead code.
- **Fix:**
  - Check `file instanceof File`.
  - Wrap `JSON.parse` in a `try/catch`.
  - Map `ValidationError` to 400 and error code 11000 to 409.
  - Return generic messages in production.

### 7. Duplicate or symbol-only titles break slug generation
- **Files:** [database/event.model.ts:117-119, 135-143](database/event.model.ts#L117-L143)
- **Evidence:**
  - Creating "React Summit 2026" twice fails with `E11000 duplicate key` on `slug_1`.
  - A title of `!!!` produces an empty slug `""`. A second symbol-only title then collides on `""`.
  - An event with an empty slug gets a card link to `/events/`, which is a 404.
- **Fix:**
  - Make slugs unique by appending a short suffix (`-2`, or a nanoid) on collision.
  - Reject titles whose slug comes out empty.

### 8. Dates shift by one day depending on the server's timezone
- **Files:** [database/event.model.ts:146-152](database/event.model.ts#L146-L152)
- **Evidence:** `date: "May 1, 2026"` was stored as **`2026-04-30`**. `new Date()` parses non-ISO strings as local time, and then `toISOString()` converts the result to UTC.
- **Fix:** Accept only `YYYY-MM-DD`, for example from an `<input type="date">`, and validate it with a regex. Alternatively, build the date from local parts instead of calling `toISOString()`.

### 9. Booking form gives no feedback on failure
- **Files:** [components/BookEvent.tsx:11-22](components/BookEvent.tsx#L11-L22), [lib/actions/booking.actions.ts](lib/actions/booking.actions.ts)
- **Evidence from the browser test:**
  - Submitting with an empty email reached the server (`Email is required`), but the user saw nothing.
  - Booking an email that was already booked (E11000 on `uniq_event_email`) also showed nothing; the form just sat there.
  - A valid new email worked and showed "Thank you for signing up!" ✅
- **Other problems:**
  - The input has no `required` attribute.
  - There is no loading or disabled state, so double-clicks send duplicate requests.
  - The server action returns only `{ success: false }`, with no reason.
- **Fix:**
  - Add `required` to the input.
  - Add pending state, for example with `useActionState` or `useTransition`.
  - Return `{ success: false, message }` with messages such as "You've already booked this event" or "Invalid email", and render them.

### 10. Booking count is hard-coded to 10
- **Files:** [components/EventDetails.tsx:71](components/EventDetails.tsx#L71)
- **Problem:** `const bookings = 10;` means every event says "Join 10 people…". After a real booking and a page reload, it still said 10.
- **Fix:** Use `Booking.countDocuments({ eventId })`, and revalidate it after each booking.

### 11. The event title is never shown on its own details page
- **Files:** [components/EventDetails.tsx:76-80](components/EventDetails.tsx#L76-L80)
- **Problem:** The `<h1>` is the literal text "Event Description", and `title` is never destructured or rendered. The page has no metadata either: `<title>` is always "DevEvent".
- **Fix:** Render `event.title` as the `<h1>` and add `generateMetadata` to `app/events/[slug]/page.tsx`.

### 12. Missing events return HTTP 200 (a "soft 404")
- **Files:** [app/events/[slug]/page.tsx](app/events/[slug]/page.tsx), [components/EventDetails.tsx:49-65](components/EventDetails.tsx#L49-L65)
- **Evidence:** `/events/nope` shows the not-found UI, but the HTTP status is **200**. `notFound()` is called inside a `<Suspense>` boundary after streaming has started.
- **Other problem:** Every fetch error, including a 500 or a database outage, is also turned into `notFound()`, so real outages look like missing pages.
- **Fix:**
  - Resolve the event in the page component, before Suspense, and call `notFound()` there.
  - Let real errors go to an `error.tsx` boundary.

### 13. The "Explore Events" button does nothing
- **Files:** [components/ExploreBtn.tsx](components/ExploreBtn.tsx), [app/page.tsx:21](app/page.tsx#L21)
- **Evidence:** Clicking it changes the URL to `/#events`, but nothing on the page has `id="events"`, so it doesn't scroll (`scrollY` stayed 0). It also leaves a `console.log('CLICK')` in place.
- **Other problem:** An `<a>` nested inside a `<button>` is invalid HTML and an accessibility problem.
- **Fix:** Add `id="events"` to the Featured Events section. Make the control a single `<a href="#events">` styled as a button.

### 14. All navbar links point to `/`
- **Files:** [components/Navbar.tsx:14-18](components/Navbar.tsx#L14-L18)
- **Problem:** Home, Events and Create Event all link to `/`. The `<Link>` elements also sit directly inside `<ul>` with no `<li>`, which is invalid HTML.
- **Fix:** Use real routes (`/`, `/#events` or `/events`, `/events/create`) and wrap each link in `<li>`.

### 15. "Similar events" can throw and has no limit
- **Files:** [lib/actions/event.actions.ts:6-15](lib/actions/event.actions.ts#L6-L15)
- **Problems:**
  - If the event is not found, `event._id` throws. The `catch` hides this.
  - There is no `.limit()`, so a popular tag returns every matching event.
  - Raw `.lean()` documents (ObjectId and Date fields) are passed straight into components.
- **Fix:** Guard against a missing event, add `.limit(3)`, `.select()` only the fields the card needs, and serialise `_id` to a string.

---

## 🟡 Minor / code quality

16. **TypeScript errors are hidden.** [next.config.ts:4-6](next.config.ts#L4-L6) sets `ignoreBuildErrors: true`, but `tsc` reports an error at [components/EventDetails.tsx:73](components/EventDetails.tsx#L73): a `lean()` result is not assignable to `IEvent[]`. Remove the flag and fix the types. Use a plain `EventDTO` type for UI props instead of the Mongoose `Document` interface.
17. **ESLint reports 6 errors and 3 warnings:**
    - `prefer-const`: [route.ts:25-26](app/api/events/route.ts#L25-L26) and [mongodb.ts:19](lib/mongodb.ts#L19)
    - Unescaped `'`: [page.tsx:16](app/page.tsx#L16)
    - `any`: [LightRays.tsx:90,95](components/LightRays.tsx#L90)
    - Unused `IEvent` import: [[slug]/route.ts:4](app/api/events/[slug]/route.ts#L4)
    - Unused `e`: [route.ts:17](app/api/events/route.ts#L17)
    - Unused eslint-disable directive: [mongodb.ts:11](lib/mongodb.ts#L11)
18. **Duplicate slug index.** Mongoose warns `Duplicate schema index on {"slug":1}` because the slug has both `unique: true` on the field and `EventSchema.index({ slug: 1 }, { unique: true })`. Remove one of them.
19. **Nested `<main>`.** [app/layout.tsx:48](app/layout.tsx#L48) and [app/events/[slug]/page.tsx:8](app/events/[slug]/page.tsx#L8) both render `<main>`. Keep only one.
20. **Unstable list keys.** Home and similar-events lists use `key={event.title}`. Use `event._id` or `slug`.
21. **Unknown `slug` field sent to bookings.** `createBooking` passes `slug` to `Booking.create`, but the schema doesn't define it, so it is silently dropped. Remove it or add it to the schema.
22. **Booking pre-save hook hides real DB errors.** [database/booking.model.ts:53-57](database/booking.model.ts#L53-L57): its `catch` rewrites every error, including network errors, as "Invalid events ID format".
23. **Updates bypass normalisation.** Slug, date and time are normalised only in `pre('save')`. Testing confirmed that `findOneAndUpdate({title, date:'garbage'})` stores `date: 'garbage'` and keeps the old slug. No update route exists yet, but add `pre('findOneAndUpdate')` handling, or always update with `.save()`, before adding one.
24. **Time validation is weak.**
    - `mode` is case-sensitive: `"Online"` is rejected. Lowercase it before validating.
    - `"13:00 PM"` is converted to 25:00 and rejected with a confusing message.
25. **PII is sent to analytics.** [components/BookEvent.tsx:18](components/BookEvent.tsx#L18) sends the user's **email** to PostHog in `event_booked`. Drop it, or hash it, and check this against your privacy policy.
26. **PostHog crashes with no key.** [instrumentation-client.ts:3](instrumentation-client.ts#L3) calls `posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!)`, so a missing key produces repeated console errors. Only call `init` when the key exists.
27. **Env configuration is undocumented.**
    - There is no `.env.example`.
    - The README omits `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST`.
    - The README's sample `NEXT_PUBLIC_BASE_URL=http://localhost:3000/` has a trailing slash, which produces `//api/events` URLs.
    - The app gives no clear startup error when `CLOUDINARY_URL` is missing; the first upload fails with `Must supply api_key`.
28. **Dead code.** [lib/constants.ts](lib/constants.ts) is not imported anywhere, and it references `/images/events-full.png`, while the file on disk is `event-full.png`. Delete it or fix it.
29. **Detail page double-caches.** It uses `'use cache'` and also `fetch(..., { next: { revalidate: 60 } })`, which are two conflicting cache policies. Once item 1 is fixed, keep one: `cacheLife` plus `cacheTag`.
30. **Mobile layout:** no horizontal overflow at 375 px. ✅ No action needed.

---

## What works ✅
- `GET /api/events` returns the list, newest first.
- `GET /api/events/[slug]` returns the event. It returns 404 for an unknown slug, 400 for a blank slug, and is case-insensitive.
- `POST /api/events` returns 400 when the image is missing.
- Event model: slug generation, `HH:MM AM/PM` → 24h conversion, the mode enum, required fields, and non-empty tags/agenda checks.
- Booking model: email validation and lowercasing, one booking per email per event, and rejection of non-existent events.
- Booking a new email from the UI saves to the DB and shows "Thank you for signing up!".
- Similar events are matched correctly by shared tags.
- The MongoDB connection is cached across hot reloads.

## Suggested fix order
1. Items 1 and 2: replace the self-fetch with direct DB calls and add cache tags with revalidation. This unblocks deploying the app.
2. Items 4, 5 and 6: secure and validate `POST /api/events`.
3. Items 3, 9 and 10: the create-event page, booking feedback and the real booking count.
4. Items 7, 8 and 11-15: data correctness and page behaviour.
5. Items 16-29: types, lint and cleanup. Then remove `ignoreBuildErrors` so the build enforces types.
