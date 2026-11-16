# Scope: DevEvent

DevEvent is a hub for developer events (hackathons, meetups, conferences). Visitors browse events and book a spot with just an email. Signed in organisers publish and manage their own events, and admins keep the public pages free of spam.

**Build approach:** Tracer Bullet (one thin working path through every layer first, then widen). Nothing recorded this before, so this is the recommended default.
**Workflow:** Beta (after `/develop`, run `/check verify`, then `/test`). The project default level of rigor. Any feature can carry its own tag (for example `· Alpha`) to do more or less.

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit: if you already know how to build a feature, use `/develop` and skip `/architect`. You decide when a feature is `done`._

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| A | Event browsing | Already built | existing |
| B | Attendee booking | Already built | existing |
| C | Product analytics | Already built | existing |
| 1 | Coding standards & project context | Foundation | planned |
| 2 | Create event page | Slice 1 | in-progress |
| 3 | Organiser auth | Slice 1 | in-progress |
| 4 | Real 404 for missing events | Slice 2 | planned |
| 5 | Privacy policy page | Slice 2 | planned |
| 6 | Production deploy | Slice 3 | planned |

## Already built

These predate the workflow. They are here for context, so `/develop` and `/sync` leave them alone.

### A. Event browsing · existing
Home page with featured events, event details page (overview, agenda, organiser, tags, live booking count), and up to three similar events by shared tag. Reads go straight to MongoDB through cached server functions, tagged so new events show up right away.
code in `app/page.tsx`, `app/events/[slug]/`, `components/EventDetails.tsx`, `lib/actions/event.actions.ts`

### B. Attendee booking · existing
Book a spot with just an email, one booking per email per event, with clear error messages and a pending state.
code in `components/BookEvent.tsx`, `lib/actions/booking.actions.ts`, `database/booking.model.ts`

### C. Product analytics · existing
PostHog tracks bookings and event creation, starts only when a key is set, and keeps emails out of analytics.
code in `instrumentation-client.ts`

## Foundations

### 1. Coding standards & project context
Capture the real conventions (Next 16 cache components, mongoose plus the Better Auth `MongoClient`, the `mongodb-connection` rules, auth and email conventions) so every later skill reads one source of truth. Lint, types, and Vitest already run.
**Done when:** root `AGENTS.md` describes the real stack and conventions, a nested `lib/auth/AGENTS.md` covers auth and email, and `npm run lint` and `npm test` run clean.
- [ ] Capture conventions and project context: `/audit`

## Slice 1: Organisers own their events

### 2. Create event page · in-progress
A form at `/events/create` that posts an event with its banner image, shows the server's errors beside each field, and lands on the new event's page. Built by `/develop` on 2026-11-11; Organiser auth then put it behind sign in and email verification.
**Done when:** a verified organiser can publish an event from the form, bad input shows a clear message on the right field, and the new event appears on the home page.
- [x] Build it: `/develop create-event`
- [ ] Verify it: `/check verify create event page`
- [ ] Test it: `/test create event page`
code in `app/events/create/`, `components/CreateEventForm.tsx`

### 3. Organiser auth · in-progress
Organisers sign in (GitHub, Google, or email and password), own and manage their events, and see their bookings. One super admin manages admins, who moderate by banning. Closes issue #4 in `ISSUES_TO_FIX.md`.
**Done when:** only verified, rate limited organisers can create events, owners manage their own events and bookings, and the super admin and admin moderation flows work as AC-1 to AC-25 in the spec describe.
- [x] Design it (spec): `/architect organiser auth`
- [x] Build it: `/develop organiser-auth`
   - [x] Sign in and event ownership (Slice 1, closes issue #4), covers AC-1 to AC-9, AC-22 to AC-25
   - [x] Organiser dashboard: edit, delete, bookings, attendee emails (Slice 2), covers AC-10 to AC-14
   - [x] Roles, bans, admin console, audit log (Slice 3), covers AC-15 to AC-21
- [ ] Verify it: `/check verify organiser-auth`
- [ ] Test it: `/test organiser-auth`
Spec [0001](../specs/0001-organiser-auth/index.md) · code in `lib/auth/`, `lib/auth.ts`, `lib/admin/`, `lib/events/`, `app/api/auth/`, `app/api/events/`, `app/sign-in/`, `app/dashboard/`, `app/admin/`, `proxy.ts`

## Slice 2: Polish before launch

### 4. Real 404 for missing events · Alpha
A missing event still answers with HTTP 200, because `notFound()` runs inside `<Suspense>` after streaming starts (issue #12 in `ISSUES_TO_FIX.md`). Search engines and link checkers treat those as real pages.
**Done when:** `/events/<unknown-slug>` returns HTTP 404 with the not found page, and a database outage still reaches `error.tsx` instead of looking like a missing page.
- [ ] Build it: `/develop real 404 for missing events`

### 5. Privacy policy page
Organisers and admins can now see attendee emails, and attendees get update and cancel emails (spec 0001 follow up). A public page should say so before launch. You write the wording; the build only adds the page and links it.
**Done when:** `/privacy` explains what is collected (attendee emails, organiser accounts, analytics), who can see it, and which emails are sent, and it is linked from the booking form and the sign up page.
- [ ] Build it: `/develop privacy policy page`

## Slice 3: Go live

### 6. Production deploy · needs a decision
Nothing records where the app runs, how env vars and the two MongoDB pools fit a serverless host, or how the maintenance scripts (`backfill:owners`, `reconcile:bans`) get run against production.
**Done when:** a production URL serves the app from a clean build, secrets live in the host's env settings, OAuth callbacks and SMTP point at the real domain, and running the backfill script against production is written down.
- [ ] Design it (spec): `/architect production deploy`

## Deferred
Out of scope for the current build pass, kept so the plan stays honest.
- **Account self deletion**: organisers delete their own account (from spec 0001) · needs a decision
- **CAPTCHA on sign up**: only if spam shows up (from spec 0001)
- **Mail queue with retries**: only if attendee lists grow large (from spec 0001) · needs a decision
- **Event search, filters, and paging**: the home page lists every event, which stops scaling as events grow · needs a decision

## Legend

**The decision box.** A feature's sub task ending in `(spec)` is its decision box. Every other box is an execution box.

- **Next step** = the first unticked box (always a command or a tracked milestone).
- **needs a decision** = run `/architect` first; otherwise go straight to `/develop` (or `/audit` for standards). The tag drops once the spec is captured.
- **Atomic build tasks live in the spec's `## Build plan`, not here.** The scope carries only the milestone rollup.
- **Status** `planned` → `in-progress` → `done`, plus `existing` (built before this workflow) and `dropped` (taken out of scope, kept for history).
- **Workflow tier tag** beside a heading (for example `· Alpha`) sets that one feature's rigor; no tag inherits the project default. **Prototype** = nothing after `/develop`; **Alpha** = `/check verify`; **Beta** = `/check verify` then `/test`; **GA** = adds a fresh model `/check review` then `/document`.
- **Pointer line** (`spec <n> · code in <path>`): the spec link added by `/architect`, the code path by `/develop`.
