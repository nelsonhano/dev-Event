# DevEvent

A hub for developer events. Visitors browse events and book with just an email; signed in organisers publish their own events. Product scope lives in [docs/scope/scope.md](docs/scope/scope.md); known bugs in [ISSUES_TO_FIX.md](ISSUES_TO_FIX.md).

## Stack

- **Language / Runtime**: TypeScript (strict), Node, React 19.2
- **Framework**: Next.js 16.0 App Router with `cacheComponents: true`, Turbopack
- **Key dependencies**: mongoose 8 (app data) plus the native `mongodb` driver (Better Auth only), Better Auth 1.7, Cloudinary (event images), Nodemailer (SMTP), PostHog, Tailwind CSS v4 with shadcn config
- **Package manager**: npm
- **Tests**: Vitest 5, Testing Library, `mongodb-memory-server`

## Build approach

**Tracer Bullet**: one thin working path through every layer first, then widen.

## Commands

```bash
npm install               # then copy .env.example to .env.local (it documents every variable)
npm run dev               # next dev --turbopack
npm run build             # next build --turbopack
npm run lint              # eslint (next core web vitals + typescript)
npm test                  # vitest run (first run downloads a MongoDB binary)
npm run backfill:owners   # gives ownerless events to SUPER_ADMIN_EMAIL; safe to repeat
```

## Specs

One folder per spec: `docs/specs/NNNN-title/index.md` plus `rationale.md`. Code comments cite them as `(spec 0001, AC-n)`; keep that habit.

## Rules

- Server components read data through the `'use cache'` functions in `lib/actions/event.actions.ts` (with `cacheLife` and `cacheTag`), never by fetching the app's own `/api` routes (they don't exist at build time).
- After a write, invalidate by tag: `updateTag` in server actions, `revalidateTag(tag, { expire: 0 })` in route handlers. Tag names come from `EVENTS_TAG`, `eventTag()`, `bookingsTag()`.
- Anything that reads the session or request goes inside `<Suspense>` (cacheComponents streams it). Read functions return plain DTOs (`.lean()` plus string ids), never mongoose documents.
- Every DB entry point calls `connectDB()` from `lib/mongodb.ts` first. Connections, transports, and clients are cached on `globalThis` so hot reloads and warm serverless instances reuse them.
- Validation lives in the mongoose schema; handlers map `ValidationError` to 400 with per field `errors`, duplicate key `11000` to 409, and never leak internal messages in production.
- Request bodies are whitelisted (`lib/events/input.ts`). Owner, slug, ban flags, and timestamps are always set by the server, never read from the body.
- Imports use the `@/` alias (project root). Server actions start with `'use server'`; client components with `'use client'`.
- Tests sit beside the source as `*.test.ts(x)`. Server code runs in the node environment; component tests add `// @vitest-environment jsdom`. Each test file gets its own in memory database; use `test/db.ts` helpers (`connectTestDB`, `clearDatabase`, `seedEvent`).

## Gotchas

- The git repository root is the home folder (`C:/Users/Dell`), not this project. Check `git status` paths before committing. `next.config.ts` pins `turbopack.root` for the same reason (a parent `package-lock.json`).
- On Windows, run `npm test` and `npm run dev` from an uppercase `C:\` path. From a lowercase `c:` cwd, vitest fails every file with "failed to find the current suite" and the dev file watcher misses edits.
- `proxy.ts` is Next 16's middleware. It only checks that a session cookie exists; it is not a security check.
- `notFound()` inside `<Suspense>` still answers HTTP 200 (scope feature 4).

## Agent skills

- [mongodb-connection](.claude/skills/mongodb-connection/): `mongodb/agent-skills`, MongoDB client and pool configuration (both the mongoose and the native client)
- [vitest](.claude/skills/vitest/): `antfu/skills`, Vitest usage and test patterns
- [cloudinary-next](.claude/skills/cloudinary-next/): `cloudinary-devs/skills`, Cloudinary uploads and delivery in Next.js
- [posthog-instrumentation](.claude/skills/posthog-instrumentation/): `posthog/posthog-for-claude`, PostHog event capture in code
- [shadcn](.claude/skills/shadcn/): `shadcn-ui/ui`, shadcn components (config exists, no `components/ui` yet)

MCP servers: mongodb-mcp-server (recommended, use read only mode)

## Context files

- [lib/auth/AGENTS.md](lib/auth/AGENTS.md): organiser auth (Better Auth), guards, email sending, and their security rules

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
