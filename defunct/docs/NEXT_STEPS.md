# Next Steps: Testing and Deployment

## Step 1: Update API for Anonymous Users

### 1.1 Modify GET endpoint to allow anonymous access

**File:** `app/api/trips/route.ts`

Change the GET handler to return empty array for anonymous users:

```typescript
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    const user = await getServerUser(authHeader || undefined);

    // Allow anonymous users - return empty array
    // They can build itineraries client-side without API calls
    if (!user) {
      return NextResponse.json({ trips: [] });
    }

    const trips = await getTripsForUser(user.id);
    return NextResponse.json({ trips });
  } catch (err) {
    console.error("Error in GET /api/trips:", err);
    const errorMessage =
      err instanceof Error ? err.message : "Failed to fetch trips.";
    return NextResponse.json(
      { error: "Failed to fetch trips.", message: errorMessage },
      { status: 500 }
    );
  }
}
```

### 1.2 Keep POST requiring authentication

POST endpoint is already correct - it requires authentication. No changes needed.

### 1.3 Update tests

**File:** `app/api/__tests__/trips.test.ts`

Add test for anonymous GET:

```typescript
it('should return empty array for anonymous users', async () => {
  mockGetServerUser.mockResolvedValue(null);

  const request = new Request('http://localhost/api/trips');
  const response = await GET(request);
  
  expect(response.status).toBe(200);
  const text = await response.text();
  const data = JSON.parse(text);
  expect(data.trips).toEqual([]);
});
```

## Step 2: Test with Real Supabase

### 2.1 Set up Supabase project

1. Go to [supabase.com](https://supabase.com)
2. Create a new project (or use existing)
3. Get your project URL and anon key:
   - Project Settings → API
   - Copy "Project URL" and "anon public" key

### 2.2 Set environment variables

Create/update `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 2.3 Run migrations

If you haven't already, run the migrations:

```bash
# Using Supabase CLI (if installed)
supabase db push

# Or manually via Supabase Dashboard:
# 1. Go to SQL Editor
# 2. Run each migration file in order:
#    - 20240101000001_profiles.sql
#    - 20240101000002_trips.sql
#    - 20240101000003_trip_days.sql
#    - 20240101000004_activities.sql
```

### 2.4 Test authentication

1. Start your dev server: `npm run dev`
2. Go to your app
3. Try to create an account/login
4. Verify cookies are set (check browser DevTools → Application → Cookies)
5. Test API calls with authenticated user

### 2.5 Test API endpoints

**Test GET (anonymous):**
```bash
curl http://localhost:3000/api/trips
# Should return: {"trips":[]}
```

**Test GET (authenticated):**
```bash
# Get auth token from browser cookies or Supabase
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/trips
# Should return: {"trips":[...]}
```

**Test POST (requires auth):**
```bash
curl -X POST http://localhost:3000/api/trips \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"trip":{"name":"Test Trip","startDate":"2025-01-01","endDate":"2025-01-03","startCityId":"akl","endCityId":"wlg"},"days":[],"activities":[]}'
```

## Step 3: Update Frontend for Anonymous Users

### 3.1 Create draft storage helper

**File:** `lib/trip-planner/draftStorage.ts` (new file)

```typescript
import type { TripWithDetails } from '@/lib/domain';

const DRAFT_KEY = 'travelscout-trip-draft';

export function saveDraftToLocalStorage(trip: TripWithDetails): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(trip));
  } catch (error) {
    console.error('Failed to save draft to localStorage:', error);
  }
}

export function loadDraftFromLocalStorage(): TripWithDetails | null {
  if (typeof window === 'undefined') return null;
  try {
    const draft = localStorage.getItem(DRAFT_KEY);
    return draft ? JSON.parse(draft) : null;
  } catch (error) {
    console.error('Failed to load draft from localStorage:', error);
    return null;
  }
}

export function clearDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch (error) {
    console.error('Failed to clear draft:', error);
  }
}
```

### 3.2 Update TripPlanner to use drafts

**File:** `lib/trip-planner/useTripPlanner.ts`

1. Import draft helpers:
```typescript
import { saveDraftToLocalStorage, loadDraftFromLocalStorage, clearDraft } from './draftStorage';
```

2. Load draft on mount:
```typescript
useEffect(() => {
  const draft = loadDraftFromLocalStorage();
  if (draft) {
    // Restore draft state
    // ... restore your trip state from draft
  }
}, []);
```

3. Save draft on changes:
```typescript
useEffect(() => {
  if (plan && !user) {
    // Save draft when user is not logged in
    const draft: TripWithDetails = {
      trip: {
        id: 'draft-' + Date.now(),
        userId: 'anonymous',
        name: 'Draft Trip',
        // ... other trip fields
      },
      days: plan.days.map(...),
      activities: [],
    };
    saveDraftToLocalStorage(draft);
  }
}, [plan, user]);
```

4. Update save function:
```typescript
async function saveItinerary(title: string, itineraryId?: string) {
  if (!user) {
    // Prompt user to log in
    // You can use a modal or redirect to login page
    return { 
      success: false, 
      error: "Please log in to save your itinerary permanently" 
    };
  }

  // User is logged in - save to API
  // ... existing save logic
}
```

### 3.3 Add "Login to Save" UI

**File:** `components/TripPlanner.tsx` or wherever you show save button

```typescript
{!user && (
  <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-4">
    <p className="text-sm text-yellow-800">
      💡 You're building as a guest. 
      <button 
        onClick={() => router.push('/login')}
        className="underline font-semibold ml-1"
      >
        Log in to save your itinerary
      </button>
    </p>
  </div>
)}
```

## Step 4: Verify Everything Works

### 4.1 Test anonymous user flow

1. Open app in incognito/private window
2. Build an itinerary (add cities, dates, etc.)
3. Verify:
   - ✅ Can build itinerary without errors
   - ✅ Draft saved to localStorage
   - ✅ Can refresh page and draft persists
   - ✅ "Save" button prompts for login

### 4.2 Test authenticated user flow

1. Log in to app
2. Build an itinerary
3. Click "Save"
4. Verify:
   - ✅ Trip saved to Supabase
   - ✅ Appears in "My Trips" (if you have that page)
   - ✅ Can retrieve via GET /api/trips

### 4.3 Test draft migration

1. Build itinerary as anonymous user
2. Log in
3. Click "Save"
4. Verify:
   - ✅ Draft converted to permanent trip
   - ✅ Draft cleared from localStorage

## Step 5: Deploy

### 5.1 Set production environment variables

In your hosting platform (Vercel, Netlify, etc.):

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 5.2 Deploy

```bash
git add .
git commit -m "Add anonymous user support for trip building"
git push origin main
```

### 5.3 Verify production

1. Test anonymous user flow on production
2. Test authenticated user flow on production
3. Check Supabase dashboard for saved trips

## Troubleshooting

### Issue: "Authentication required" when building as anonymous

**Solution:** Make sure GET endpoint returns empty array for anonymous users (see Step 1.1)

### Issue: Drafts not persisting

**Solution:** 
- Check browser localStorage is enabled
- Check for errors in console
- Verify `saveDraftToLocalStorage` is called

### Issue: Can't save after logging in

**Solution:**
- Check auth token is being sent in API requests
- Verify Supabase RLS policies allow user to insert
- Check browser console for errors

### Issue: RLS policy blocking inserts

**Solution:**
- Verify user is authenticated (check `auth.uid()` in Supabase)
- Check RLS policies in Supabase dashboard
- Test with Supabase SQL editor:

```sql
-- Check if user can insert
SET request.jwt.claim.sub = 'your-user-id';
INSERT INTO trips (user_id, name, start_date, end_date, start_city_id, end_city_id)
VALUES ('your-user-id', 'Test', '2025-01-01', '2025-01-03', 'akl', 'wlg');
```

## Additional Resources

- [Supabase Auth Docs](https://supabase.com/docs/guides/auth)
- [Supabase RLS Docs](https://supabase.com/docs/guides/auth/row-level-security)
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
