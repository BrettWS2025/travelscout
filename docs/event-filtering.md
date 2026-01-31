# Event Filtering Documentation

This document explains how events are fetched and filtered from the Eventfinda API to show only events that occur on a specific target date.

## Overview

The event filtering system ensures that only events that actually occur on a requested date are displayed, handling:
- Recurring events with multiple sessions
- Single events with date ranges
- Events that span multiple days
- Timezone considerations

## API Query Strategy

### Date Range Query

When fetching events for a specific target date, the system queries a date range to ensure we capture:
1. Events starting on the target date
2. Events that span midnight (start on target date, end next day)

**Query Parameters:**
- `start_date`: The target date itself
- `end_date`: One day after the target date (Eventfinda API's `end_date` is exclusive)

**Example:** For target date `2025-02-13`:
- `start_date`: `2025-02-13`
- `end_date`: `2025-02-14`

### Pagination

The Eventfinda API has a maximum of 20 results per request. The system automatically paginates through all results to fetch complete event lists:

1. Makes initial request with `rows=20` and `offset=0`
2. Checks total count from API response
3. Continues fetching with incremented offsets until all events are retrieved
4. Combines all results before filtering

## Event Transformation

### Session Handling

Events can have multiple sessions (for recurring events) or no sessions (for single events). The system handles both cases:

#### Events WITH Sessions

1. **Session Extraction:**
   - Checks if `event.sessions` exists
   - Handles two possible formats:
     - Direct array: `event.sessions = [session1, session2, ...]`
     - Nested structure: `event.sessions.sessions = [session1, session2, ...]`

2. **Session Matching:**
   - Searches for a session where `datetime_start` matches the target date
   - Excludes cancelled sessions (`is_cancelled = true`)
   - Uses local date extraction to handle timezones correctly

3. **If Matching Session Found:**
   - Uses the session's `datetime_start`, `datetime_end`, and `datetime_summary`
   - Event is marked as having a matching session

4. **If NO Matching Session Found:**
   - Sets `datetime_start` and `datetime_end` to `null`
   - Event is marked as having sessions but no match
   - **This event will be excluded** (see filtering logic below)

#### Events WITHOUT Sessions

- Uses the parent event's `datetime_start`, `datetime_end`, and `datetime_summary`
- Treated as a single event or event series

## Filtering Logic

Events are filtered using session-based exclusion:

### Session-Based Exclusion

**Critical Rule:** If an event has sessions but no matching session was found for the target date, the event is **immediately excluded**, regardless of the parent event's date range.

This prevents recurring events (like weekly markets) from appearing on dates they don't actually occur.

**Example:**
- Event: "Welly Night Market" (Fridays and Saturdays only)
- Has sessions for Feb 13 (Friday) and Feb 14 (Saturday)
- Querying for Feb 12 (Thursday): No matching session → **Excluded**
- Querying for Feb 13 (Friday): Matching session found → **Included**

### Events Without Sessions

For events without sessions, the system relies on the Eventfinda API's date filtering. Events returned by the API (which uses `start_date` and `end_date` parameters) are included without additional date range matching.

**Rationale:** The API's date filtering handles the initial selection, and we trust that events returned are relevant to the queried date range. Session-based filtering provides additional precision for recurring events.

## Filtering Flow Diagram

```
Fetch Events (Paginated)
    ↓
Transform Events
    ↓
    ├─→ Has Sessions?
    │   ├─→ YES → Find Matching Session
    │   │   ├─→ Found? → Use Session Dates → INCLUDE
    │   │   └─→ Not Found? → Set dates to null → EXCLUDE
    │   └─→ NO → Use Parent Event Dates → INCLUDE
    ↓
Filter by Session Matching
    ↓
    ├─→ Has Sessions but No Match? → EXCLUDE
    │
    ├─→ datetime_start is null? → EXCLUDE
    │
    └─→ Otherwise → INCLUDE
    ↓
Return Filtered Events
```

## Examples

### Example 1: Recurring Event with Sessions
**Event:** "Karaoke Night" (Every Thursday)
- Has sessions for: Jan 16, Jan 23, Jan 30, Feb 6, Feb 13, etc.
- Query for Feb 13: ✅ Matching session found → Included
- Query for Feb 12: ❌ No matching session → Excluded

### Example 2: Recurring Event without Sessions
**Event:** "Welly Night Market" (Fridays & Saturdays, Jan 16 - May 30)
- No sessions returned from API
- Query for Feb 5: ✅ Included (relies on API date filtering)
- Query for Jan 16: ✅ Included (relies on API date filtering)

**Note:** Without sessions, the system relies on the Eventfinda API's date filtering. The API's `start_date` and `end_date` parameters determine which events are returned.

### Example 3: Single Multi-Day Event
**Event:** "Music Festival" (Feb 10 - Feb 12)
- No sessions
- Query for Feb 10: ✅ Included (relies on API date filtering)
- Query for Feb 11: ✅ Included (relies on API date filtering)
- Query for Feb 12: ✅ Included (relies on API date filtering)
- Query for Feb 13: ❌ Excluded by API date filtering

## Debug Logging

The system includes debug logging for troubleshooting:

- **Session Detection:** Logs when events with "night market" or "welly" in the name have sessions
- **Exclusion Reasons:** Logs why events are filtered out
- **Inclusion Confirmation:** Logs when events are included with their date information

Check browser console for logs prefixed with `[useEvents]`.

## API Fields Requested

The system requests the following fields from Eventfinda API:

```
event:(
  id,
  name,
  url,
  url_slug,
  description,
  datetime_start,
  datetime_end,
  datetime_summary,
  images,
  location:(id,name,url_slug,address,latitude,longitude),
  category:(id,name,url_slug),
  sessions:(id,datetime_start,datetime_end,datetime_summary,is_cancelled)
)
```

## Key Files

- **`lib/hooks/useEvents.ts`**: Main filtering logic and date matching
- **`app/api/events/route.ts`**: API route that fetches from Eventfinda API
- **`components/trip-planner/EventsAttractionsCarousel.tsx`**: UI component that displays events

## Notes

- Sessions are the authoritative source for recurring event dates when available
- When sessions are not available, the system relies entirely on the Eventfinda API's date filtering
- The API's `start_date` and `end_date` parameters handle the initial event selection
- Session matching provides additional precision for recurring events with session data
