/**
 * Client-safe helpers for integrated availability / capacity (Chunk 34).
 *
 * Keep this module free of deal-draft / permissions / supabase server imports
 * so client components (DealEditorSteps) can use it without pulling next/headers.
 */

/** Shown in API responses and editor when capacity_mode is live_provider_capped. */
export const CAPACITY_CAP_NOTE =
  "A cap is display-only unless your promo code has a matching usage limit.";
