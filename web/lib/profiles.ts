import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

export type ProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  /** Platform admin (Chunk 9). Not selected by default; see permissions.ts. */
  is_platform_admin?: boolean;
};

function displayNameFromUser(user: User): string | null {
  const metaName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    null;
  const trimmed = metaName?.trim();
  return trimmed || null;
}

/**
 * Load the user's profile row, creating one if the auth trigger never wrote it.
 * Uses maybeSingle() so a missing row does not throw PGRST116
 * ("cannot coerce the result to a single JSON object").
 */
export async function ensureUserProfile(user: User): Promise<ProfileRow> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,display_name")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (data) {
    return data as ProfileRow;
  }

  const insertPayload = {
    id: user.id,
    email: user.email ?? null,
    display_name: displayNameFromUser(user),
  };

  const { data: created, error: insertError } = await supabase
    .from("profiles")
    .upsert(insertPayload, { onConflict: "id" })
    .select("id,email,display_name")
    .maybeSingle();

  if (insertError) {
    throw new Error(insertError.message);
  }

  if (created) {
    return created as ProfileRow;
  }

  // Fallback if select after upsert is empty (RLS timing) — return local shape.
  return insertPayload;
}
