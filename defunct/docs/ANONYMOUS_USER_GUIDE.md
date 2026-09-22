# Anonymous User Support

## Current Situation

**Before migration:** Users could build itineraries without logging in (data stored in memory on server)

**After migration:** API requires authentication for all operations (GET and POST)

## Problem

Users want to:
- ✅ Build itineraries without logging in
- ✅ Save itineraries permanently (requires login)

## Solution: Two-Tier Approach

### Option 1: Client-Side Drafts (Recommended)

**How it works:**
1. Users build itineraries entirely client-side (in memory or localStorage)
2. No API calls needed while building
3. When user clicks "Save", prompt for login
4. After login, save to Supabase via API

**Pros:**
- ✅ No database changes needed
- ✅ Works offline
- ✅ Simple implementation
- ✅ No anonymous data in database

**Cons:**
- ❌ Drafts lost if user clears browser data
- ❌ Can't sync across devices

**Implementation:**
- Store trip data in `localStorage` or React state
- Only call `/api/trips` when user is authenticated
- Show "Login to save" prompt when anonymous user tries to save

### Option 2: Anonymous Drafts Table

**How it works:**
1. Create a `trip_drafts` table that allows `null` user_id
2. Store drafts with session ID or browser fingerprint
3. When user logs in, migrate drafts to their account

**Pros:**
- ✅ Drafts persist across browser sessions
- ✅ Can sync across devices (with session ID)
- ✅ Better UX

**Cons:**
- ❌ Requires database migration
- ❌ More complex implementation
- ❌ Need cleanup job for orphaned drafts

### Option 3: Allow Anonymous GET, Require Auth for POST

**How it works:**
1. GET `/api/trips` returns empty array for anonymous users
2. POST `/api/trips` requires authentication
3. Frontend stores drafts in localStorage
4. When user logs in, save drafts to API

**Pros:**
- ✅ Minimal code changes
- ✅ No database changes

**Cons:**
- ❌ Still requires localStorage for drafts
- ❌ GET endpoint not useful for anonymous users

## Recommended Implementation: Option 1

This is the simplest and most common pattern. Here's how to implement it:

### Step 1: Update API to Allow Anonymous GET

Modify `app/api/trips/route.ts`:

```typescript
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const user = await getServerUser(authHeader || undefined);

    // Allow anonymous users - return empty array
    if (!user) {
      return NextResponse.json({ trips: [] });
    }

    const trips = await getTripsForUser(user.id);
    return NextResponse.json({ trips });
  } catch (err) {
    // ... error handling
  }
}
```

### Step 2: Keep POST Requiring Auth

POST should still require authentication (no changes needed).

### Step 3: Update Frontend

1. Store drafts in localStorage or React state
2. Only call API when user is authenticated
3. Show login prompt when anonymous user tries to save

### Step 4: Add Draft Persistence Helper

Create `lib/trip-planner/draftStorage.ts`:

```typescript
const DRAFT_KEY = 'travelscout-trip-draft';

export function saveDraftToLocalStorage(trip: TripWithDetails) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DRAFT_KEY, JSON.stringify(trip));
}

export function loadDraftFromLocalStorage(): TripWithDetails | null {
  if (typeof window === 'undefined') return null;
  const draft = localStorage.getItem(DRAFT_KEY);
  return draft ? JSON.parse(draft) : null;
}

export function clearDraft() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(DRAFT_KEY);
}
```

## Next Steps Implementation

See `docs/NEXT_STEPS.md` for detailed implementation instructions.
