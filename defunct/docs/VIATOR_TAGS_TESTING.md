# Testing Viator Tags Sync Endpoint

## Prerequisites

1. **Apply the database migration:**
   ```bash
   # If using Supabase CLI
   supabase migration up
   
   # Or apply manually via Supabase dashboard:
   # Go to SQL Editor and run the migration file:
   # supabase/migrations/20250216000001_create_viator_tags.sql
   ```

2. **Ensure environment variables are set in `.env.local`:**
   ```env
   VIATOR_API_KEY=your_viator_api_key_here
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   ```

## Method 1: Using curl (Recommended)

1. **Start your dev server:**
   ```bash
   npm run dev
   ```

2. **Call the sync endpoint:**
   ```bash
   # Basic sync
   curl http://localhost:3000/api/viator/tags/sync
   
   # Force sync (even if recently synced)
   curl http://localhost:3000/api/viator/tags/sync?force=true
   ```

3. **Check the response:**
   The response should look like:
   ```json
   {
     "success": true,
     "totalTags": 150,
     "successCount": 150,
     "errorCount": 0,
     "message": "Synced 150 tags successfully"
   }
   ```

## Method 2: Using Browser

1. **Start your dev server:**
   ```bash
   npm run dev
   ```

2. **Open in browser:**
   ```
   http://localhost:3000/api/viator/tags/sync
   ```
   
   Or with force flag:
   ```
   http://localhost:3000/api/viator/tags/sync?force=true
   ```

3. **View the JSON response** in the browser

## Method 3: Using PowerShell (Windows)

```powershell
# Basic sync
Invoke-WebRequest -Uri "http://localhost:3000/api/viator/tags/sync" | Select-Object -ExpandProperty Content

# Force sync
Invoke-WebRequest -Uri "http://localhost:3000/api/viator/tags/sync?force=true" | Select-Object -ExpandProperty Content

# Pretty print JSON
Invoke-WebRequest -Uri "http://localhost:3000/api/viator/tags/sync" | Select-Object -ExpandProperty Content | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

## Method 4: Using a Test Script

Create a simple test script or use the existing test script:

```bash
# Test the tags endpoint structure first
npx tsx scripts/test-viator-tags.ts

# Then sync (requires dev server running)
curl http://localhost:3000/api/viator/tags/sync
```

## Verifying Tags Were Synced

### Option 1: Check via API

```bash
# Fetch all tags
curl http://localhost:3000/api/viator/tags

# Should return JSON with tags array
```

### Option 2: Check Database Directly

1. **Via Supabase Dashboard:**
   - Go to Table Editor
   - Select `viator_tags` table
   - View the synced tags

2. **Via SQL:**
   ```sql
   SELECT COUNT(*) FROM viator_tags;
   SELECT * FROM viator_tags ORDER BY tag_name LIMIT 20;
   ```

### Option 3: Check in Application

1. Navigate to the Trip Planner
2. Select a location that has Viator products
3. Look for the "Filter by Tags" section in the Things to do list
4. You should see tag buttons if tags were synced successfully

## Troubleshooting

### Error: "Viator API key not configured"
- Make sure `VIATOR_API_KEY` is set in `.env.local`
- Restart your dev server after adding environment variables

### Error: "Supabase credentials not configured"
- Make sure both `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set
- Restart your dev server

### Error: "No tags found in Viator API response"
- The Viator API might have changed its response structure
- Check the server logs for the actual response structure
- You may need to update the parsing logic in `app/api/viator/tags/sync/route.ts`

### Tags not showing in UI
- Make sure tags were synced successfully (check database)
- Make sure you're viewing a location with Viator products
- Check browser console for any errors

## Expected Behavior

1. **First sync:** Should fetch all tags from Viator API and insert them into the database
2. **Subsequent syncs:** Should update existing tags and add any new ones
3. **Response time:** May take 10-30 seconds depending on number of tags
4. **Tag count:** Typically 100-500 tags depending on Viator's catalog

## Next Steps

After successful sync:
1. Tags will be available for filtering in the Things to do component
2. The weekly scheduled workflow will keep tags updated automatically
3. You can manually trigger sync anytime via the endpoint
