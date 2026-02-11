# Viator API Integration

This document describes the Viator API integration for TravelScout, which allows displaying Viator activities alongside walking experiences.

## Overview

The integration uses the **real-time search model** recommended by Viator for on-demand queries. This approach:
- Doesn't require maintaining a local database
- Fetches products only when needed
- Blends seamlessly with existing walk content

## Architecture

### Components

1. **`lib/viator.ts`** - Viator API client library
   - Handles authentication
   - Provides search methods
   - Manages API requests/responses

2. **`app/api/viator/route.ts`** - Next.js API route
   - Exposes Viator search functionality to frontend
   - Implements caching via Redis
   - Follows the same pattern as `/api/events`

3. **`scripts/test-viator-api.ts`** - Test script
   - Validates API authentication
   - Tests search functionality
   - Helps debug integration issues

## Setup

### Environment Variables

Add to `.env.local`:
```bash
VIATOR_API_KEY=your_api_key_here
```

### Testing

Run the test script to verify the integration:
```bash
npm run test:viator
```

This will test:
1. API authentication
2. Location-based search (Auckland, NZ)
3. Free-text search
4. Single product retrieval

## API Endpoints

### Client Library Methods

#### `searchProducts(params: ViatorSearchParams)`
Search for products by location, text, or filters.

**Example:**
```typescript
const client = createViatorClient();
const results = await client.searchProducts({
  latitude: -36.8485,
  longitude: 174.7633,
  radius: 20,
  count: 20,
  sortBy: "POPULARITY",
  currencyCode: "NZD",
});
```

#### `freeTextSearch(query: string, options?)`
Free-text search for products.

**Example:**
```typescript
const results = await client.freeTextSearch("Auckland tours", {
  latitude: -36.8485,
  longitude: 174.7633,
  radius: 20,
});
```

#### `getProduct(productCode: string)`
Get detailed information about a single product.

#### `getProductAvailability(productCode: string, options?)`
Get availability schedules for a product.

### API Route

**GET `/api/viator`**

Query parameters:
- `lat` - Latitude (optional, for location-based search)
- `lng` - Longitude (optional, for location-based search)
- `radius` - Search radius in kilometers (default: 20, max: 50)
- `destinationId` - Viator destination ID (alternative to lat/lng)
- `q` - Search query string (optional)
- `start` - Pagination offset (default: 0)
- `count` - Number of results (default: 20, max: 500)
- `sortBy` - Sort order: "POPULARITY", "PRICE", "RATING", "DURATION" (default: "POPULARITY")
- `sortOrder` - "ASC" or "DESC" (default: "DESC")
- `currencyCode` - Currency code (default: "NZD")
- `minPrice` - Minimum price filter (optional)
- `maxPrice` - Maximum price filter (optional)

**Example:**
```
GET /api/viator?lat=-36.8485&lng=174.7633&radius=20&count=10&sortBy=POPULARITY
```

**Response:**
```json
{
  "success": true,
  "count": 10,
  "total": 150,
  "hasMore": true,
  "start": 0,
  "requestedCount": 10,
  "products": [
    {
      "productCode": "12345",
      "title": "Auckland City Tour",
      "description": "...",
      "pricing": {
        "fromPrice": 89.99,
        "fromPriceFormatted": "NZ$89.99",
        "currencyCode": "NZD"
      },
      "rating": {
        "averageRating": 4.5,
        "totalReviews": 1234
      },
      ...
    }
  ]
}
```

## Caching

The API route implements Redis caching with a 1-hour TTL to:
- Reduce API calls
- Improve response times
- Respect rate limits

Cache keys are generated from search parameters using SHA-256 hashing.

## Error Handling

The integration includes comprehensive error handling:
- API authentication errors
- Invalid request parameters
- Network errors
- Rate limiting (future enhancement)

Errors are logged with detailed information for debugging.

## Next Steps

1. **Test the API** - Run `npm run test:viator` to verify everything works
2. **Verify Response Format** - Check the actual API response structure matches our types
3. **Adjust Types** - Update TypeScript types based on actual API responses
4. **UI Integration** - Integrate into `ThingsToDoList` component alongside walks
5. **Error Handling** - Add user-friendly error messages in the UI
6. **Loading States** - Implement loading indicators for API calls

## Notes

- The base URL and authentication method may need adjustment based on your actual API key type
- Some endpoints may not be available depending on your partner access level
- Review the [Viator API documentation](https://docs.viator.com/partner-api/technical/) for the latest endpoint specifications

## Troubleshooting

### Authentication Errors
- Verify `VIATOR_API_KEY` is set in `.env.local`
- Check that the API key is valid and active
- Confirm the authentication header format (may be `exp-api-key` or `X-API-Key`)

### No Results
- Verify location coordinates are correct
- Check that the destination has available products
- Try increasing the search radius
- Test with a different location (e.g., major city)

### API Errors
- Check the console logs for detailed error messages
- Verify the endpoint URL is correct for your API version
- Review rate limits and quotas
