# Viator API Debugging Notes

## Current Status

✅ **Working:**
- API key authentication (key is active)
- Accept header format (`application/json;version=2.0`)
- Accept-Language header (`en-US`)
- Currency field (`currency` not `currencyCode`)
- API is responding with proper error messages

❌ **Issues:**
- `/products/search` endpoint requires `destId` (destination ID) - cannot use just coordinates
- `/search/freetext` endpoint requires `searchType` in correct format
- Both endpoints seem to require specific filtering criteria

## Error Messages Encountered

1. **"Missing destination"** - `/products/search` requires `destId`
2. **"Missing filtering"** - Endpoint requires filtering criteria
3. **"At least one valid searchType, ATTRACTIONS/DESTINATIONS/PRODUCTS, is required"** - Free-text search needs proper searchType format

## Next Steps

### Option 1: Get Destination ID First
The API has a `/destinations` endpoint that can be used to:
1. Get list of destinations
2. Find destination ID for a location (e.g., Auckland)
3. Use that destination ID in `/products/search`

### Option 2: Use Different Endpoint
- Try `/search/freetext` with proper `searchType` format (maybe array?)
- Or use a different search endpoint if available

### Option 3: Check API Documentation
- Review exact request format in Viator API docs
- Check if coordinates can be used in filtering object
- Verify searchType format for free-text search

## Request Bodies Tried

### /products/search
```json
{
  "searchQuery": "Auckland",
  "start": 0,
  "count": 5,
  "sortBy": "POPULARITY",
  "currency": "NZD"
}
```
**Error:** "Missing filtering"

### /search/freetext
```json
{
  "searchTerm": "Auckland tours",
  "start": 0,
  "count": 3,
  "currency": "NZD",
  "searchType": "PRODUCTS",
  "lat": -36.8485,
  "lng": 174.7633,
  "radius": 20
}
```
**Error:** "At least one valid searchType, ATTRACTIONS/DESTINATIONS/PRODUCTS, is required"

## Recommendations

1. **Add `/destinations` endpoint** to get destination IDs
2. **Map location names to destination IDs** (cache this)
3. **Use destination IDs** for product searches
4. **Or investigate** if there's a way to search by coordinates directly

## Rate Limits Observed

- `/products/search`: 289 requests per limit period
- `/search/freetext`: 150 requests per limit period
- Reset time: 10 seconds
