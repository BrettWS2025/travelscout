# TravelScout Codebase Architecture & Structure

_Last updated: December 2025_

## 1. Stack & Runtime

- **Framework**: Next.js 14 (App Router, TypeScript)
- **UI**: React 18, Tailwind CSS, custom dark theme in `styles/globals.css`
- **Charts**: Recharts
- **Maps & Routing**: React Leaflet + `leaflet-routing-machine`
- **Dates**: `react-day-picker`
- **Analytics**: `@vercel/analytics` + `@vercel/speed-insights`
- **Data Pipeline**: Python 3 + Scrapy (`scraper/`)

---

## 2. Frontend Application Structure

### 2.1 Layout & Global Shell

**File:** `app/layout.tsx`

- Imports global styles:
  - `styles/globals.css`
  - `react-day-picker/dist/style.css`
- Wraps all pages with:
  - `<Navbar />` (`components/Navbar.tsx`)
  - `<Footer />` (`components/Footer.tsx`)
  - `<Analytics />` and `<SpeedInsights />` (only when `NEXT_PUBLIC_VERCEL_ENV === "production"`).

**Global styling: `styles/globals.css`**

- Defines dark-mode palette:
  - `--bg`, `--card`, `--text`, `--muted`, `--accent`, `--brand`
- Provides shared utility classes:
  - `.card`, `.btn`, `.chip`, `.link`, form inputs, etc.
- Tailwind is used heavily for layout and spacing; custom CSS handles theme and component polish.

---

### 2.2 Route Groups & Pages

The app uses the Next.js App Router with **route groups**:

- `app/(marketing)/` – marketing, SEO and content pages.
- `app/(product)/` – more app/tooling-style product pages.
- `app/api/` – API routes (see Section 3).

#### 2.2.1 Home Page

**File:** `app/page.tsx`

- Public marketing landing page for TravelScout.
- Renders:
  - Hero section (`<Hero />`)
  - Feature cards (`<FeatureCards />`)
  - “Best time to book” section (booking timing charts)
  - Top destinations (`<TopDestinationsTable />`)
  - Top deals (`<TopDealsTable />`)
- Uses static data from:
  - `lib/deals.ts`
  - `lib/destinations.ts`
  - Other simple data modules.

#### 2.2.2 Trip Planner

**File:** `app/(marketing)/trip-planner/page.tsx`

- Metadata: `Trip Planner | TravelScout`
- Renders the core itinerary builder:
  - `<TripPlanner />` (`components/TripPlanner.tsx`)
- Provides explanatory copy and layout shell for the Trip Planner tool.

#### 2.2.3 Deals & Products / Comparisons

- **Top deals table**
  - `app/(marketing)/top-deals/page.tsx`
  - Renders `<TopDealsTable />` – curated/static top deal list.

- **All deals (cards)**  
  - `app/(marketing)/top-deals/topdeals/page.tsx`
  - Renders `<AllTravelDeals />` – grid of card-based deals.

- **Product comparisons (generic)**
  - `app/(product)/comparisons/page.tsx`
  - Renders `<FilterableProducts />` with a `ProductOffer[]` data set and a declarative filter/column spec.
  - Used for things like cruise comparisons or supplier comparisons.

- **Destinations products**
  - `app/(product)/destinations-products/page.tsx`
  - Renders `<TopDestinationsTable />` again in a more “product” context.

#### 2.2.4 Guides & Tips

- General guides and articles:
  - `app/(marketing)/guides/page.tsx`
  - `app/(marketing)/tips/page.tsx`
- Example destination guide:
  - `app/(marketing)/guides/destinations/kaitaia/page.tsx`
- Comparison pages (e.g. insurance, agencies vs OTAs, cruise comparisons):
  - `app/(marketing)/compare/...`

These pages are primarily static content today, but can later be wired into scraped / structured data.

---

## 2.3 Core Trip Planner Feature

The Trip Planner is the main interactive feature of the app. It allows users to build a **day-by-day NZ road trip itinerary** from:

- Start and end cities
- Travel dates
- Waypoints / stops
- Nights per stop

### 2.3.1 Cities & Stops Data

**File:** `lib/nzCities.ts`

- Type: `NzCity`
  ```ts
  type NzCity = {
    id: string;
    name: string;
    lat: number;
    lng: number;
  };
  ```
- Exports:
  - `NZ_CITIES: NzCity[]` – seed list (Auckland, Wellington, Christchurch, etc.)
  - `DEFAULT_START_CITY_ID`, `DEFAULT_END_CITY_ID`
  - `getCityById(id: string): NzCity | undefined`

**File:** `lib/nzStops.ts`

- Type: `NzStop`
  ```ts
  type NzStop = {
    id: string;
    name: string;
    lat: number;
    lng: number;
    aliases?: string[];
  };
  ```
- Exports:
  - `NZ_STOPS: NzStop[]` – scenic stops: Lake Tekapo, Twizel, Mt Cook Village, etc.
  - Helper functions:
    - `findStopByText(text: string): NzStop | undefined`
    - `matchStopsFromInputs(inputs: string[]): NzStop[]`
    - `orderWaypointNamesByRoute(start: NzCity, waypoints: string[], end: NzCity): string[]`

These utilities provide a simple geographic model for NZ road trips and help translate user text into known stops.

### 2.3.2 Trip Planning Logic

**File:** `lib/itinerary.ts`

Key types:

- `TripInput`
  ```ts
  type TripInput = {
    startCity: NzCity;
    endCity: NzCity;
    startDate: string; // ISO date
    endDate: string;   // ISO date
    waypoints: string[];
  };
  ```

- `TripDay`
  ```ts
  type TripDay = {
    date: string;
    index: number;
    label: string;
    origin: string;
    destination: string;
    summary: string;
    // ...optional fields
  };
  ```

- `TripPlan`
  ```ts
  type TripPlan = {
    days: TripDay[];
  };
  ```

- `TripLeg` / `MapPointForLegs`
  - Normalised structures for building map routes.

Core functions:

- `countDaysInclusive(start: string, end: string): number`
  - Inclusive day-count helper.

- `buildTripPlanFromStopsAndNights(stops: string[], nightsPerStop: number[], startDate: string): TripPlan`
  - Generates a `TripPlan` given an ordered list of stops and number of nights per stop.

- `buildSimpleTripPlan(input: TripInput): TripPlan`
  - Higher-level helper that builds a basic `TripPlan` from a `TripInput` (start/end, waypoints, date range).

- `buildLegsFromPoints(points: MapPointForLegs[]): TripLeg[]`
  - Generates map legs for side-by-side map visualisation (used by the Leaflet map).

### 2.3.3 TripPlanner UI Component

**File:** `components/TripPlanner.tsx`  
**Type:** Client component (`"use client"`).

Responsibilities:

- Manages state for:
  - `startCityId`, `endCityId`
  - `dateRange` (via `react-day-picker` `DateRange`)
  - `waypoints` (array of text labels)
  - Nights per stop
  - Derived `TripPlan` and metrics (e.g. total days).

- Core UI features:
  - City selection dropdowns (start/end).
  - Calendar input for start and end dates.
  - Waypoint input (via `<WaypointInput />`).
  - Derived itinerary preview:
    - Day-by-day list
    - Summary (total days, nights, stops)
  - Map visualisation:
    - Dynamically imports `<TripMap />` with `ssr: false` to avoid Leaflet / `window` issues during SSR.

> **Note:** As of now, TripPlanner operates entirely in memory on the client and does not yet persist trips via `/api/trips`.

### 2.3.4 Map Rendering

**File:** `components/TripMap.tsx`  
**Type:** Client component.

- Uses React Leaflet:
  - `MapContainer`
  - `TileLayer`
  - `Marker`
  - `Popup`
- Uses `leaflet-routing-machine` to draw routes between the ordered points.
- Given the array of legs/points, it:
  - Places markers at each stop.
  - Draws a polyline route.
  - Fits the map view to bounds of all points.

### 2.3.5 Waypoint Input

**File:** `components/WaypointInput.tsx`  
**Type:** Client component.

- Behaves like a multi-select / “chips” text input:
  - Users can enter multiple waypoints.
  - Suggestions are sourced from `NZ_CITIES` and `NZ_STOPS`.
- UX details:
  - Typeahead suggestions with keyboard navigation (Arrow keys + Enter).
  - Click outside to close suggestion dropdown.
  - Allows free-form text as well as structured stops.

---

## 2.4 Deals, Products & Comparison UIs

### 2.4.1 Data Shapes

**File:** `lib/deals.ts`

- `Deal` type for flight deals:
  ```ts
  type Deal = {
    route: string;
    airline: string;
    fare: number;
    travelWindow: string;
    bookUrl: string;
    note?: string;
  };
  ```
- `deals: Deal[]` – static example airfare deals.

**File:** `lib/destinations.ts`

- `Destination` type for top destinations:
  ```ts
  type Destination = {
    name: string;
    bestSeason: string;
    cost7d: number;
    vibe: string;
    guideUrl?: string;
  };
  ```
- `destinations: Destination[]` – curated example destinations.

**File:** `lib/products.ts`

- `ProductOffer` – generalised structure for product / package offers:
  ```ts
  type ProductOffer = {
    id: string;
    vendor: string;
    brand: string;
    title: string;
    price: number;
    currency: string;
    dateRange?: string;
    origin?: string;
    destination?: string;
    // ...other descriptive fields
    link: string;
  };
  ```

### 2.4.2 UI Components

- `components/TopDealsTable.tsx`
  - Table view of top flight deals from `lib/deals.ts`.

- `components/TopDestinationsTable.tsx`
  - Table view of `destinations` with optional “Guide” links.

- `components/AllTravelDeals.tsx`
  - Card grid of hard-coded deals (`title`, `subtitle`, `price`, `location`, `tag`, etc.).

- `components/ComparisonTable.tsx`
  - Generic table for displaying `ProductOffer` data.

- `components/FilterableProducts.tsx`
  - Full-featured filter/sort UI built around `ProductOffer[]` and a **declarative filter spec**.
  - Filter spec supports:
    - Search filters (one or multiple fields)
    - Select filters (dropdowns)
    - Numeric ranges (min/max)
    - Date ranges
    - Checkboxes
  - Meant as a reusable building block for comparisons (e.g. cruises, agencies, packages).

### 2.4.3 Booking Timing Charts (Recharts)

Components:

- `DomesticFlightBookingTimingChart.tsx`
- `InternationalFlightBookingTimingChart.tsx`
- `AusPacificFlightBookingTimingChart.tsx`

Common traits:

- Client components using Recharts primitives:
  - `AreaChart`, `CartesianGrid`, `XAxis`, `YAxis`, `Tooltip`, `Area`, etc.
- Each has default, bucketed pricing data (e.g. days before departure vs average fare).
- Props allow some configurability (`currency`, `dark mode`, optional custom data).

---

## 3. API & Domain Layer

### 3.1 Domain Types

**File:** `lib/domain.ts`

Defines core entities for trips and activities that can be persisted and tied to bookings.

Key types:

- Identifiers:
  ```ts
  type UserId = string;
  type TripId = string;
  type TripDayId = string;
  type ActivityId = string;
  ```

- `Trip`
  ```ts
  type Trip = {
    id: TripId;
    userId: UserId;
    name: string;
    createdAt: string;
    updatedAt: string;
    notes?: string;
  };
  ```

- `TripDay`
  ```ts
  type TripDay = {
    id: TripDayId;
    tripId: TripId;
    date: string;
    index: number;
    city?: string;
    notes?: string;
  };
  ```

- `ActivityKind`
  ```ts
  type ActivityKind =
    | "note"
    | "accommodation"
    | "activity"
    | "transport"
    | "flight"
    | "rental_car"
    | "campervan"
    | "restaurant"
    | "event"
    | "other";
  ```

- `ActivityProvider`
  ```ts
  type ActivityProvider = {
    name?: string;
    url?: string;
    logoUrl?: string;
    source?: string; // e.g. "flight_centre", "booking_com"
  };
  ```

- `Activity`
  ```ts
  type Activity = {
    id: ActivityId;
    tripId: TripId;
    dayId: TripDayId;
    kind: ActivityKind;
    title: string;
    notes?: string;
    provider?: ActivityProvider;
    startsAt?: string;
    endsAt?: string;
    price?: number;
    currency?: string;
    externalId?: string;
    externalUrl?: string;
    locationName?: string;
  };
  ```

- `TripWithDetails`
  ```ts
  type TripWithDetails = {
    trip: Trip;
    days: TripDay[];
    activities: Activity[];
  };
  ```

These types provide a flexible base for attaching bookings and activities (hotels, cars, campervans, events, etc.) to an itinerary.

### 3.2 Trips API (`/api/trips`)

**File:** `app/api/trips/route.ts`

Purpose: Provide a simple API for storing and retrieving trips. Currently uses an **in-memory store** and a single demo user.

- **Runtime**: explicitly set to Node.js (`export const runtime = "nodejs"`).

Implementation details:

- Uses a `Map<UserId, TripWithDetails[]>` as a fake database.
- Uses a constant `DEMO_USER_ID = "user_demo"` as the only user id for now.

Handlers:

- `GET /api/trips`
  - Returns all trips for `DEMO_USER_ID` as JSON.
- `POST /api/trips`
  - Accepts `{ trip: TripWithDetails }` in the request body.
  - Normalises and fills fields:
    - Ensures `trip.id` exists (uses `crypto.randomUUID()` if missing).
    - Sets `trip.userId = DEMO_USER_ID`.
    - Ensures `createdAt` / `updatedAt` timestamps are set to ISO strings.
  - Upserts into the in-memory Map and returns `{ trip: savedTrip }`.

> **Note:** In a future iteration, this can be swapped to a real database (e.g. Supabase) with the same API contract.

### 3.3 Packages API (`/api/packages`)

**File:** `app/api/packages/route.ts`

Purpose: Expose scraped travel packages from the `scraper/` pipeline to the frontend.

- Reads from `public/data/packages.final.jsonl` via:

  **File:** `lib/loadPackagesFromFs.ts`
  ```ts
  const filePath = path.join(process.cwd(), "public", "data", "packages.final.jsonl");
  // Reads line-delimited JSON, parses each line as a Package, and returns Package[]
  ```

- Package type defined in:

  **File:** `lib/types.ts`
  ```ts
  export type Package = {
    package_id: string;
    source: string;
    url: string;
    title: string;
    destinations: string[];
    duration_days: number;
    nights?: number | null;
    price: number;
    currency: string;
    price_basis: string; // e.g. "per_person" or "total"
    price_nzd?: number;
    price_pppn?: number;
    includes?: {
      flights?: boolean;
      hotel?: boolean;
      board?: string | null;
      transfers?: boolean | null;
      activities?: string[];
    };
    hotel?: {
      name?: string | null;
      stars?: number | null;
      room_type?: string | null;
    };
    sale_ends_at?: string | null;
    last_seen_at: string;
  };
  ```

- Query parameters:
  - `?dest=queenstown`
    - Filters `destinations` array (case-insensitive substring match).
  - `?flights=true` or `?flights=false`
    - Filters based on `includes.flights`.

- Response:
  - Returns a JSON array of `Package` objects.

---

## 4. Scraper & Data Pipeline

### 4.1 Scraper Project (`scraper/`)

The scraper is a standalone Scrapy project embedded in this repo.

- **Framework**: Scrapy + Pydantic (for typed models and validation).

Key elements:

- **Models** – `scraper/models.py`
  - Pydantic models representing travel packages and the internal TravelScout package schema.
  - Handles validation (e.g. `price > 0`, required fields, URL validation).

- **Scrapy Project** – `scraper/tscraper/`
  - Standard Scrapy structure:
    - `items.py`, `middlewares.py`, `settings.py`
    - `spiders/` – multiple spiders for different providers:
      - `flightcentre.py`, `flightcentre_sitemap.py`
      - `houseoftravel.py`, `houseoftravel_sitemap.py`
      - `helloworld.py`, `helloworld_cruise.py`
      - `worldtravellers.py`, `worldtravellers_sitemap.py`
      - Christchurch events / attractions spiders (`chch_whatson.py`, etc.).

- **ETL / Analysis Scripts** – `scraper/scripts/`
  - `analyze_deals.py`, `analyze_deals_v2.py`
  - `dedupe.py`
  - `normalize.py`
  - `validate.py`
  - `ensure_price_field.py`
  - `fx_apply.py` (applies FX rates to normalise prices to NZD)
  - These scripts:
    - Combine and normalise scraped data.
    - Deduplicate offers.
    - Ensure pricing fields are present and consistent.
    - Write consolidated outputs such as:
      - `public/data/packages.final.jsonl`
      - `public/reports/deals-openai/...`

- **Dependencies**
  - Defined in `scraper/requirements.txt`.

### 4.2 GitHub Actions Workflows

**Directory:** `.github/workflows/`

- `scrape.yml`
  - Nightly or on-demand Scrapy runs.
  - Executes spiders (optionally filtered via workflow inputs).
  - Commits updated output data to the repository (e.g. JSONL files under `public/`).

- `analyze-deals.yml`
  - Runs analysis scripts on the scraped data.
  - Produces processed deal sets and reports that can be consumed by the frontend or by OpenAI-based tooling.

- `openai.yml`
  - Orchestrates OpenAI-powered analysis or summarisation workflows on scraped data.
  - Intended for generating upgraded copy, insights, or structured summaries that can be used on the marketing pages.

---

## 5. How This Supports the Long-Term Vision

The long-term goal is to make TravelScout a **one-stop NZ itinerary builder and booking hub**, integrating:

- Events & attractions
- Hotels & other accommodation
- Campervans and other transport
- Packaged deals from agencies and OTAs

The current architecture already supports this direction:

1. **Trip Model (`TripWithDetails`)**
   - `Trip`, `TripDay`, and `Activity` allow attaching structured bookings and activities to each day of an itinerary.

2. **Product / Offer Model (`ProductOffer` & `Package`)**
   - `ProductOffer` is a flexible shape for cruises, packages, etc.
   - `Package` (from the scraper) is a concrete implementation sourced from multiple NZ/AU providers.
   - These can be extended with `kind` fields (e.g. `"hotel"`, `"campervan"`, `"activity"`, `"event"`).

3. **Data Pipeline**
   - Scraper + ETL scripts + GitHub Actions keep `packages.final.jsonl` and reports fresh.
   - This can be extended with spiders for events, attractions, campervans, and hotels.

4. **Next Steps (High-Level)**
   - Wire `TripPlanner` to `/api/trips` to persist itineraries.
   - Add a “My Trips” dashboard that reads from `/api/trips`.
   - Replace static deals and product tables with live data from `/api/packages` and future `/api/offers`.
   - Attach offers (`Package` or `ProductOffer`) to `TripDay.activities` to represent actual bookings in the itinerary.

This document should give enough context for anyone new to the project to understand how the pieces fit together and where to extend the system for new itinerary and booking features.
