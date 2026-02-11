# Viator API Rate Limits

## Observed Rate Limits

Based on actual API responses, here are the rate limits we've observed:

| Endpoint | Limit | Remaining (after test) | Reset Time |
|----------|-------|------------------------|------------|
| `/products/search` | 289 | 288 | 10s |
| `/products/tags` | 150 | 149 | 10s |
| `/destinations` | 1 | 0 | 10s |

## Rate Limit Period

The `ratelimit-reset: 10s` header indicates that the rate limit window **resets in 10 seconds** from the time of the response.

### Interpretation

The "10s" reset time suggests one of two rate limiting models:

1. **Rolling Window (10 seconds)**
   - A sliding 10-second window
   - Your request count is tracked over the last 10 seconds
   - As time passes, older requests fall out of the window
   - Most likely interpretation

2. **Fixed Window (10 seconds)**
   - Fixed 10-second periods (e.g., 0-10s, 10-20s, 20-30s)
   - Limit resets at the start of each new period
   - Less common but possible

### What This Means

- **`ratelimit-reset: 10s`** = The current window expires/resets in 10 seconds
- If you make a request at time `T`, the window resets at `T + 10 seconds`
- The limit applies to requests within that window

## Practical Implications

### For `/products/search` (289 requests)
- **Very generous** - 289 requests per 10-second window
- **~29 requests per second** average
- Unlikely to hit this limit in normal usage

### For `/products/tags` (150 requests)
- **Generous** - 150 requests per 10-second window
- **~15 requests per second** average
- Should cache tags (they change infrequently)

### For `/destinations` (1 request)
- **Very restrictive** - Only 1 request per 10-second window
- **Must cache** this data
- Cache for at least 1 hour (destinations rarely change)

## Recommendations

1. **Cache Destinations** - Only 1 request per 10 seconds, so cache for at least 1 hour
2. **Cache Tags** - 150 requests is generous, but tags change infrequently - cache for 24 hours
3. **Product Searches** - 289 requests is very generous, but still implement caching (1 hour) to reduce API calls

## Rate Limit Headers

The API returns these headers:
- `ratelimit-limit`: Maximum requests allowed in the window
- `ratelimit-remaining`: Requests remaining in current window
- `ratelimit-reset`: Time until window resets (in seconds)

## Example

```
ratelimit-limit: 289
ratelimit-remaining: 288
ratelimit-reset: 10s
```

This means:
- You can make 289 requests in a 10-second window
- You have 288 requests remaining
- The window resets in 10 seconds

## Handling Rate Limits

If you exceed the rate limit, you'll receive a `429 Too Many Requests` response. The implementation should:

1. Check `ratelimit-remaining` before making requests
2. Implement exponential backoff if rate limited
3. Cache responses to reduce API calls
4. Monitor rate limit headers in production

## Note

The exact period duration (10 seconds) is inferred from the `ratelimit-reset` header. For official documentation, refer to:
- [Viator Partner API Documentation](https://docs.viator.com/partner-api/technical/)
- Contact Viator support: affiliateapi@tripadvisor.com
