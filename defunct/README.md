# Defunct (archived) code

This folder holds code that is **not** part of the current TravelScout web UI.
Nothing under `defunct/` is imported by `web/`.

It is kept so the trip planner and other retired features can be restored or
mined later without cluttering the live app.

## Contents (high level)

| Path | What it was |
|------|-------------|
| `app/(marketing)/trip-planner/` | Trip planner pages + layout |
| `app/account/itineraries/` | Saved itineraries account page |
| `app/api/trips`, `events`, `weather`, `ticketmaster`, `liteapi-hotels`, `google-places-*`, `hello`, `viator/route.ts` | Planner / probe API routes |
| `components/trip-planner/`, `TripPlanner.tsx`, `TripPlannerNavbar.tsx`, `TripMap.tsx`, `WaypointInput.tsx`, `AuthModal.tsx`, `FilterBar.tsx`, `QueryProvider.tsx`, `OperatorDashboard.tsx` | Planner UI + orphan components |
| `lib/trip-planner/`, `itinerary.ts`, `places.ts`, `nzCities.ts`, `nzStops.ts`, `walkingExperiences.ts`, weather/events/hotels/restaurants/viator helpers | Planner domain logic |
| `lib/supabase/trips.ts` | Old trips table client |
| `lib/hooks/` | React Query hooks used only by the planner |
| `lib/domain.ts` | Trip domain types for the old trips API |
| `scripts/` | One-off Eventfinda / Viator / events probe scripts |
| `docs/` | Outdated architecture / Viator / trips notes |
| `public/` | Unused logos, promo images, map markers, scrape reports |
| `data/dumps/` | Ad-hoc API dump files |
| `e2e/trip-planner.spec.ts` | Planner Playwright coverage |
| `types/leaflet-routing-machine.d.ts` | Leaflet routing typings for planner maps |

Paths mirror the old repo layout so restores are mostly `git mv` back into `web/`.

## Restore notes

1. Move routes under `web/app/(marketing)/trip-planner`
2. Optionally re-add `TripPlannerNavbar` in `SiteShell`
3. Restore planner APIs and the `lib/` modules they need
4. Update sitemap / nav / e2e

Supabase tables and SQL functions were **not** deleted; migrations remain in `/supabase`.
