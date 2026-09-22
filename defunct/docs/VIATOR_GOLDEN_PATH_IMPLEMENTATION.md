# Viator Golden Path Implementation

## Overview

This implementation follows the Viator "Golden Path" which uses only three essential endpoints:

1. **`/products/search`** - Pulls product summaries based on search criteria
2. **`/destinations`** - Gets details of all destinations
3. **`/products/tags`** - Get details for all tags

## Request Structure

### `/products/search` Endpoint

Based on the official Viator API example, the request structure is:

```json
{
  "filtering": {
    "destination": "391",  // String, not number!
    "tags": [21972, 11930],  // Optional
    "flags": ["FREE_CANCELLATION"],  // Optional
    "lowestPrice": 300,  // Optional
    "highestPrice": 500,  // Optional
    "startDate": "2022-06-20",  // Optional
    "endDate": "2022-06-24"  // Optional
  },
  "sorting": {
    "sort": "POPULARITY",  // POPULARITY, PRICE, RATING, DURATION
    "order": "DESCENDING"  // ASCENDING or DESCENDING
  },
  "pagination": {
    "start": 1,  // 1-based indexing
    "count": 2
  },
  "currency": "USD"
}
```

### Key Points

1. **Destination is required** - Must be provided as a string in `filtering.destination`
2. **1-based pagination** - `start` begins at 1, not 0
3. **Nested structure** - `filtering`, `sorting`, and `pagination` are separate objects
4. **Currency required** - Must be provided at top level

## Implementation Status

✅ **Completed:**
- Request structure matches official example
- Headers configured correctly (Accept, Accept-Language, exp-api-key)
- Destination lookup functionality
- Tags endpoint support
- Proper error handling

⚠️ **Current Issue:**
- API key authentication (401 errors) - may need key refresh or verification

## Usage Example

```typescript
import { createViatorClient } from "@/lib/viator";

const client = createViatorClient();

// 1. Get destinations to find destination IDs
const destinations = await client.getDestinations();
const auckland = destinations.destinations.find(d => d.name === "Auckland");

// 2. Search products by destination ID
const products = await client.searchProducts({
  destinationId: auckland.destinationId, // e.g., 391
  count: 20,
  sortBy: "POPULARITY",
  currencyCode: "NZD",
});

// 3. Get tags for categorization
const tags = await client.getTags();
```

## Next Steps

1. Verify API key is active and correct
2. Test with valid API key to confirm structure works
3. Integrate into UI components
4. Add caching for destinations and tags (they change infrequently)
