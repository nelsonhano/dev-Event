// Seeds 20 sample events, each with unique text, date, time and image, owned by the
// super admin (the same owner the backfill gives ownerless events, spec 0001, AC-24).
// Run with `npm run seed:events`. Safe to repeat: events whose slug exists are skipped.
// Self contained (mongodb driver + cloudinary only), so Node can run it directly.
import { MongoClient, type Db } from 'mongodb';
import cloudinaryPkg from 'cloudinary';
import dns from 'node:dns';

try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
    // Ignore in sandboxed/restricted environments
}

const cloudinary = cloudinaryPkg.v2;

type Mode = 'online' | 'offline' | 'hybrid';

export interface SeedEvent {
    title: string;
    description: string;
    overview: string;
    venue: string;
    location: string;
    date: string; // YYYY-MM-DD
    time: string; // HH:MM, 24 hour
    mode: Mode;
    audience: string;
    organizer: string;
    agenda: string[];
    tags: string[];
}

export const SEED_EVENTS: SeedEvent[] = [
    {
        title: 'React Summit Lagos 2026',
        description: 'A full day of talks on React 19, server components and the patterns teams are shipping in production across West Africa. Expect live coding, case studies from local startups and a hallway track full of people building real products.',
        overview: 'West Africa’s biggest React conference, focused on server components and production patterns.',
        venue: 'Landmark Event Centre',
        location: 'Lagos, Nigeria',
        date: '2026-11-28',
        time: '09:00',
        mode: 'offline',
        audience: 'Frontend and full stack developers',
        organizer: 'React Lagos Community',
        agenda: ['09:00 Registration and breakfast', '10:00 Keynote: React after hooks', '11:30 Server components in the wild', '14:00 Panel: Scaling frontend teams', '16:30 Lightning talks'],
        tags: ['react', 'frontend', 'javascript'],
    },
    {
        title: 'Rust for Backend Engineers Workshop',
        description: 'A hands-on workshop that takes you from your first cargo project to a production-ready HTTP service with Axum, SQLx and structured logging. Bring a laptop with Rust installed; exercises build on each other through the day.',
        overview: 'Build a production-ready Rust web service from scratch in one guided day.',
        venue: 'The Foundry Berlin',
        location: 'Berlin, Germany',
        date: '2026-12-03',
        time: '10:00',
        mode: 'offline',
        audience: 'Backend developers new to Rust',
        organizer: 'Ferris Collective',
        agenda: ['10:00 Ownership without tears', '11:30 Building routes with Axum', '13:30 Databases with SQLx', '15:00 Observability and tracing', '16:30 Deploying the binary'],
        tags: ['rust', 'backend', 'workshop'],
    },
    {
        title: 'Kubernetes Day Nairobi',
        description: 'Operators and platform engineers share what it really takes to run Kubernetes on a budget: cluster autoscaling, cost visibility, GitOps with Argo CD and the incidents that taught them the most.',
        overview: 'Practical Kubernetes operations from teams running clusters in East Africa.',
        venue: 'iHub Auditorium',
        location: 'Nairobi, Kenya',
        date: '2026-12-08',
        time: '08:30',
        mode: 'hybrid',
        audience: 'DevOps and platform engineers',
        organizer: 'CNCF Nairobi',
        agenda: ['08:30 Doors open', '09:15 Keynote: Kubernetes on a shoestring', '10:30 GitOps with Argo CD', '13:00 Incident retrospectives', '15:00 Cost visibility workshop'],
        tags: ['kubernetes', 'devops', 'cloud-native'],
    },
    {
        title: 'AI Agents Hack Night',
        description: 'An evening hackathon where teams of three build tool-using AI agents against real public APIs. Mentors from the community are on hand, and the three most useful agents win cloud credits.',
        overview: 'Team up and ship a working AI agent in one evening.',
        venue: 'Online on Discord',
        location: 'Online',
        date: '2026-12-12',
        time: '18:00',
        mode: 'online',
        audience: 'Developers curious about LLM agents',
        organizer: 'Prompt Engineers Guild',
        agenda: ['18:00 Kickoff and team forming', '18:30 Hacking begins', '21:00 Mentor office hours', '23:00 Demos', '23:45 Winners announced'],
        tags: ['ai', 'agents', 'hackathon'],
    },
    {
        title: 'Postgres Performance Deep Dive',
        description: 'Learn to read EXPLAIN ANALYZE output with confidence, choose the right index type, tune autovacuum and spot the query patterns that quietly cost you money. Every topic uses a real anonymised production dataset.',
        overview: 'Hands-on query tuning and indexing for PostgreSQL in production.',
        venue: 'Shoreditch Works',
        location: 'London, United Kingdom',
        date: '2026-12-15',
        time: '13:00',
        mode: 'offline',
        audience: 'Backend engineers and DBAs',
        organizer: 'London Postgres Users Group',
        agenda: ['13:00 Reading query plans', '14:15 Index types that matter', '15:30 Autovacuum tuning', '16:45 Q&A with maintainers'],
        tags: ['postgres', 'databases', 'performance'],
    },
    {
        title: 'Flutter Forward Accra',
        description: 'A community conference covering Flutter 4, Impeller rendering, state management debates and how Ghanaian fintechs ship apps to millions of users with tiny teams.',
        overview: 'Flutter talks and workshops from teams shipping mobile apps at scale in Ghana.',
        venue: 'Accra Digital Centre',
        location: 'Accra, Ghana',
        date: '2027-01-09',
        time: '09:30',
        mode: 'offline',
        audience: 'Mobile developers',
        organizer: 'GDG Accra',
        agenda: ['09:30 Welcome', '10:00 What is new in Flutter', '11:30 State management showdown', '14:00 Fintech case study', '15:30 Codelab: Animations'],
        tags: ['flutter', 'mobile', 'dart'],
    },
    {
        title: 'Web Security Capture the Flag',
        description: 'A beginner-friendly capture the flag competition on deliberately vulnerable web apps. Find XSS, SQL injection, SSRF and broken access control, then learn the fixes in a guided walkthrough afterwards.',
        overview: 'Hack deliberately vulnerable apps and learn the fix for every bug you find.',
        venue: 'Online on CTFd',
        location: 'Online',
        date: '2027-01-16',
        time: '15:00',
        mode: 'online',
        audience: 'Web developers and security beginners',
        organizer: 'OWASP Student Chapter',
        agenda: ['15:00 Rules and setup', '15:30 Competition opens', '19:30 Competition closes', '20:00 Walkthrough of every flag'],
        tags: ['security', 'ctf', 'owasp'],
    },
    {
        title: 'TypeScript Type Gymnastics',
        description: 'An advanced session on conditional types, template literal types, variance and inference tricks. We rebuild popular library types from scratch so you can read and write them yourself.',
        overview: 'Master advanced TypeScript types by rebuilding real library typings.',
        venue: 'Kraków Tech Hub',
        location: 'Kraków, Poland',
        date: '2027-01-21',
        time: '17:30',
        mode: 'hybrid',
        audience: 'Intermediate TypeScript developers',
        organizer: 'TypeScript Kraków',
        agenda: ['17:30 Doors and pizza', '18:00 Conditional and mapped types', '19:00 Template literal tricks', '20:00 Rebuilding zod infer'],
        tags: ['typescript', 'types', 'javascript'],
    },
    {
        title: 'Data Engineering with DuckDB',
        description: 'Discover how far a single machine can take you. We build an analytics pipeline over parquet files with DuckDB, dbt and a little Python, then compare cost and speed against a cloud warehouse.',
        overview: 'Fast, cheap analytics pipelines on one laptop with DuckDB and dbt.',
        venue: 'Amsterdam Data Lab',
        location: 'Amsterdam, Netherlands',
        date: '2027-02-04',
        time: '11:00',
        mode: 'offline',
        audience: 'Data engineers and analysts',
        organizer: 'Dutch Data Engineers',
        agenda: ['11:00 Why single-node analytics', '12:00 Querying parquet directly', '14:00 Modelling with dbt', '15:30 Benchmarks versus a warehouse'],
        tags: ['data-engineering', 'duckdb', 'analytics'],
    },
    {
        title: 'Women in Tech Leadership Breakfast',
        description: 'An informal morning of stories and practical advice from engineering managers, staff engineers and founders on growing into leadership roles, negotiating promotions and building inclusive teams.',
        overview: 'Career stories and leadership advice from women leading engineering teams.',
        venue: 'Radisson Blu Waterfront',
        location: 'Cape Town, South Africa',
        date: '2027-02-11',
        time: '07:30',
        mode: 'offline',
        audience: 'Engineers moving into leadership',
        organizer: 'Women in Tech Cape Town',
        agenda: ['07:30 Breakfast and networking', '08:15 Fireside chat', '09:00 Roundtables', '10:00 Closing remarks'],
        tags: ['leadership', 'career', 'diversity'],
    },
    {
        title: 'Go Concurrency Patterns Live',
        description: 'Goroutines, channels, context cancellation and errgroup explained with live coding. We finish by building a rate-limited crawler and profiling it to find the real bottlenecks.',
        overview: 'Live-coded tour of practical Go concurrency, from channels to profiling.',
        venue: 'Online on YouTube Live',
        location: 'Online',
        date: '2027-02-18',
        time: '19:00',
        mode: 'online',
        audience: 'Go developers of all levels',
        organizer: 'Gophers Worldwide',
        agenda: ['19:00 Goroutines and channels', '19:40 Context and cancellation', '20:20 Building the crawler', '21:00 Profiling with pprof'],
        tags: ['go', 'concurrency', 'backend'],
    },
    {
        title: 'Design Systems Conf Toronto',
        description: 'Designers and engineers compare notes on tokens, component APIs, accessibility audits and keeping a design system alive after launch. Includes a Figma-to-code workshop track.',
        overview: 'Where design and engineering meet to build design systems that last.',
        venue: 'The Great Hall',
        location: 'Toronto, Canada',
        date: '2027-03-02',
        time: '09:15',
        mode: 'hybrid',
        audience: 'Frontend engineers and product designers',
        organizer: 'Design Systems North',
        agenda: ['09:00 Keynote: Tokens all the way down', '10:30 Accessible component APIs', '13:00 Figma to code workshop', '15:30 Governance panel'],
        tags: ['design-systems', 'accessibility', 'ui'],
    },
    {
        title: 'Serverless Bootcamp São Paulo',
        description: 'A practical bootcamp on event-driven architectures with functions, queues and durable workflows. Learn retries, idempotency and observability by building an order-processing system.',
        overview: 'Build an event-driven order system with functions, queues and workflows.',
        venue: 'Cubo Itaú',
        location: 'São Paulo, Brazil',
        date: '2027-03-10',
        time: '10:30',
        mode: 'offline',
        audience: 'Cloud and backend developers',
        organizer: 'Serverless Brasil',
        agenda: ['10:30 Event-driven basics', '12:00 Queues and retries', '14:00 Durable workflows', '16:00 Tracing across functions'],
        tags: ['serverless', 'cloud', 'architecture'],
    },
    {
        title: 'Open Source Contributor Sprint',
        description: 'Maintainers of popular open source projects pair with first-time contributors to land real pull requests. Issues are pre-labelled, so you can pick one and start contributing within minutes.',
        overview: 'Land your first open source pull request with maintainers by your side.',
        venue: 'Online on GitHub and Zoom',
        location: 'Online',
        date: '2027-03-20',
        time: '14:00',
        mode: 'online',
        audience: 'First-time open source contributors',
        organizer: 'Open Source Friday',
        agenda: ['14:00 How to read a codebase', '14:30 Pick an issue', '15:00 Pairing with maintainers', '18:00 Celebrate merged PRs'],
        tags: ['open-source', 'github', 'community'],
    },
    {
        title: 'Machine Learning Ops Summit',
        description: 'From notebooks to reliable services: feature stores, model registries, evaluation pipelines and monitoring for drift. Speakers share what broke in production and how they fixed it.',
        overview: 'Taking machine learning models from notebooks to reliable production services.',
        venue: 'Marina Bay Sands Expo',
        location: 'Singapore',
        date: '2027-04-06',
        time: '08:45',
        mode: 'hybrid',
        audience: 'ML engineers and data scientists',
        organizer: 'MLOps Asia',
        agenda: ['08:45 Registration', '09:30 Keynote: Models are software too', '11:00 Evaluation pipelines', '14:00 Drift monitoring', '16:00 Closing panel'],
        tags: ['mlops', 'machine-learning', 'ai'],
    },
    {
        title: 'Accessibility Testing Clinic',
        description: 'Bring your own site and leave with a prioritised list of accessibility fixes. Experts walk through screen reader testing, keyboard navigation, colour contrast and automated checks in CI.',
        overview: 'Get your own website audited for accessibility by experts, live.',
        venue: 'Dublin Tech Quarter',
        location: 'Dublin, Ireland',
        date: '2027-04-14',
        time: '16:00',
        mode: 'offline',
        audience: 'Web developers and QA engineers',
        organizer: 'A11y Ireland',
        agenda: ['16:00 Screen reader basics', '16:45 Keyboard and focus', '17:30 Automated checks in CI', '18:15 Live site audits'],
        tags: ['accessibility', 'testing', 'web'],
    },
    {
        title: 'Blockchain Smart Contract Audit Lab',
        description: 'Learn how auditors review Solidity contracts: reentrancy, oracle manipulation, access control mistakes and gas griefing. You will audit three real-world inspired contracts in small groups.',
        overview: 'Audit Solidity contracts the way professional security reviewers do.',
        venue: 'Dubai Internet City Hall B',
        location: 'Dubai, United Arab Emirates',
        date: '2027-04-24',
        time: '12:00',
        mode: 'offline',
        audience: 'Smart contract developers',
        organizer: 'Web3 Security Alliance',
        agenda: ['12:00 Common vulnerability classes', '13:30 Audit exercise one', '15:00 Audit exercise two', '16:30 Writing the audit report'],
        tags: ['blockchain', 'solidity', 'security'],
    },
    {
        title: 'Next.js App Router Masterclass',
        description: 'A deep dive into the App Router: caching with cache components, server actions, streaming with Suspense and tag-based revalidation. We build and deploy a small events app together.',
        overview: 'Build and deploy a full Next.js App Router app with modern caching.',
        venue: 'Online on Zoom',
        location: 'Online',
        date: '2027-05-05',
        time: '16:30',
        mode: 'online',
        audience: 'React developers moving to Next.js',
        organizer: 'Next Builders Club',
        agenda: ['16:30 Routing and layouts', '17:15 Cache components', '18:00 Server actions', '18:45 Deploying to production'],
        tags: ['nextjs', 'react', 'fullstack'],
    },
    {
        title: 'Game Dev Jam Tokyo',
        description: 'A 48-hour game jam with a secret theme revealed at the opening. Use any engine, from Godot to Unity to plain WebGL. Finished games are played and judged on stage on Sunday evening.',
        overview: 'Make a game in 48 hours around a secret theme, then play it on stage.',
        venue: 'Shibuya Creative Space',
        location: 'Tokyo, Japan',
        date: '2027-05-21',
        time: '20:00',
        mode: 'offline',
        audience: 'Game developers, artists and musicians',
        organizer: 'Indie Game Tokyo',
        agenda: ['20:00 Theme reveal', '20:30 Jam begins', '12:00 Saturday check-in demos', '18:00 Sunday submissions close', '19:00 Showcase and awards'],
        tags: ['gamedev', 'game-jam', 'godot'],
    },
    {
        title: 'API Design and Versioning Forum',
        description: 'An honest discussion on REST versus GraphQL versus RPC, designing for backwards compatibility, deprecation policies that customers accept and generating SDKs from OpenAPI specs.',
        overview: 'How to design, version and deprecate APIs your customers trust.',
        venue: 'Kigali Convention Centre',
        location: 'Kigali, Rwanda',
        date: '2027-06-08',
        time: '14:30',
        mode: 'hybrid',
        audience: 'Backend engineers and API product owners',
        organizer: 'API Builders Africa',
        agenda: ['14:30 REST, GraphQL or RPC', '15:30 Backwards compatibility rules', '16:30 Deprecation that works', '17:30 SDKs from OpenAPI'],
        tags: ['api', 'graphql', 'openapi'],
    },
];

// Same rules as generateSlug in database/event.model.ts.
export function slugify(title: string): string {
    return title
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

export type UploadImage = (slug: string) => Promise<{ url: string; publicId: string }>;

// A distinct stock photo per event, copied into the app's Cloudinary folder so
// next/image can load it (only res.cloudinary.com is allowed in next.config.ts).
const uploadFromPicsum: UploadImage = async (slug) => {
    const result = await cloudinary.uploader.upload(`https://picsum.photos/seed/${slug}/1200/630`, {
        folder: 'DevEvent',
        public_id: `seed-${slug}`,
        overwrite: true,
        resource_type: 'image',
    });
    return { url: result.secure_url, publicId: result.public_id };
};

export type SeedResult =
    | { ok: true; ownerId: string; created: string[]; skipped: string[] }
    | { ok: false; message: string };

export async function seedEvents(db: Db, superAdminEmail: string | undefined, uploadImage: UploadImage = uploadFromPicsum): Promise<SeedResult> {
    const email = superAdminEmail?.trim().toLowerCase();
    if (!email) return { ok: false, message: 'SUPER_ADMIN_EMAIL is not set' };

    const user = await db.collection('user').findOne({ email }, { projection: { _id: 1 } });
    if (!user) return { ok: false, message: 'Sign in once as SUPER_ADMIN_EMAIL, then run this again' };
    const ownerId = String(user._id);

    const events = db.collection('events');
    const created: string[] = [];
    const skipped: string[] = [];

    for (const seed of SEED_EVENTS) {
        const slug = slugify(seed.title);
        if (await events.findOne({ slug }, { projection: { _id: 1 } })) {
            skipped.push(slug);
            continue;
        }
        const image = await uploadImage(slug);
        const now = new Date();
        await events.insertOne({
            ...seed,
            slug,
            image: image.url,
            imagePublicId: image.publicId,
            organiserId: ownerId,
            ownerBanned: false,
            createdAt: now,
            updatedAt: now,
        });
        created.push(slug);
    }
    return { ok: true, ownerId, created, skipped };
}

async function main() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGODB_URI is not set');
        process.exit(1);
    }
    if (!process.env.CLOUDINARY_URL) {
        console.error('CLOUDINARY_URL is not set');
        process.exit(1);
    }
    const client = new MongoClient(uri, { maxPoolSize: 1 });
    try {
        const result = await seedEvents(client.db(), process.env.SUPER_ADMIN_EMAIL);
        if (!result.ok) {
            console.error(result.message);
            process.exitCode = 1;
            return;
        }
        for (const slug of result.created) console.log(`created  ${slug}`);
        for (const slug of result.skipped) console.log(`skipped  ${slug} (already exists)`);
        console.log(`Done: ${result.created.length} created, ${result.skipped.length} skipped, owner ${result.ownerId}.`);
    } finally {
        await client.close();
    }
}

if (import.meta.main) {
    void main();
}
