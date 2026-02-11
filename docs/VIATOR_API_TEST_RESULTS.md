# Viator API Test Results

## Test Date
Initial test run completed - waiting for API key activation (up to 24 hours)

## ✅ Positive Indicators

### 1. Accept Header - **WORKING**
- ✅ API accepted our `Accept: application/json;version=2.0` header
- Response shows: `'content-type': 'application/json;version=2.0'`
- No more "INVALID_HEADER_VALUE" errors

### 2. API Endpoint - **WORKING**
- ✅ Endpoint URL is correct: `https://api.viator.com/partner/products/search`
- ✅ API is processing our requests (getting structured responses)
- ✅ POST method is being accepted

### 3. Request Structure - **WORKING**
- ✅ API is receiving and processing our request body
- ✅ Getting proper error responses with tracking IDs
- ✅ Response format matches expected structure

### 4. Error Handling - **WORKING**
- ✅ Proper error messages with codes: `{"code":"UNAUTHORIZED","message":"Invalid API Key"}`
- ✅ Tracking IDs provided for debugging: `"trackingId":"6535DA0F:..."`

## ⚠️ Current Issue

### API Key Authentication
- ❌ Getting "Invalid API Key" errors (401 UNAUTHORIZED)
- **Expected**: API key may take up to 24 hours to activate
- **Status**: Waiting for activation

## 🔍 Things to Verify After Key Activation

### 1. Request Body Format
Once the key is active, verify the request body parameters match API expectations:
- `lat` / `lng` - Location coordinates
- `radius` - Search radius in kilometers
- `start` / `count` - Pagination
- `sortBy` / `sortOrder` - Sorting options
- `currencyCode` - Currency for pricing

### 2. Response Structure
Check if the actual response matches our TypeScript types:
- Product structure
- Pricing format
- Rating format
- Image URLs
- Destination information

### 3. Required Fields
Some endpoints may require specific fields. Watch for:
- Missing required parameter errors
- Invalid parameter value errors
- Field name mismatches (e.g., `destId` vs `destinationId`)

### 4. Rate Limiting
Monitor for:
- Rate limit errors (429 status)
- Request quota exceeded
- Throttling responses

## 📝 Request Body Being Sent

Current test sends:
```json
{
  "lat": -36.8485,
  "lng": 174.7633,
  "radius": 20,
  "start": 0,
  "count": 5,
  "sortBy": "POPULARITY",
  "currencyCode": "NZD"
}
```

## 🎯 Next Steps

1. **Wait for API key activation** (up to 24 hours)
2. **Re-run test**: `npm run test:viator`
3. **Verify response structure** matches our types
4. **Adjust types if needed** based on actual API responses
5. **Test API route**: `GET /api/viator?lat=-36.8485&lng=174.7633&radius=20`
6. **Integrate into UI** once everything is working

## 🐛 Potential Issues to Watch For

### Parameter Name Mismatches
- API might expect different field names
- Check for camelCase vs snake_case differences
- Verify boolean vs string for some fields

### Missing Required Fields
- Some endpoints may require additional fields
- Check for validation errors in responses

### Response Format Differences
- Actual API response might have different structure
- May need to adjust TypeScript types
- Transform response data if needed

### Authentication Header
- Currently using `exp-api-key` header
- If still failing after activation, try alternative headers:
  - `X-API-Key`
  - `Authorization: Bearer <key>`
  - Check API documentation for exact format

## 📊 Test Output Summary

```
✅ API Key found (loaded from .env.local)
✅ Accept header accepted by API
✅ Endpoint URL correct
✅ Request structure accepted
❌ API Key authentication (waiting for activation)
```

## 🔧 Debugging Tips

If issues persist after key activation:

1. **Check request body**: Add logging to see exact JSON being sent
2. **Verify header format**: Confirm authentication header name
3. **Test with Postman**: Compare working Postman request with our code
4. **Review API docs**: Check for any recent changes to endpoint structure
5. **Check partner type**: Verify which endpoints are available for your access level
