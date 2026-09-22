/**
 * Basic client for Ticketmaster Discovery API v2.
 *
 * This module is server-only and should be used from API routes or other
 * server-side code. It returns the raw Ticketmaster events so that callers
 * can decide how to normalise/transform them.
 */

const TICKETMASTER_API_BASE = "https://app.ticketmaster.com/discovery/v2";

export type TicketmasterSearchParams = {
  lat: number;
  lng: number;
  radiusKm?: number;
  startDate?: string; // YYYY-MM-DD (local)
  endDate?: string; // YYYY-MM-DD (local)
  keyword?: string | null;
};

export type TicketmasterEventSearchResult = {
  events: any[];
  total: number;
  raw: any;
};

function getApiKey(): string {
  const key = process.env.TICKETMASTER_CONSUMER_KEY;

  if (!key) {
    throw new Error(
      "Ticketmaster API key not configured. Please set TICKETMASTER_CONSUMER_KEY in your environment."
    );
  }

  return key;
}

/**
 * Convert a YYYY-MM-DD date into the ISO8601 format Ticketmaster expects.
 * We use UTC midnight boundaries to keep things simple.
 */
function toTicketmasterDateTime(date: string, endOfDay = false): string {
  const suffix = endOfDay ? "T23:59:59Z" : "T00:00:00Z";
  return `${date}${suffix}`;
}

/**
 * Search Ticketmaster Discovery API for events near a point and (optionally) within a date range.
 */
export async function searchTicketmasterEvents(
  params: TicketmasterSearchParams
): Promise<TicketmasterEventSearchResult> {
  const apiKey = getApiKey();
  const { lat, lng, radiusKm = 30, startDate, endDate, keyword } = params;

  const url = new URL(`${TICKETMASTER_API_BASE}/events.json`);

  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("latlong", `${lat},${lng}`);
  url.searchParams.set("radius", radiusKm.toString());
  url.searchParams.set("unit", "km");

  if (startDate) {
    url.searchParams.set("startDateTime", toTicketmasterDateTime(startDate));
  }

  if (endDate) {
    url.searchParams.set(
      "endDateTime",
      toTicketmasterDateTime(endDate, true)
    );
  }

  if (keyword) {
    url.searchParams.set("keyword", keyword);
  }

  // We keep the page size modest; the frontend already paginates via rows/offset for Eventfinda.
  // You can revisit this once we have more concrete performance data.
  url.searchParams.set("size", "50");

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Ticketmaster API error ${response.status}: ${text || response.statusText}`
    );
  }

  const data = await response.json();
  const events = data?._embedded?.events ?? [];
  const total = data?.page?.totalElements ?? events.length ?? 0;

  return {
    events,
    total,
    raw: data,
  };
}

