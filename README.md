# DevEvent

A hub for developer events. Visitors browse events and book a spot with just an email; signed-in organisers publish and manage their own events, and admins moderate organisers.

## Tech stack

- **Next.js 16** (App Router, Cache Components, Turbopack) with **React 19** and **TypeScript**
- **MongoDB** with **Mongoose** for app data
- **Better Auth** for organiser accounts (email and password, GitHub, Google)
- **Cloudinary** for event images
- **Nodemailer** (SMTP) for verification and reset emails
- **PostHog** for product analytics
- **Tailwind CSS v4**
- **Vitest**, Testing Library and `mongodb-memory-server` for tests

## Features

- **Event listing and details**: browse upcoming events, see full details and similar events.
- **Email booking**: book an event with just an email address.
- **Organiser accounts**: sign up, verify email, and create, edit and delete your own events.
- **Image uploads**: event images are uploaded to and served from Cloudinary.
- **Admin tools**: the super admin promotes admins; admins can ban organisers, which hides their events.
- **Caching**: data reads use Next.js 16 `'use cache'` with tag-based invalidation after every write.
- **Analytics**: key user actions are tracked with PostHog.

## Getting started

**Prerequisites**: Git, Node.js and npm.

```bash
git clone https://github.com/nelsonhano/dev-Event.git
cd dev-Event
npm install
```

### Environment variables

Copy `.env.example` to `.env.local` and fill in the values:

```env
MONGODB_URI=
MONGODB_TRANSACTIONS=true

CLOUDINARY_URL=

NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com

# Organiser accounts (Better Auth)
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3000
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Email (Nodemailer over SMTP)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_SECURE=false
EMAIL_FROM="DevEvent <no-reply@example.com>"

SUPER_ADMIN_EMAIL=
```

- `MONGODB_URI`: a [MongoDB Atlas](https://www.mongodb.com/products/platform/atlas-database) connection string. Add your IP to the Atlas Network Access list.
- `CLOUDINARY_URL`: from your [Cloudinary](https://cloudinary.com/) dashboard.
- `NEXT_PUBLIC_POSTHOG_KEY`: from your [PostHog](https://posthog.com/) project settings.
- `BETTER_AUTH_SECRET`: 32 or more random bytes, for example `openssl rand -base64 32`.
- GitHub: create an OAuth app with the callback `${BETTER_AUTH_URL}/api/auth/callback/github`.
- Google: create an OAuth client with the callback `${BETTER_AUTH_URL}/api/auth/callback/google`.
- The GitHub and Google buttons only appear once their client id and secret are set.
- Email: any SMTP account works. Without one, sign up still works, but no verification or reset email arrives.

### Run it

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run lint` | Lint the code |
| `npm test` | Run the test suite (the first run downloads a MongoDB binary) |
| `npm run seed:events` | Add 20 sample events owned by the super admin; safe to repeat |
| `npm run backfill:owners` | Give ownerless events to the super admin; safe to repeat |
| `npm run reconcile:bans` | Reapply every user's ban state to their events; safe to repeat |

`seed:events` and `backfill:owners` need the `SUPER_ADMIN_EMAIL` account to have signed in once.

## Admins and bans

The account whose email matches `SUPER_ADMIN_EMAIL` becomes the super admin when it signs in, verified. From `/admin` it can promote admins, and admins can ban organisers (which hides their events). If a ban or unban ever reports that hiding or restoring events failed, run `npm run reconcile:bans`.
