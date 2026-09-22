# TravelScout

Monorepo for TravelScout. The live Next.js site lives under `web/`. Mobile apps
will land under `android/` and `ios/`. Unused legacy code (including the trip
planner) is archived under `defunct/`.

## Layout

```text
web/                 Active Next.js site (deals, operator marketplace, auth, marketing)
android/             Reserved for the Android app
ios/                 Reserved for the iOS app
defunct/             Archived / unused code kept for reference (not part of the build)
supabase/            Shared database migrations and functions
scraper/             Deal / event scrapers
scripts/             Data pipeline scripts (OSM / places imports)
docs/                Cross-cutting ops docs (e.g. operator subdomain)
docker-compose.yml   Local Redis for the web BFF
```

## Web app

```bash
cd web
npm install
npm run dev
```

Build: `npm run build` (from `web/`).

### Vercel (required)

In the Vercel project → **Settings → General**:

1. **Root Directory** = `web` (no slash)
2. **Install Command** = leave default / empty (must be `npm install` or `npm ci`, **not** `npm ci --prefix web`)
3. **Build Command** = leave default, or `npm run build` / `npm run vercel-build`

With Root Directory set to `web`, Vercel already runs inside that folder, so
`--prefix web` breaks the lockfile path.

Also set **Node.js Version** to `22.x` in Settings → General.

Supabase migrations, scrapers, and Redis compose stay at the repo root and are
unchanged by this layout.

## What stayed active in `web/`

- Home, Find Deals, How it works
- Auth + account profile
- Operator portal + marketplace APIs
- Supporting marketing pages (compare, guides, tips, top deals, packages, legal)
- Viator **tags** sync API (`/api/viator/tags*`) so scheduled tag sync and
  Supabase tables keep working

## What moved to `defunct/`

- Trip planner UI, routes, navbar, map, and related libs
- Account itineraries page
- Trips / events / weather / Google Places / LiteAPI / Ticketmaster / hello APIs
- Orphan components and planner-only React Query hooks
- One-off API probe scripts and outdated trip-planner docs / assets

See `defunct/README.md` for the archive map.
