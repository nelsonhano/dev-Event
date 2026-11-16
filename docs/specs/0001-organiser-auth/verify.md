# Verify: Organiser auth · spec 0001 · updated 2026-11-11
_Steps derived from spec 0001 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._
_Slice 1 covers AC-1 to AC-9 and AC-22 to AC-25. The parts of AC-22 and AC-23 that need roles (Admin link, 404 on `/admin/*` for non admins) arrive with Slice 3._

Setup: `.env.local` with every variable in `.env.example`, a real SMTP account, and GitHub and Google OAuth apps. Run vitest and next from an uppercase `C:\` path on Windows.

## UI / manual
- [ ] Signed out, open `/` → navbar shows Home, Events, Create Event, and a "Sign in" button → AC-22
- [ ] Signed out, click "Create Event" → lands on `/sign-in?callbackURL=%2Fevents%2Fcreate` → AC-22
- [ ] Signed out, open `/dashboard`, `/events/create`, `/admin/users` → each redirects (307) to `/sign-in?callbackURL=<that path>` → AC-23
- [ ] Open `/sign-in?callbackURL=//evil.example`, sign in → lands on `/dashboard`, never evil.example. Repeat with `https://evil.example` and `/\evil.example` → AC-23
- [ ] `/sign-up` with name "  Ada  ", a new email, password of 8 characters → signed in, lands on `/dashboard`, stored name is "Ada", one "Confirm your email for DevEvent" email arrives → AC-1
- [ ] `/sign-up` with a 7 character password, then a 101 character name → inline errors, no account created → AC-1
- [ ] As the unverified user: `/dashboard` and `/events/create` show "Confirm your email to publish events. We sent a link to <email>." with "Resend email"; the create form is not shown → AC-4
- [ ] Click "Resend email" 4 times within an hour → the 4th shows "Try again in N minutes" → AC-4, AC-7
- [ ] Click the verification link → lands on `/dashboard` (through `/verify-email`), notice gone, Create event button shown → AC-1
- [ ] Open an old or edited verification link → `/verify-email` says the link expired or didn't work, with a resend button → AC-1
- [ ] Sign in with GitHub (account with a verified primary email) as a new user → account created, signed in; repeat with Google → AC-2
- [ ] Sign in with a GitHub account that has no verified email → back on `/sign-in` with the "no verified email" message → AC-2
- [ ] Security: sign up with email and password as `victim@x` (don't verify), then sign in with GitHub as `victim@x` → one user (same id), the old password no longer signs in, the earlier session is gone → AC-3
- [ ] Repeat the takeover check with `SUPER_ADMIN_EMAIL` → same result → AC-3
- [ ] `/forgot-password` for an account with a password, an unknown email, and a GitHub only account → the same message every time; only the password account gets an email, and its link expires after 1 hour → AC-5
- [ ] Use the reset link, set a new 8+ character password → every other signed in browser is signed out → AC-5
- [ ] Sign out from the account menu → back on `/`, `/dashboard` redirects to sign in → AC-6
- [ ] As a verified user, open `/events/create` → Organizer field is prefilled with your name and stays editable → AC-8
- [ ] Create an event → it appears on `/`, on its details page, and in `/dashboard` → AC-8, AC-24
- [ ] Signed out: home, event details, similar events, and booking all still work → AC-24

## Commands
- [ ] `npx vitest run` from `C:\Users\Dell\Downloads\dev-events` → all files pass → AC-1, AC-3, AC-5, AC-8, AC-9, AC-24
- [ ] `curl -X POST -H "Origin: $BETTER_AUTH_URL" -F title=x $BETTER_AUTH_URL/api/events` (no cookie) → `401` → AC-8
- [ ] Same with an unverified user's cookie → `403` with `code: "EMAIL_NOT_VERIFIED"`, and no Cloudinary upload → AC-4
- [ ] Same with a verified cookie and `Origin: https://evil.example` → `403 BAD_ORIGIN` → AC-8
- [ ] POST with body fields `organiserId=<other id>`, `ownerBanned=true`, `imagePublicId=x`, `createdAt=2020-01-01` → event owned by the caller, `ownerBanned` false, `imagePublicId` is the real upload id → AC-8
- [ ] Two events with the same title → slugs `title` and `title-2` → AC-8
- [ ] Fire 5 parallel creates from a fresh verified organiser → exactly 3 × `201`, 2 × `429` with `code: "EVENT_QUOTA"`, an ISO `nextSlotAt`, and a `Retry-After` header; only 3 uploads in Cloudinary → AC-9
- [ ] Delete one of those 3 events in the DB, POST again → still `429` (deleted events count) → AC-9
- [ ] 6 × `POST /api/auth/sign-in/email` with `x-forwarded-for: 9.9.9.9` and a wrong password → 5 × `401`, then `429` with `Retry-After` → AC-7
- [ ] 4 × `POST /api/auth/request-password-reset` from one IP within an hour → the 4th is `429` → AC-7
- [ ] Inspect the session cookie → HttpOnly, SameSite=Lax (Secure on https); the session expires 7 days out, and the cookie cache is off → AC-6
- [ ] Stop SMTP (wrong `SMTP_HOST`), sign up → sign up still succeeds; the log shows `Email send failed` with `template: "verify-email"` and `recipients: 1` and no address → AC-25
- [ ] `npm run backfill:owners` before the super admin has signed in → prints "Sign in once as SUPER_ADMIN_EMAIL, then run this again", nothing changes → AC-24
- [ ] Sign in as the super admin, run it twice → the first run sets `organiserId` on every ownerless event (and `organizer` is unchanged), the second updates 0 → AC-24

## Value sourcing checks
- [ ] `organiserId` on a new event equals `session.user.id` from `GET /api/auth/get-session` (hex string, same as the user `_id`) → Value sourcing: Create event `organiserId`
- [ ] Organizer default is the session name, not the email → Value sourcing: Organizer field default
- [ ] `EventQuota.slots` for the user holds one date per create, and a failed create (invalid mode) leaves no slot behind → Value sourcing: quota slot
- [ ] `nextSlotAt` equals the oldest slot + 24 hours → Value sourcing: `nextSlotAt`
- [ ] `imagePublicId` on the event equals the Cloudinary `public_id` → Value sourcing: `imagePublicId`
- [ ] Flip `emailVerified` to true directly in the DB → the next request can create (no cache lag) → Value sourcing: verified or not
- [ ] Set `BETTER_AUTH_URL` to `http://127.0.0.1:3000` and browse at `localhost:3000` → creates get `403 BAD_ORIGIN` (the origin comes only from `BETTER_AUTH_URL`) → Value sourcing: origin allowed
- [ ] Links in verification and reset emails start with `BETTER_AUTH_URL` → Value sourcing: absolute app URL

## Acceptance-criteria coverage
- AC-1: sign up steps, verification link steps, vitest `lib/auth.test.ts`
- AC-2: GitHub/Google sign in steps, vitest (validateUserInfo)
- AC-3: takeover steps, vitest (account create hook)
- AC-4: unverified notice steps, `EMAIL_NOT_VERIFIED` curl, resend limit
- AC-5: forgot password steps, vitest (no email for OAuth only accounts)
- AC-6: sign out step, cookie inspection
- AC-7: sign in and reset rate limit commands
- AC-8: curl gates, whitelist, slug, prefill, vitest `app/api/events/route.test.ts`
- AC-9: parallel quota command, deleted events still count, vitest
- AC-22: navbar steps (Admin link in Slice 3)
- AC-23: proxy redirect and callbackURL steps (admin 404 in Slice 3)
- AC-24: anonymous regression step, backfill commands
- AC-25: SMTP down command

---

# Slice 2: organiser dashboard · updated 2026-11-11
_Covers AC-10 to AC-14 (plus AC-4 delete for unverified owners and AC-25). "Admin" checks need Slice 3 roles; until then set `role: "admin"` on a user directly in the DB to try them._

## UI / manual
- [ ] New verified organiser, no events: `/dashboard` shows "You haven't created any events yet" and a "Create event" button → AC-10
- [ ] With 23 events: page 1 lists 20 newest created first, each row has title, date, booking count, View, Edit, Bookings, Delete; Next goes to `?page=2` with 3 rows; `?page=99` shows page 2; `?page=abc` shows page 1 → AC-10
- [ ] On a 375px phone the dashboard rows wrap their actions under the title, with no sideways page scroll → AC-10
- [ ] Edit: open `/dashboard/events/<slug>/edit`, every field is prefilled, the current banner shows, saving with no new file keeps the banner → AC-11
- [ ] Edit the title → the page `/events/<slug>` shows the new title right away and the slug in the URL is unchanged → AC-11
- [ ] Edit with a new banner → the event shows the new image; the old image disappears from Cloudinary (when it had an `imagePublicId`) → AC-11
- [ ] Unverified owner opens the edit page → the confirm email notice instead of the form → AC-4
- [ ] Another organiser opens your edit page → "You don't have access to this" → AC-11
- [ ] Event dated today or later with 2 bookings: change the venue and time in one save → each attendee gets exactly one "Update: <title> has changed" email listing both, old → new → AC-12
- [ ] Same event: change only the audience, or retype "9:00" for "09:00" → no email → AC-12
- [ ] Event dated in the past: change the venue → no email → AC-12
- [ ] Delete from the dashboard row: dialog reads "Delete <title>? This cancels N bookings and emails every attendee. This can't be undone."; "Keep event" and Escape close it; "Delete event" lands on `/dashboard` and the event is gone from the home page, its details page, and similar events → AC-13
- [ ] Each attendee of the deleted event gets one "Cancelled: <title>" email with the planned date → AC-13
- [ ] Unverified owner can delete their event from the dashboard → AC-4, AC-13
- [ ] `/dashboard/events/<slug>/bookings` with 57 bookings: 50 rows newest first, times like `2026-11-11T12:21:33.992Z`, Next shows the other 7 → AC-14
- [ ] Bookings page as another organiser → "You don't have access to this"; as a user with role admin → allowed → AC-14

## Commands
- [ ] `npx vitest run app/api/events` from `C:\Users\Dell\Downloads\dev-events` → all pass (PATCH, DELETE, CSV) → AC-11 to AC-14
- [ ] `curl -b <cookie> -H "Origin: $BETTER_AUTH_URL" -X PATCH -F venue=X $BETTER_AUTH_URL/api/events/<slug>` → 200; without a cookie 401; with `Origin: https://evil.example` 403; unknown slug 404; another organiser's cookie 403 → AC-11
- [ ] PATCH with `-F organiserId=<other>` → owner unchanged → AC-11
- [ ] PATCH with `-F mode=virtual` → 400 with `errors.mode`, nothing saved → AC-11
- [ ] `curl -b <cookie> -H "Origin: $BETTER_AUTH_URL" -X DELETE $BETTER_AUTH_URL/api/events/<slug>` → 204; bookings for it are gone from the `bookings` collection → AC-13
- [ ] Stop SMTP, delete an event with bookings → still 204, bookings removed, log shows `Email send failed` with `template: "event-cancelled"` and a count, no addresses → AC-13, AC-25
- [ ] `curl -b <cookie> -o b.csv $BETTER_AUTH_URL/api/events/<slug>/bookings.csv` → starts with bytes `EF BB BF`, header `"email","booked_at_utc"`, CRLF line ends, every booking (not 50), filename `<slug>-bookings.csv` → AC-14
- [ ] Insert a booking whose email starts with `=` directly in the DB, export → that field reads `"'=..."` → AC-14
- [ ] Set `ownerBanned: true` on an event, open its bookings page and CSV → still reachable → AC-14

## Value sourcing checks
- [ ] Dashboard booking count equals `db.bookings.countDocuments({ eventId })` for several rows → booking count per event (one aggregate)
- [ ] The update email lists values after the model's normalising (`HH:MM`, lowercased mode, trimmed text) → "what changed"
- [ ] Change a future event's date to a past date → email sent (the check uses the stored date before the edit, in UTC) → send notice or not
- [ ] Recipients for update and cancel emails match the bookings that existed before the save or delete → attendee recipients
- [ ] Deleting an event with no `imagePublicId` logs a warning and leaves the image → Cloudinary public id
- [ ] Bookings page and CSV times equal `Booking.createdAt` as UTC ISO → email, booked at
- [ ] The update email link starts with `BETTER_AUTH_URL` → absolute app URL

## Acceptance-criteria coverage (Slice 2)
- AC-10: dashboard steps, paging, phone layout
- AC-11: edit steps, PATCH commands, vitest `app/api/events/[slug]/manage.test.ts`
- AC-12: notice email steps and value sourcing checks, vitest
- AC-13: delete dialog and email steps, DELETE commands, vitest
- AC-14: bookings page steps, CSV commands, vitest

---

# Slice 3: roles, bans, admin console, audit log · updated 2026-11-11
_Covers AC-15 to AC-21, plus the admin parts of AC-22 and AC-23. Use two browsers (or a private window) so you can be the super admin, an admin, and an organiser side by side._

## UI / manual
- [ ] Sign in verified as `SUPER_ADMIN_EMAIL` → account menu shows Admin; `/admin` opens `/admin/users` with the Users, Admins, and Audit log tabs → AC-15, AC-22
- [ ] Signed in as a plain organiser, open `/admin/users`, `/admin/admins`, `/admin/audit` → the not found page each time (note: HTTP status is still 200, scope feature 4) → AC-23
- [ ] `/admin/admins`: search a verified organiser, "Make admin" → they move to Current admins, get "You're now a DevEvent admin" naming you with a link to `/admin`; an audit entry "Made admin" appears → AC-16, AC-20
- [ ] Search for an unverified or banned user on `/admin/admins` → they don't appear as promotable → AC-16
- [ ] "Remove admin" on an admin → they become a user and get "Your DevEvent admin access was removed" → AC-16
- [ ] As an admin (not super admin): `/admin/users` works; `/admin/admins` and `/admin/audit` show not found; there is no Ban button on other admins or the super admin → AC-16, AC-18, AC-20
- [ ] `/admin/users`: search "EXAMPLE.COM", "ada", and `a.b(` (regex characters) → case insensitive substring matches, no error; newest sign up first, 20 per page, with role, status, and event count → AC-17
- [ ] Ban an organiser with a reason and no expiry → they are signed out at once, their events vanish from the home page, details pages, and similar events, and they get "Your DevEvent account is suspended" (permanently) → AC-18
- [ ] Ban dialog: an expiry under 1 hour or over 1 year is refused; a valid one is picked in your local time and the users list shows it in UTC → AC-18
- [ ] Ban someone already banned with a new reason → reason and expiry update, a second "Banned" audit entry appears, and they get another email → AC-18, AC-20
- [ ] The banned user tries email sign in, then GitHub, then Google → each lands on `/sign-in?error=banned` showing "Your account is suspended", the reason, and the expiry → AC-18
- [ ] Open `/sign-in?error=banned&ban=anything` by hand → only the generic suspended notice, no made up text → AC-18
- [ ] Unban → events reappear, user gets "Your DevEvent account is active again", "Unbanned" audit entry → AC-18, AC-20
- [ ] As the super admin, edit and then delete another organiser's event → two audit entries (Edited event with the changed fields, Deleted event with the booking count); do the same to your own event → no entries → AC-20
- [ ] `/admin/audit` lists entries newest first, 50 per page → AC-20
- [ ] On a 375px phone, `/admin/users` doesn't scroll the page sideways (the table scrolls in its box), and the ban dialog fits the screen → AC-17

## Commands
- [ ] `npx vitest run lib/auth.admin.test.ts lib/admin` from `C:\Users\Dell\Downloads\dev-events` → all pass → AC-15, AC-16, AC-18, AC-19, AC-20, AC-21
- [ ] As the super admin (cookie) and as an admin: `curl -X POST -b <cookie> -H "Origin: $BETTER_AUTH_URL" -H 'content-type: application/json' -d '{"userId":"<id>","role":"superadmin"}' $BETTER_AUTH_URL/api/auth/admin/set-role` → 403 `ADMIN_HTTP_DISABLED`; same for `/admin/ban-user`, `/admin/impersonate-user`, `/admin/create-user`, `/admin/set-user-password`, `/admin/remove-user` → AC-21
- [ ] In the DB, `db.user.updateOne({email:"x"},{$set:{role:"superadmin"}})` while another superadmin exists → duplicate key error (index `one_superadmin`) → AC-15
- [ ] Change `SUPER_ADMIN_EMAIL` to another verified user and restart → the old super admin can't promote or ban others on their very next request (before they sign in again); the new one signs in and their stored role becomes `superadmin`, the old one `user` → AC-15
- [ ] Set a banned user's `banExpires` 1 minute ahead in the DB (and `ownerBanExpires` on their events), wait → they can sign in again, the users list shows Active, and their events return within the cache window (at most 1 hour) → AC-17, AC-19
- [ ] Break hiding: make `Event.updateMany` fail (stop the DB briefly mid action) → the ban action shows an error mentioning `npm run reconcile:bans`; run it → events match ban state; run it again → "updated 0 event(s)" → AC-18
- [ ] Make the audit insert fail during "Make admin" → the action errors and the role is put back to user, no email → AC-20

## Value sourcing checks
- [ ] Super admin is decided from `SUPER_ADMIN_EMAIL` (lowercased, trimmed) plus `emailVerified`: try `  BOSS@Example.com ` in the env → still matches; an unverified account with that email → not super admin → who is super admin
- [ ] Users list status uses `banned && (!banExpires || banExpires > now)`: a stored `banned: true` with a past `banExpires` shows Active → effective ban status
- [ ] Event counts on `/admin/users` equal `db.events.countDocuments({ organiserId })` for each row → users list event count
- [ ] Search escapes regex characters (`.*` matches literally) → users list search
- [ ] Public pages hide an event exactly when `ownerBanned` is true and `ownerBanExpires` is empty or in the future; an old event with no `ownerBanned` field stays visible → public visibility
- [ ] Audit entries show the actor's email and the target's email or event title as it was at the time (rename an event after editing it as super admin; the entry keeps the old title) → audit entry actor, target label
- [ ] Ban email and `/sign-in?error=banned` show the reason and expiry from the ban itself (the plugin's signed notice) → ban email and sign in page

## Acceptance-criteria coverage (Slice 3)
- AC-15: menu, env change, unique index, vitest `lib/auth.admin.test.ts`, `lib/admin/moderation.test.ts`
- AC-16: admins page steps, vitest
- AC-17: users page search and status steps, value sourcing checks
- AC-18: ban, re ban, unban, banned sign in steps, reconcile command, vitest
- AC-19: expiry command, vitest
- AC-20: audit steps and commands, vitest (moderation and `manage.test.ts`)
- AC-21: curl lockout commands, vitest
- AC-22, AC-23 (admin parts): menu and not found steps
