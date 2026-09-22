/**
 * Viator tag metadata shape varies (camelCase vs snake_case). Normalize reads.
 */

export function parseTagMetadata(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string") {
    try {
      const o = JSON.parse(raw) as unknown;
      if (typeof o === "object" && o !== null && !Array.isArray(o)) {
        return o as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

export function parentTagIdsFromMetadata(meta: Record<string, unknown> | null): number[] {
  if (!meta) return [];
  const raw =
    meta.parentTagIds ?? meta.parent_tag_ids ?? meta.ParentTagIds;
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const id of raw) {
    const num = typeof id === "string" ? parseInt(id, 10) : Number(id);
    if (!Number.isNaN(num) && num > 0) out.push(num);
  }
  return out;
}
