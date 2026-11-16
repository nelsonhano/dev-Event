# 0001. Organiser accounts, roles, and moderation: rationale

Decision record for [index.md](index.md). `/develop` builds from `index.md`. This file keeps the why.

## Context

> ⚠️ Premise note: the topic started as "organiser auth" (closing issue #4, the open `POST /api/events`), but the design conversation grew it into three connected decisions: identity and sessions, event ownership with an organiser dashboard, and a role and moderation system with a super admin. They share one data model and one policy layer, so they stay in one spec, built as three slices. If any slice grows (for example a richer admin console), split it into its own spec instead of growing this one.

DevEvent is a Next.js 16 app (App Router, cache components on) backed by MongoDB Atlas through mongoose, with Cloudinary for event images and PostHog for analytics. It has no user accounts. The audit (`ISSUES_TO_FIX.md`, item 4) found that anyone can create events and upload files to the Cloudinary account, with no identity, no rate limit, and no way to remove abuse. The create page and its API now exist and work, which makes the hole easier to reach.

The forces: the audience is developers (so GitHub sign in fits naturally), sign up is self serve (so abuse control has to be built in, not bolted on), and the team is small and already runs MongoDB. Attendee booking is deliberately anonymous and must keep working unchanged. Booking emails are personal data, so who can see them is an access control decision, not a UI detail. Moderation needs a clear owner: one super admin who appoints admins.

Not deciding leaves a public write endpoint into a paid media account, and no way to tell who posted what. Retrofitting ownership later means backfilling every event anyway.

## Options considered

### Option 1: Better Auth, self hosted, with the admin plugin

An open source TypeScript auth library. It stores users, sessions, and accounts in MongoDB through its adapter, ships email and password (hashing, verification, reset), GitHub and Google, account linking, database backed rate limits, and an admin plugin with roles, bans, and ban expiry.

**Pros**:
- Reuses the existing database. No user data leaves your infrastructure and there's no per user cost.
- Covers every method and admin feature you asked for out of the box (roles, ban with reason and expiry, session revoke).
- Hooks let one policy layer govern both the UI and direct API calls.

**Cons**:
- You operate it: secrets, SMTP, and OAuth apps.
- Endpoint names have changed between versions, so the policy hook must be checked against the installed version.
- Needs a native `MongoClient` next to mongoose.

### Option 2: Clerk, hosted

A hosted auth service with ready made sign in UI, user management, and organisations.

**Pros**:
- The fastest to ship sign in, and it comes with polished UI and bot protection.
- No auth code or SMTP to run for auth emails.

**Cons**:
- User data lives outside MongoDB, so organiser ids must be synced into events, and lookups for the users list cross two systems.
- Per user pricing as you grow, plus vendor lock in on the most load bearing part of the app.
- Your own super admin and ban rules still have to be built in app code, so the core work doesn't go away.

### Option 3: Auth.js (NextAuth v5)

The long standing Next.js auth library, now in maintenance mode, with new projects pointed to Better Auth.

**Pros**:
- Well known, with many examples and a MongoDB adapter.

**Cons**:
- Its credentials (password) provider is discouraged: no built in hashing, verification, or reset, and it doesn't work with database sessions.
- No roles, bans, or rate limits. All of it would be custom.
- Maintenance mode means slower fixes.

### Option 4: Roll your own

Custom password hashing, sessions, OAuth flows, and CSRF.

**Pros**:
- Full control and no dependency.

**Cons**:
- Every piece (OAuth state, session fixation, timing safe comparisons, reset token handling) is a breach waiting to happen, on a public self serve app.
- By far the most build time for the least value.

## Rationale

Better Auth wins because it matches the two strongest forces: the app already runs MongoDB, and the role and ban model you described maps almost one to one onto its admin plugin (roles, ban reason, ban expiry, session revoke on ban). Clerk would ship sign in faster, but the hard part of this feature is not the sign in screen. It's the super admin, admin, and organiser rules, the ownership checks, and the ban visibility, and those stay custom with Clerk too, now split across two systems. Auth.js would leave the password flow (one of your three methods) to hand rolled code, which is exactly the risk a library should remove.

The main design call inside Better Auth is where the rules live. The admin plugin's endpoints are reachable over HTTP, and its permission model can't express "admins may ban organisers but not other admins". The first draft enforced the rules in a `before` hook, but the cross check pointed out that this hook runs before the plugin validates the session and body, and that the `after` hook also fires on failed calls. So the final design turns the plugin's HTTP endpoints off with one blanket hook and puts every rule, audit entry, and email inside the server actions, which call `auth.api.*` on the server. That leaves one place for the rules and one simple, testable fact for AC-21 (every HTTP admin call is a `403`). Its runner up was skipping the plugin entirely and writing the users collection directly. That's simpler, but it gives up the plugin's built in sign in blocking and session revoke on ban.

The cross check also found an account takeover path that the first draft missed. Someone could sign up with another person's email and set a password before the real owner ever arrived; when the real owner later signed in with GitHub, the accounts would link, and the attacker's password would still work. Pointed at `SUPER_ADMIN_EMAIL`, that would have handed over super admin. The fix (delete a password login created before verification when a trusted provider links) is in AC-3 and the Security model.

Recommendations made during writing (not asked during design):
- **Native `MongoClient` for Better Auth** rather than reusing mongoose's connection. Better Auth needs a `Db` handle when its config loads, and mongoose connects lazily. Runner up: wait on `connectDB()` and pass `mongoose.connection.db`, which risks a race condition at startup.
- **Super admin computed from the env var on every check**, with the stored role only synced at sign in (demote first, then promote, with a unique index). That removes the race between two sign ins at once, and the lag after the env var changes. Runner up: the stored role as the only truth, synced at sign in, which the cross check showed can race.
- **Ban state copied onto events** so public reads stay one indexed filter inside cached functions. Runner up: a `$lookup` on `user` in every public query, which is correct without any sync but slower and messier inside `'use cache'`.
- **Quota as an atomic reservation in `EventQuota`** (approved after the cross check). Counting events first and then creating was not atomic, so parallel POSTs could each upload to Cloudinary. One conditional `findOneAndUpdate` reserves a slot, and the slot is released if the create fails. It also closes the delete and recreate loophole. Runner up: count `event.create` audit entries, which has the same race.
- **`imagePublicId` stored at upload** (approved after the cross check) rather than pulled out of the URL, which breaks on transformations and folders. Older events have no id, so their images stay in Cloudinary when they're deleted.
- **User references stored as strings** matching `session.user.id`, so ownership checks and `$group` never compare an ObjectId with a string by mistake.
- **`/admin/*` returns 404 to non admins** rather than 403, so the console's existence isn't advertised.
- **Attendee emails sent in `after()`** with no queue, sized to the current traffic. Runner up: Vercel Queues or a job runner once lists grow.
