# 0001. Organiser accounts, roles, and moderation with Better Auth

**Date**: 2026-11-11
**Status**: In Progress

## Summary

Right now anyone on the internet can post an event and upload files to the Cloudinary account. This spec adds organiser accounts (sign in with GitHub, Google, or email and password) using Better Auth, a self hosted auth library that stores users in the MongoDB database you already run. Every event gets an owner. Organisers get a dashboard to manage their own events and see who booked. One super admin (set by an environment variable) manages a team of admins, who can ban spammers and see bookings. Attendees keep booking with just an email, no account needed.

## Requirements

**User stories**:
- As an organiser, I want to sign up with GitHub, Google, or email and password so that I can post my events.
- As an organiser, I want to edit, delete, and see bookings for my own events so that I can run them without asking anyone.
- As an attendee, I want to book with just my email, and hear about it if my event changes or is cancelled.
- As an admin, I want to find and ban spam organisers so that the public pages stay clean.
- As the super admin, I want to choose who the admins are, and remove any bad event, so that moderation has an owner.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):

*Identity and sessions*
- **AC-1**: A visitor can sign up at `/sign-up` with name (1 to 100 characters, trimmed), email, and password (8 to 128 characters). The account is created with role `user`, a verification email is sent, and the visitor is signed in. Clicking the verification link marks the email verified and lands on `/dashboard`.
- **AC-2**: A visitor can sign in with GitHub or Google. A first sign in creates the account with role `user`. The email counts as verified only when the provider itself reports it verified (GitHub's verified primary email, Google's `email_verified`). If the provider gives no verified email, sign in is refused with a message saying so.
- **AC-3**: Signing in with GitHub or Google using the same verified email as an existing account links to that one account (same user, same events). It never creates a second user. If the existing account's email was not yet verified, linking deletes its password login and signs out all its sessions, so a password set by someone else before verification can never be used (account takeover before sign up).
- **AC-4**: An organiser whose email is not verified can sign in, open `/dashboard`, delete their own events, and view their bookings, but creating or editing an event is blocked. The dashboard and create page show the notice "Confirm your email to publish events. We sent a link to <email>." with a "Resend email" button (subject to AC-7, which shows "Try again in N minutes" on `429`). The API returns `403` with code `EMAIL_NOT_VERIFIED`.
- **AC-5**: "Forgot password" at `/forgot-password` sends a reset link that expires in 1 hour. The response is the same whether or not the email exists, and whether or not the account has a password. Accounts with only GitHub or Google get no email. Using the link sets the new password (same 8 to 128 rule as AC-1) and signs out every other session.
- **AC-6**: A session lasts 7 days and is extended (at most once a day) while the organiser stays active. Sign out ends it immediately. The session cookie cache stays off, so role and ban changes take effect on the very next request.
- **AC-7**: Auth endpoints are rate limited per client IP (read from `x-forwarded-for`): sign in and sign up 5 per minute, password reset requests and verification resends 3 per hour, and every other auth path 60 per minute. Going over returns `429` with a `Retry-After` header.

*Event ownership and the organiser dashboard*
- **AC-8**: `POST /api/events` with no session returns `401` before the body is read or anything is uploaded. With a verified session, the event is saved with `organiserId` set to the signed in user. Only the known event fields are accepted. Any `organiserId`, `ownerBanned`, `ownerBanExpires`, `slug`, `imagePublicId`, `createdAt`, or `updatedAt` in the body is ignored. A request whose `Origin` header is not `BETTER_AUTH_URL` gets `403`. On `/events/create`, the Organizer field is prefilled with the user's name and stays editable. Two identical titles still get distinct slugs (`-2`, `-3`, as the model already does).
- **AC-9**: An organiser who has created 3 events in the last 24 hours (counting every create, including events later deleted or hidden by a ban) gets `429` with body `{ code: "EVENT_QUOTA", nextSlotAt: <ISO time> }` and a `Retry-After` header, and nothing is uploaded to Cloudinary. The check is atomic: 5 parallel POSTs from an organiser with 0 events used create exactly 3 events.
- **AC-10**: `/dashboard` lists the signed in organiser's own events, newest created first (`createdAt` desc), 20 per page with Previous and Next links (a page past the end shows the last page). Each row shows the title, date, booking count, and links to View, Edit, and Bookings. With no events it shows "You haven't created any events yet" and a "Create event" button.
- **AC-11**: The owner, or the super admin, can edit an event at `/dashboard/events/[slug]/edit` (including replacing the banner image). PATCH uses the same field whitelist, validators, and `Origin` check as create. Fields left out keep their values, and `tags` and `agenda`, when sent, replace the old lists. The slug never changes, even when the title does. A missing slug gets `404`; anyone else gets `403`.
- **AC-12**: When an edit changes the date, time, venue, location, or mode of an event that has bookings and whose date is today or later, each attendee gets exactly one "event updated" email per save, listing the old and new values. Values are compared after the same normalising the model applies on save (`YYYY-MM-DD`, `HH:MM`, lowercased mode, trimmed text). Edits to other fields, and edits to past events, send no email.
- **AC-13**: The owner, or the super admin, can delete an event after confirming in a dialog ("Delete <title>? This cancels N bookings and emails every attendee. This can't be undone."). The attendee emails are read first, then the event is deleted, then its bookings. Each attendee gets a "cancelled" email, the Cloudinary image is removed (when `imagePublicId` is set), the user lands on `/dashboard`, and the event disappears from the home page, details page, and similar events right away.
- **AC-14**: `/dashboard/events/[slug]/bookings` shows email and booked at time (UTC, ISO format), 50 per page, newest first, with a "Download CSV" button. Only the owner, any admin, and the super admin can see it. A missing slug gets `404`, and everyone else gets `403`. Events hidden by a ban are still reachable here. The CSV holds every booking (not just one page): a header row `email,booked_at_utc`, CRLF line endings, a UTF 8 BOM, and filename `<slug>-bookings.csv`. Every field is quoted, and a field starting with `=`, `+`, `-`, `@`, tab, or carriage return is prefixed with `'` (to stop spreadsheet formula injection).

*Roles and moderation*
- **AC-15**: Super admin is decided on every check, not stored as truth: a user is super admin exactly when their email equals `SUPER_ADMIN_EMAIL` (lowercased, trimmed) and is verified. On sign in, the stored `role` is brought in line: any other `superadmin` is first demoted to `user`, then the matching user is set to `superadmin`. A unique index allows at most one stored `superadmin`. If the env var changes, the new person is super admin at their next request, and the old one loses every super admin power immediately (even before their stored role is fixed). No UI or API can ever grant `superadmin`.
- **AC-16**: On `/admin/admins` the super admin can search existing verified, unbanned users, promote one to `admin`, or demote an admin to `user`. The promoted person gets an email naming who granted the role, with a link to `/admin`. A demoted person also gets an email. Promoting someone who is already an admin, or demoting someone who isn't one, returns `400` and sends no email and writes no audit entry. The super admin cannot change their own role.
- **AC-17**: On `/admin/users`, admins and the super admin can search users by email or name (case insensitive substring, with regex special characters escaped), newest sign up first, 20 per page, and see each user's role, ban status (with reason and expiry), and event count. Ban status is computed when the page loads: a ban whose expiry has passed shows as "Active", even if the stored flag hasn't been cleared yet.
- **AC-18**: Banning requires a reason (1 to 500 characters), and the expiry is optional: an empty expiry means permanent, otherwise it must be at least 1 hour and at most 1 year from now, and the date picker uses the admin's local time zone and is stored in UTC. An admin can ban only users with role `user`. The super admin can ban anyone except themselves. Banning someone already banned updates the reason and expiry (with a new audit entry and email). A ban revokes all the user's sessions and blocks sign in. Every sign in method (email form, GitHub, Google) then lands on `/sign-in?error=banned`, which shows the reason and expiry. Their events are hidden from every public page, and they get an email. Unbanning restores their events and sends an email. If hiding or restoring their events fails, the action returns an error and can be retried.
- **AC-19**: When a ban's expiry passes, the user can sign in again and their events reappear publicly within the public cache window (at most 1 hour), with no manual step.
- **AC-20**: Every role grant or revoke, ban or unban, and every edit or delete of an event by someone who is not its owner, writes one audit log entry (who, what, target, when, details). For role changes, a failed audit write fails the whole action (the role is put back). For bans and event moderation, a failed audit write is logged and the action still succeeds. `/admin/audit` shows the entries to the super admin only, newest first, 50 per page. The super admin acting on their own event is not logged.
- **AC-21**: Every Better Auth admin HTTP endpoint (`/api/auth/admin/*`) returns `403` for every caller. All admin operations go only through the app's server actions, which apply the rules: admins cannot set roles or ban admins, nobody can ban the super admin, and nobody can impersonate, create, delete, or set the password of a user.

*Navigation, guards, and keeping what works*
- **AC-22**: The navbar shows "Sign in" when signed out. When signed in it shows an account menu with Dashboard, Admin (admins and the super admin only), and Sign out. "Create Event" sends a signed out visitor to `/sign-in?callbackURL=/events/create`.
- **AC-23**: Signed out visitors who open `/dashboard/*`, `/events/create`, or `/admin/*` are sent to `/sign-in` and come back after signing in. `callbackURL` is followed only when it is a relative path starting with a single `/` (anything else falls back to `/dashboard`, so it can't be used as an open redirect). Signed in users who are not an admin or the super admin get a 404 on `/admin/*`.
- **AC-24**: The home page, event details, similar events, and booking keep working for anonymous visitors exactly as they do today. After the backfill script runs, every existing event is owned by the super admin account, and its `organizer` text is left as it was. If the super admin has never signed in, the script stops with "Sign in once as SUPER_ADMIN_EMAIL, then run this again" and changes nothing.
- **AC-25**: If sending an email fails (SMTP down), the action that triggered it still succeeds, the failure is logged with the template name and recipient count, and verification and reset emails can be requested again.

## Decision

**Chosen option**: Option 1: Better Auth, self hosted, with its admin plugin, and moderation only through the app's server actions.

Organiser identity, sessions, and roles run on Better Auth, stored in the existing MongoDB database through its MongoDB adapter. Three roles (`user`, `admin`, `superadmin`) come from the admin plugin, which also blocks banned users from signing in. The plugin's own HTTP endpoints are switched off with one blanket `403` hook. Every privileged rule, audit entry, and email lives in the server actions, backed by one shared `lib/auth/policy.ts`, and those actions are the only way in.

**Implementation skills**: `mongodb-connection` (`mongodb/agent-skills`, `.claude/skills/mongodb-connection/`). The Better Auth skills picked during design are not installed yet (the install failed on a network error). See Follow-up.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

Better Auth collections (created and owned by the library; the admin plugin adds the role and ban fields):

| Collection | Fields | Constraints |
|---|---|---|
| `user` | `_id`, `name` (req, 1 to 100), `email` (req), `emailVerified` (bool, req), `image` (opt), `role` (`user` \| `admin` \| `superadmin`, default `user`), `banned` (bool, default false), `banReason` (opt), `banExpires` (Date, opt), `createdAt`, `updatedAt` | `email` unique · partial unique index on `role` where `role = "superadmin"` (at most one) |
| `session` | `_id`, `token`, `userId` → user, `expiresAt`, `ipAddress` (opt), `userAgent` (opt) | `token` unique |
| `account` | `_id`, `userId` → user, `providerId` (`credential` \| `github` \| `google`), `accountId`, `password` (hashed, credential only) | one user has many accounts |
| `verification` | `_id`, `identifier`, `value`, `expiresAt` | email verify and password reset tokens |
| `rateLimit` | managed by Better Auth when `rateLimit.storage = "database"` | |

App collections:

| Collection | Change | Fields | Constraints and indexes |
|---|---|---|---|
| `Event` | changed | + `organiserId` (string, the Better Auth user id in its string form, req) · + `imagePublicId` (string, opt; set at upload, empty for events made before this) · + `ownerBanned` (bool, default false) · + `ownerBanExpires` (Date, opt) · `organizer` (string, req) stays as the editable display name · all current fields unchanged | index `{ organiserId: 1, createdAt: -1 }` · index `{ ownerBanned: 1 }` · `slug` generated only when the document is new |
| `Booking` | unchanged | `eventId` → Event, `email`, `createdAt` (booked at), `updatedAt` | unique `{ eventId, email }` (exists) · `{ eventId: 1, createdAt: -1 }` (exists) |
| `EventQuota` | new | `userId` (string, req), `slots` (Date[], the create times within the last 24 hours) | `userId` unique · one document per organiser, created on first use |
| `AuditLog` | new | `actorId` (string, req), `actorEmail` (req), `action` (`role.grant` \| `role.revoke` \| `user.ban` \| `user.unban` \| `event.update` \| `event.delete`, req), `targetType` (`user` \| `event`, req), `targetId` (string, req), `targetLabel` (email or title copied at the time, req), `meta` (object, opt: reason, expiry, changed fields), `createdAt` | index `{ createdAt: -1 }` · kept indefinitely · insert only |

Relationships: user 1:N Event (`organiserId`) · user 1:1 EventQuota · Event 1:N Booking · user 1:N account · user 1:N session · user 1:N AuditLog (as actor).

**Id type rule**: every app reference to a user (`organiserId`, `EventQuota.userId`, `AuditLog.actorId`) stores the string from `session.user.id`, and every comparison and `$group` uses that string. The adapter's own `_id` type is checked once in Slice 1 by a test (create a user, create an event, look it up by `session.user.id`).

**State transitions**:
- User role: `user` ⇄ `admin` (super admin only, never on self, only verified and unbanned targets). `superadmin` is never set by a person: `policy.isSuperAdmin(user)` is true exactly when the email matches `SUPER_ADMIN_EMAIL` and is verified, and the stored role is synced to match at sign in (demote the others first, then promote).
- User ban: `active` → `banned` (reason required, optional `banExpires`) → `active` (manual unban, or `banExpires` passing). Better Auth clears the stored flag on the next sign in attempt after expiry. Until then, every read computes the effective status as `banned && (!banExpires || banExpires > now)`. A ban on a banned user updates the reason and expiry and stays `banned`.
- Event visibility: `public` → `hidden` while its owner is banned (`ownerBanned = true` and `ownerBanExpires` is empty or in the future) → `public` again on unban or expiry.

**API surface**:

| Endpoint / action | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/auth/[...all]` | GET, POST | Better Auth routes (sign up, sign in email / social, sign out, verify email, send verification, request and reset password, get session). Every `/admin/*` path returns `403` over HTTP | session cookie, user (with `role`, `banned`, `banExpires`) | per route | 401, 403 banned, 403 admin path, 429 |
| `/api/events` | POST | multipart: whitelisted event fields, `image`, `tags`, `agenda` | `201` event | verified organiser, same origin | 401, 403 `EMAIL_NOT_VERIFIED`, 403 bad origin, 429 `EVENT_QUOTA` + `nextSlotAt`, 400, 409 (slug race) |
| `/api/events` | GET | none | events (public only) | public | 500 |
| `/api/events/[slug]` | GET | slug | event (404 when hidden) | public | 404 |
| `/api/events/[slug]` | PATCH | multipart: any whitelisted field, optional `image`; missing fields unchanged, `tags` and `agenda` replace | `200` event | owner or superadmin, verified, same origin | 401, 403, 404, 400 |
| `/api/events/[slug]` | DELETE | slug | `204` | owner or superadmin (verification not needed), same origin | 401, 403, 404 |
| `/api/events/[slug]/bookings.csv` | GET | slug | `text/csv` attachment, all rows | owner, admin, superadmin | 401, 403, 404 |
| `/dashboard` | page | `?page` | own events + booking counts | signed in | redirect to `/sign-in` |
| `/dashboard/events/[slug]/edit` | page | slug | prefilled edit form | owner or superadmin | redirect, 403 page |
| `/dashboard/events/[slug]/bookings` | page | slug, `?page` | bookings table | owner, admin, superadmin | redirect, 403 page |
| `/admin/users` | page | `?q`, `?page` | users with role, ban, event count | admin, superadmin | 404 |
| `/admin/admins` | page | `?q` | admins + search to promote | superadmin | 404 |
| `/admin/audit` | page | `?page` | audit entries | superadmin | 404 |
| `banUser(userId, reason, expiresAt?)` | server action | userId, reason (1 to 500 chars), optional ISO date 1 hour to 1 year ahead | `{ ok }` or `{ ok: false, message }` | admin, superadmin (policy) | 403, 400, 500 visibility sync failed (retryable) |
| `unbanUser(userId)` | server action | userId | `{ ok }` or message | admin, superadmin (policy) | 403, 400 not banned |
| `setAdminRole(userId, makeAdmin)` | server action | userId, boolean | `{ ok }` or message | superadmin | 403, 400 already in role / not verified / banned |
| `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`, `/verify-email` | pages | `callbackURL` (relative paths only), `token`, `error` | forms; `/sign-in?error=banned` shows the reason and expiry | public | inline errors |

**How admin actions run**: each server action loads the caller with `auth.api.getSession({ headers })`, checks the rule in `lib/auth/policy.ts`, and loads the target user. It then calls the plugin from the server (`auth.api.banUser`, `unbanUser`, `setRole`, `revokeUserSessions`), which has no HTTP request, so the blanket hook (which rejects any `/admin/*` call that arrives with `ctx.request`) lets it through. After that it updates event visibility, writes the audit entry, invalidates the `events` tag with `updateTag` (read your own writes, so hidden events vanish on the very next request), and queues the email, in that order.

**Email templates** (all from `EMAIL_FROM`, plain HTML plus a text version, no tracking, footer "You got this because of activity on DevEvent"):

| Template | To | Subject | Body includes |
|---|---|---|---|
| `verify-email` | new organiser | Confirm your email for DevEvent | the link (expires in 24 hours) |
| `reset-password` | organiser with a password | Reset your DevEvent password | the link (expires in 1 hour), "ignore this if it wasn't you" |
| `event-updated` | each attendee | Update: <title> has changed | each changed field, old → new, and the event link |
| `event-cancelled` | each attendee | Cancelled: <title> | the date it was planned for, and that the booking is removed |
| `role-granted` | new admin | You're now a DevEvent admin | granter's name, a link to `/admin` |
| `role-revoked` | former admin | Your DevEvent admin access was removed | granter's name |
| `user-banned` | banned user | Your DevEvent account is suspended | reason, expiry or "permanent", that their events are hidden |
| `user-unbanned` | unbanned user | Your DevEvent account is active again | that their events are visible again |

Attendees have no name on file, so attendee emails open with "Hi there".

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Create event | `organiserId` | `session.user.id` from `auth.api.getSession` |
| Create event | Organizer field default | `session.user.name`, passed from the create page (server) to `CreateEventForm` as a prop |
| Create event | quota slot (atomic) | `EventQuota.findOneAndUpdate({ userId, "slots.2": { $exists: false } } after pulling slots older than 24h, { $push: { slots: now } }, { upsert: true })`. No document returned means the quota is full. The slot is pulled again if validation, upload, or save fails |
| Create event | `nextSlotAt` | the oldest date in `EventQuota.slots` + 24 hours |
| Create / upload | `imagePublicId` | `upload.public_id` from the Cloudinary upload result |
| Create / edit gate | verified or not | `session.user.emailVerified` |
| Create / edit / delete | origin allowed | `Origin` request header compared with `new URL(BETTER_AUTH_URL).origin` |
| Dashboard | booking count per event | one aggregate `$group` on `Booking` by `eventId` over the page's event ids |
| Edit | "what changed" in the email | the stored document before save vs the document after the model's normalising, for `date`, `time`, `venue`, `location`, `mode` |
| Edit | send notice or not | stored `date` (`YYYY-MM-DD`) compared with today's date in UTC: today or later sends |
| Edit / delete | attendee recipients | `Booking.find({ eventId }).select('email')`, read before any write |
| Delete | Cloudinary public id | `Event.imagePublicId`. When it's empty (older events), the image is left in Cloudinary and a warning is logged |
| Bookings page | email, booked at | `Booking.email`, `Booking.createdAt` shown as UTC ISO |
| Role email | granter name, dashboard link | `session.user.name`, `${BETTER_AUTH_URL}/admin` |
| Ban email and `/sign-in?error=banned` | reason, expiry | `banReason`, `banExpires` from the action input. The sign in page reads them via a small server lookup by the email in the failed attempt, or from the error the plugin returns (whichever the installed version supports) |
| Super admin check | who is super admin | `SUPER_ADMIN_EMAIL` env (lowercased, trimmed) compared with `user.email`, and `user.emailVerified` |
| Users list / admin checks | effective ban status | `banned && (!banExpires \|\| banExpires > now)` computed at read time |
| Public visibility | hidden or not | `Event.ownerBanned` + `Event.ownerBanExpires` compared with `now`, computed inside the cached function (never passed in as an argument) |
| Users list | event count | `Event` aggregate `$group` by `organiserId` over the page's user ids |
| Users list | search | `q` with regex special characters escaped, matched case insensitively against `email` and `name` |
| Audit entry | actor, target label | `session.user.id` / `.email`; target user's email or event title read before the change |
| All email links | absolute app URL | `BETTER_AUTH_URL` |

**Key invariants**:
- Super admin power comes only from `policy.isSuperAdmin(user)` (email matches `SUPER_ADMIN_EMAIL` and is verified). The stored `superadmin` role exists for the plugin's permissions, the unique index allows at most one, and a stale stored role alone grants nothing.
- `superadmin` is never accepted as a value in `setRole`. Nobody can change their own role or ban themselves.
- An admin can ban or unban only users whose role is `user`.
- A user never keeps a password login that was created while their email was unverified once a GitHub or Google account links to them.
- Every event created after this ships has `organiserId`. After the backfill, every event has one.
- No request body can set `organiserId`, `ownerBanned`, `ownerBanExpires`, `slug`, `imagePublicId`, `createdAt`, or `updatedAt`.
- An organiser never has more than 3 entries in `EventQuota.slots` within any 24 hours.
- `slug` is set once at creation and never rewritten.
- Public reads (`getAllEvents`, `getEventBySlug`, `getSimilarEventsBySlug`, `GET /api/events`, `GET /api/events/[slug]`) always apply the visibility filter `{ $or: [{ ownerBanned: { $ne: true } }, { ownerBanExpires: { $lte: now } }] }`. `$ne: true` keeps old documents with no field visible. The bookings page and CSV skip it.
- `ownerBanned` and `ownerBanExpires` on events mirror the owner's `banned` and `banExpires`, set by one `updateMany` inside the ban and unban server actions. If that update fails, the action reports an error, and `npm run reconcile:bans` (which reapplies every user's ban state to their events, and is safe to run any time) repairs it.
- Audit log entries are only inserted, never updated or deleted by the app.
- No email address goes to PostHog.

**Security model**:
- **Roles**: `user` (organiser), `admin`, `superadmin`, defined with Better Auth `createAccessControl`. Admin plugin permissions: `superadmin` gets `user: ["list", "set-role", "ban"]` and `session: ["list", "revoke"]`. `admin` gets `user: ["list", "ban"]`. `user` gets none. No role gets `create`, `delete`, `set-password`, `update`, or `impersonate`.
- **HTTP lockout hook** (`hooks.before`): any `ctx.path` starting with `/admin/` that arrives with `ctx.request` (a real HTTP call) gets `403`. That's all the hook does. It never reads the body.
- **Policy** (`lib/auth/policy.ts`, used only by the server actions and event routes): `isSuperAdmin`, `isAdmin` (stored role `admin` and an effective ban that is not active, or super admin), `canBan(caller, target)`, `canSetRole(caller, target, role)`, and `canManageEvent(caller, event)`. Every privileged server action rechecks the caller from the session, because a server action is a public endpoint.
- **Account takeover before sign up**: in `databaseHooks.account.create.after`, when a `github` or `google` account is linked to a user whose `emailVerified` was false, delete that user's `credential` account, revoke all their sessions, and then mark the email verified. Account linking trusts only `github` and `google`, and only when the provider reports the email verified.
- **Event ownership**: create needs a verified session. Edit needs a verified owner or the super admin. Delete needs the owner (verified or not) or the super admin. Admins cannot edit or delete other people's events.
- **Request forgery**: Better Auth checks the origin on `/api/auth/*`. Next checks server actions itself. The event route handlers (POST, PATCH, DELETE) check `Origin` against `BETTER_AUTH_URL`.
- **Redirects**: `callbackURL` is followed only when it is a relative path starting with exactly one `/`.
- **Booking PII**: attendee emails are visible only to the event owner, admins, and the super admin, and only through the bookings page and CSV. That is personal data under GDPR. The privacy policy should say organisers see attendee emails (Follow-up).
- **Auth hardening**: passwords hashed by Better Auth (scrypt). HttpOnly, Secure, SameSite=Lax session cookies. Better Auth's origin check (CSRF protection) with `trustedOrigins` set to `BETTER_AUTH_URL`. Rate limits use database storage, so they hold across serverless instances, with the client IP read from `x-forwarded-for` (`advanced.ipAddress.ipAddressHeaders`). The session cookie cache is off. Verification and reset emails are handed to `after()` (so the response doesn't wait for them, which keeps response time from revealing whether an email exists, and the platform keeps the work alive after responding).
- **Guards**: `proxy.ts` (Next 16's middleware) does only a cheap cookie presence redirect for `/dashboard/*`, `/events/create`, and `/admin/*`. The real checks run in every page, route handler, and server action through `requireSession()`, `requireVerified()`, `requireRole()`, and `requireEventOwnerOrSuperadmin()` in `lib/auth/guards.ts`.

**Configuration required**:
- `BETTER_AUTH_SECRET`: 32+ random bytes for signing cookies and tokens.
- `BETTER_AUTH_URL`: the app's public origin (e.g. `http://localhost:3000`), used for callbacks, trusted origins, and links in emails.
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`: a GitHub OAuth app. The callback is `${BETTER_AUTH_URL}/api/auth/callback/github`. Prerequisite: create the app.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: a Google Cloud OAuth client. The callback is `${BETTER_AUTH_URL}/api/auth/callback/google`. Prerequisite: create the client and consent screen.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` (`true` for port 465): the SMTP server Nodemailer sends through. Prerequisite: an SMTP account.
- `EMAIL_FROM`: the sender, e.g. `DevEvent <no-reply@yourdomain>`.
- `SUPER_ADMIN_EMAIL`: the single super admin's email.
- New packages: `better-auth`, `nodemailer`, `@types/nodemailer` (dev), and `mongodb` as an explicit dependency (it already comes in through mongoose).
- Add all of the above to `.env.example` and the README.

**Critical test scenarios**:
- Happy path: sign up with email, verify, create an event, see it on the home page and in `/dashboard`, edit its venue, and an attendee who booked gets one update email. Verifies **AC-1**, **AC-8**, **AC-10**, **AC-12**.
- Happy path: the super admin promotes an organiser, who gets the email and can open `/admin/users` but not `/admin/admins`. Verifies **AC-15**, **AC-16**, **AC-23**.
- Failure case: an unverified user POSTs an event, gets `403 EMAIL_NOT_VERIFIED`, and no Cloudinary upload happens. Fire 5 parallel POSTs from a fresh organiser: exactly 3 succeed, 2 get `429 EVENT_QUOTA` with `nextSlotAt`, and only 3 uploads happen. Verifies **AC-4**, **AC-9**.
- Failure case: SMTP is unreachable during an event delete. The delete still completes, the bookings are gone, and the error is logged. Verifies **AC-13**, **AC-25**.
- Failure case: ban with an expiry set by changing `banExpires` in the DB to 1 minute ahead (the UI minimum is 1 hour). Events are hidden, then visible again after expiry and cache refresh, the users list shows "Active", and the user can sign in again. Verifies **AC-17**, **AC-18**, **AC-19**.
- Security: sign up with email and password as `victim@x` (unverified, attacker's password), then sign in with GitHub as `victim@x`. Afterwards the attacker's password no longer signs in and the attacker's session is gone. Repeat with `SUPER_ADMIN_EMAIL`. Verifies **AC-3**, **AC-15**.
- Security: POST `/api/events` with a body field `organiserId=<other user>` and the event is still owned by the caller. POST with `Origin: https://evil.example` gets `403`. `/sign-in?callbackURL=//evil.example` lands on `/dashboard`. Verifies **AC-8**, **AC-23**.
- Auth/permission: as the super admin (and as an admin), curl `POST /api/auth/admin/set-role`, `/admin/ban-user`, and `/admin/impersonate-user`, and all get `403`. Through the UI, an admin can't ban another admin. Verifies **AC-21**, **AC-18**.
- Auth/permission: a second organiser PATCHes or DELETEs someone else's event and gets `403`, and opening that event's bookings page also gets `403`. Signed out `POST /api/events` gets `401`. Verifies **AC-8**, **AC-11**, **AC-14**.
- Auth/permission: change `SUPER_ADMIN_EMAIL` to another verified user, who signs in and becomes super admin while the old one is now `user`. Verifies **AC-15**.
- Regression: anonymous home, details, similar events, and booking all still work, and an event with no `ownerBanned` field stays visible. Verifies **AC-24**.

## Build plan

No build approach is recorded for this project, so this assumes end to end slices (Tracer Bullet, meaning one thin working path through every layer first, then widening). Each slice ships something usable and leaves the public site working.

**Slice 1: one organiser, signed in, owns a new event (closes issue #4)**
1. Add packages and env vars, and update `.env.example` and the README. Create `lib/mongo-client.ts`, a cached `MongoClient` with a small pool (`maxPoolSize: 5`) following the `mongodb-connection` skill, separate from the mongoose connection. Satisfies **AC-1**.
2. Create `lib/auth.ts`: `betterAuth` with `mongodbAdapter`, `emailAndPassword` (`enabled`, `requireEmailVerification: false`, `autoSignIn: true`, `minPasswordLength: 8`, `maxPasswordLength: 128`), `emailVerification` (`sendOnSignUp: true`, `autoSignInAfterVerification: true`, callback `/dashboard`), GitHub and Google (refuse when the provider email is unverified), session (`expiresIn` 7 days, `updateAge` 1 day, `cookieCache` off), account linking trusting `github` and `google`, database backed rate limits with the AC-7 rules and `ipAddressHeaders: ["x-forwarded-for"]`, `trustedOrigins: [BETTER_AUTH_URL]`, the name length check (1 to 100), and the `nextCookies()` plugin. Add `lib/auth-client.ts` (`createAuthClient`, typed so `useSession()` returns `role`) and `app/api/auth/[...all]/route.ts` (`toNextJsHandler`). Add the test that pins the user id type. Satisfies **AC-1**, **AC-2**, **AC-6**, **AC-7**.
3. Add the account takeover guard in `databaseHooks.account.create.after` (AC-3 and the Security model). Satisfies **AC-3**.
4. Create `lib/email/` (a Nodemailer pooled transport, a `sendEmail()` that never throws and logs the template name and recipient count on failure, and the templates from the Email templates table). Wire `sendVerificationEmail` and `sendResetPassword` (1 hour expiry, `revokeSessionsOnPasswordReset: true`, no email for accounts without a password) through `after()`. Satisfies **AC-1**, **AC-5**, **AC-25**.
5. Build `/sign-in` (including `?error=banned`), `/sign-up`, `/forgot-password`, `/reset-password`, and `/verify-email` pages, plus a client `UserMenu` in the navbar using `authClient.useSession()` (so the root layout stays static). Add a `safeCallback()` helper for `callbackURL`. Satisfies **AC-1**, **AC-2**, **AC-5**, **AC-22**, **AC-23**.
6. Add `lib/auth/guards.ts` and `proxy.ts`. Guard `/events/create` (render the session part inside `<Suspense>`, as cache components need), show the unverified notice and resend button, and pass `defaultOrganizer` to `CreateEventForm`. Satisfies **AC-4**, **AC-8**, **AC-23**.
7. Event model: add `organiserId`, `imagePublicId`, `ownerBanned`, `ownerBanExpires`, and the two indexes, and generate the slug only when the document is new. Add the `EventQuota` model. Create a `lib/events/input.ts` whitelist parser shared by POST and PATCH. `POST /api/events`: check the origin, session, and verification first (before reading the body), reserve a quota slot atomically, then run the current validate → upload → save flow with `organiserId` and `imagePublicId`. Release the slot (and destroy the upload) on any failure. Satisfies **AC-8**, **AC-9**, **AC-11**.
8. Write `scripts/backfill-event-owner.ts` (`npm run backfill:owners`): find the user by `SUPER_ADMIN_EMAIL`, stop with the AC-24 message if there is none, and set `organiserId` on events that lack it, leaving `organizer` alone. It's safe to run twice. Satisfies **AC-24**.

**Slice 2: the organiser dashboard**
9. `/dashboard` (own events by `createdAt` desc, 20 per page with page clamping, booking counts by aggregate, empty state, unverified notice). Satisfies **AC-4**, **AC-10**.
10. `PATCH /api/events/[slug]` + the edit page (reusing `CreateEventForm` in edit mode with initial values and an optional image). Origin check, whitelist, verified owner or super admin. Diff the five notice fields after normalising, and for events today or later send one update email per attendee in `after()` (from `next/server`, so they run after the response). Replace the image and destroy the old one by `imagePublicId`, then revalidate `events` and `event:<slug>`. Satisfies **AC-11**, **AC-12**, **AC-25**.
11. `DELETE /api/events/[slug]` + the confirm dialog: read attendee emails, delete the event, then its bookings, revalidate, redirect to `/dashboard`, and in `after()` send cancel emails and destroy the image when `imagePublicId` is set. Satisfies **AC-13**, **AC-25**.
12. The bookings page + `bookings.csv` route (owner, admin, superadmin; no visibility filter; the CSV format from AC-14). Satisfies **AC-14**.

**Slice 3: roles, moderation, audit**
13. Access control roles + the admin plugin config + the HTTP lockout hook + `lib/auth/policy.ts` (`isSuperAdmin` from env, effective ban status). Sync the stored `superadmin` role in `databaseHooks.session.create.before` (demote the others with one `updateMany`, then promote with one `updateOne`), and add the partial unique index. Satisfies **AC-15**, **AC-21**.
14. Create the `AuditLog` model. Add the `banUser`, `unbanUser`, and `setAdminRole` server actions (policy check, then `auth.api.*` on the server, then event visibility `updateMany`, the audit entry with the AC-20 failure rules, `updateTag(EVENTS_TAG)` so the next request reads fresh data and a banned user's events disappear at once (a `revalidateTag(tag, 'max')` stale while revalidate would serve them to one more visitor, against AC-18), and the email). `updateTag` only works inside a server action, so these flows run only from `lib/actions/admin.actions.ts`; route handlers keep `revalidateTag(tag, { expire: 0 })`. The reconcile script runs outside Next and can't invalidate tags, so its fixes show once the cached reads expire (at most 1 hour, step 15), plus `scripts/reconcile-bans.ts` (`npm run reconcile:bans`). Satisfies **AC-16**, **AC-18**, **AC-20**.
15. Public read visibility filter in all five read paths, with `now` computed inside each cached function and `cacheLife` at most 1 hour on both the list and the `event:<slug>` reads. Satisfies **AC-18**, **AC-19**, **AC-24**.
16. The `/admin` layout (guard returns 404) + `/admin/users` (escaped search, effective ban status, ban dialog with reason and bounded expiry, unban) + `/admin/admins` (promote verified and unbanned users only, demote) + `/admin/audit`. Super admin edit and delete of any event reuses steps 10 and 11, with an audit entry when the actor isn't the owner. Satisfies **AC-16**, **AC-17**, **AC-18**, **AC-20**, **AC-23**.
17. Role and ban email templates (granted, removed, banned, unbanned). Satisfies **AC-16**, **AC-18**.
18. Run the regression pass on the anonymous flows and the security and curl checks from Critical test scenarios. Satisfies **AC-3**, **AC-21**, **AC-24**.

## Consequences

**Positive**:
- Closes the open upload hole (issue #4). Only verified, rate limited organisers can make Cloudinary uploads.
- All identity data stays in the one MongoDB database, with no per user vendor bill.
- One enforcement point for privileged rules, so a new UI or a direct API call can't skip them.
- A ban is instant, reversible spam removal. Nothing is deleted.

**Negative / tradeoffs**:
- You now operate auth yourself: secret rotation, SMTP deliverability, and OAuth app upkeep are your job.
- Two connection pools to the same cluster (mongoose and the native `MongoClient` for Better Auth). Small, but it counts against Atlas connection limits on serverless.
- Email and password means you own the reset and verification flow and its abuse (rate limits help, and the lack of a CAPTCHA is accepted for now).
- Copying ban state onto events (`ownerBanned`) is a stored derived value. It's kept in sync by the ban and unban actions, and a failed sync is reported and repaired with `reconcile:bans`, but until then the wrong events can show.
- The stored `superadmin` role can lag the env var until the new person signs in. Power never lags, because `policy.isSuperAdmin` reads the env var, but the plugin's own permission check uses the stored role, so the new super admin's moderation actions work only after their first sign in.
- Images on events created before this spec have no `imagePublicId`, so deleting those events leaves their images in Cloudinary (logged).
- Two new small collections (`EventQuota`, `AuditLog`) and two maintenance scripts (`backfill:owners`, `reconcile:bans`).
- Attendee emails are sent inline in `after()` with no queue or retry. A failed send is logged and not retried.
- Public pages can lag up to the cache window (1 hour) after a ban expires on its own.

**Neutral**:
- The `rateLimit`, `user`, `session`, `account`, and `verification` collections appear in the database.
- Next 16 uses `proxy.ts` (not `middleware.ts`) for the optimistic redirect.
- `/events/create` becomes partly dynamic (the session part streams inside Suspense).

## Follow-up

- [ ] Install the Better Auth skills you chose (the install failed because github.com could not be resolved): `npx skills add better-auth/skills -s better-auth-best-practices create-auth better-auth-security-best-practices email-and-password-best-practices -a claude-code -y`
- [ ] Install the Nodemailer community skill you chose: `npx skills add aidotnet/moyucode -s nodemailer -a claude-code -y` (it's unverified, so review it before use).
- [ ] Connect the MCP servers you chose (in your own MCP settings): the Better Auth docs MCP (`npx auth@latest mcp`), and the MongoDB official MCP (`mongodb-mcp-server` in read only mode with your connection string).
- [ ] No `AGENTS.md` exists yet. Running `/audit` would create it. `mongodb-connection` conventions belong in root `AGENTS.md` (every DB file), and Better Auth and email conventions belong in a nested auth area file (for example `lib/auth/AGENTS.md`).
- [ ] Check these against the installed Better Auth version before Slice 1, because they have been renamed or changed between releases: the rate limit rule keys (password reset request, send verification), `ctx.path` and `ctx.request` in hooks (prove with a test that a server side `auth.api.banUser` passes the lockout hook and an HTTP call does not), the mongo adapter's id type, how social providers report a verified email, and whether `trustedProviders` linking skips the provider's verified check.
- [ ] Create the GitHub OAuth app, the Google OAuth client, and the SMTP account before Slice 1.
- [ ] Update the privacy policy: organisers and admins can see attendee emails, and attendees get update and cancel emails.
- [ ] Later: account self deletion (you deferred it), a CAPTCHA on sign up if spam shows up, and a mail queue with retries if attendee lists grow large.
- [x] Enrolled on the scope as "Organiser auth" in [docs/scope/scope.md](../../scope/scope.md). Running `/scope` would fill in the rest of the product.
