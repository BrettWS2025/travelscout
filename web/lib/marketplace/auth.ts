// lib/marketplace/auth.ts
import { createServerClient, getServerUser } from "@/lib/supabase/server";
import { extractAccessToken } from "./db";
import type { User } from "@supabase/supabase-js";

export async function getMarketplaceAuth(req: Request): Promise<{
  user: User | null;
  accessToken?: string;
}> {
  const headerToken = extractAccessToken(req);
  if (headerToken) {
    const user = await getServerUser(headerToken);
    return { user, accessToken: headerToken };
  }

  // Fall back to cookie session so browser clients work without Authorization header
  try {
    const supabase = createServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return {
      user: session?.user ?? null,
      accessToken: session?.access_token,
    };
  } catch {
    return { user: null };
  }
}

export function unauthorized(message = "Authentication required.") {
  return Response.json({ error: message }, { status: 401 });
}

export function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

export function notFound(message = "Not found.") {
  return Response.json({ error: message }, { status: 404 });
}

export function serverError(context: string, err: unknown) {
  console.error(context, err);
  return Response.json(
    {
      error: context,
      message: err instanceof Error ? err.message : "Unknown error",
    },
    { status: 500 }
  );
}
