# Organiser auth and email

## Overview

Organiser identity, sessions, and access checks, built on Better Auth with GitHub, Google, and email plus password sign in. It also owns outgoing email (verification, password reset, and later attendee emails). Designed in [spec 0001](../../docs/specs/0001-organiser-auth/index.md); Slice 1 is built, the dashboard (Slice 2) and roles, bans, and admin console (Slice 3) are not yet.

## Key files

| File | Owns |
|---|---|
| `lib/auth.ts` | The Better Auth server config: providers, account linking, DB hooks, sessions, rate limits |
| `lib/auth-client.ts` | Browser client (`useSession`, `signIn`, `signUp`, `signOut`) |
| `lib/auth/guards.ts` | The real access checks: `requireSession`, `requireApiSession`, `requireVerified`, `checkOrigin` |
| `lib/auth/safe-callback.ts` | Open redirect safe `callbackURL` handling |
| `lib/auth/messages.ts` | User facing auth error and retry messages |
| `lib/mongo-client.ts` | Native `MongoClient` for the Better Auth adapter, separate from mongoose |
| `lib/email/index.ts`, `lib/email/templates.ts` | `sendEmail()` over pooled Nodemailer, and the templates |
| `lib/background.ts` | `runAfter()`, wraps Next `after()` for work after the response |
| `app/api/auth/[...all]/route.ts` | Better Auth handler; adds a standard `Retry-After` on 429 |
| `proxy.ts` | Cookie presence redirect for `/dashboard`, `/events/create`, `/admin` |
| `components/auth/`, `app/sign-in`, `app/sign-up`, `app/verify-email`, `app/forgot-password`, `app/reset-password` | Auth UI |

## Conventions

- Every protected page, route handler, and server action calls a guard from `lib/auth/guards.ts`. Pages use `requireSession(returnTo)`; route handlers use `requireApiSession(req)`, then `checkOrigin(req)` on writes, then `requireVerified(session)` where publishing is involved. Guards read only headers, so nothing is parsed or uploaded before they pass.
- Unverified organisers can sign in; publishing is what is gated (`EMAIL_NOT_VERIFIED`, 403).
- Every `callbackURL` goes through `safeCallback()` before a redirect.
- Emails are sent with `runAfter(() => sendEmail(...))`, never awaited in the request. `sendEmail` never throws, sends one message per recipient, and logs only the template name and recipient count, never addresses.
- Templates escape every value with `escapeHtml` and ship both `html` and `text`.
- User ids are stored on app documents as the string form of `session.user.id` (`organiserId`, `userId`).
- New social providers go in `SOCIAL_PROVIDERS`; `configuredProviders()` hides buttons whose env vars are missing.

## Gotchas

- Two MongoDB pools exist: mongoose (`lib/mongodb.ts`) for app data, and the native client here for auth. Both read `MONGODB_URI` and the same database.
- Set `MONGODB_TRANSACTIONS=false` only for a standalone mongod without a replica set (tests); Atlas needs it on.
- `session.cookieCache` is off on purpose, so role and ban changes apply on the next request. Don't turn it on.
- The account create `after` hook deletes the password and every session when GitHub or Google links to an unverified email account (account takeover guard). OAuth identities without a provider verified email are refused in `validateUserInfo`.
- Password reset emails are skipped for accounts with no `credential` provider, so a reset can't add a password to an OAuth only account.
- Rate limits are on in every environment and stored in the database; sign in and sign up allow 5 per minute.
- `lib/auth.ts` must import safely without env vars (`next build`); the native client falls back to a placeholder URI and fails on first query.

## Agent skills

- [better-auth-best-practices](../../.claude/skills/better-auth-best-practices/): `better-auth/skills`, server and client config, adapters, sessions, plugins
- [better-auth-security-best-practices](../../.claude/skills/better-auth-security-best-practices/): `better-auth/skills`, rate limits, secrets, CSRF, trusted origins, cookies
- [email-and-password-best-practices](../../.claude/skills/email-and-password-best-practices/): `better-auth/skills`, sign up, verification, and reset flows

MCP servers: Better Auth docs at `https://mcp.better-auth.com/mcp` (recommended, add with `npx auth@latest mcp`)

## Related specs

- [0001 Organiser auth](../../docs/specs/0001-organiser-auth/index.md) (rationale in `rationale.md`)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
