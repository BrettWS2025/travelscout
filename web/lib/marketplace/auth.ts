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

  // Cookie path: verify JWT with Auth via getUser() — never trust getSession().user alone
  try {
    const supabase = createServerClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) {
      return { user: null };
    }
    // Access token is only returned after Auth verified the user (RLS-aware clients need it)
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return {
      user,
      accessToken: session?.access_token,
    };
  } catch {
    return { user: null };
  }
}

export function unauthorized(message = "Authentication required.") {
  return Response.json({ error: message }, { status: 401 });
}

export function forbidden(message = "Forbidden.") {
  return Response.json({ error: message }, { status: 403 });
}

export function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

export function notFound(message = "Not found.") {
  return Response.json({ error: message }, { status: 404 });
}

export function serverError(context: string, err: unknown) {
  console.error(context, err);
  const detail = err instanceof Error ? err.message : "Unknown error";
  // Prefer the underlying detail so clients (and operators) see the real cause.
  return Response.json(
    {
      error: detail && detail !== context ? detail : context,
      message: detail,
      context,
    },
    { status: 500 }
  );
}
