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

/**
 * Security S17: raw Error.message / stacks stay in server logs only when
 * NODE_ENV=production. Development and test may still return details.
 */
export function exposesErrorDetailsToClient(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.NODE_ENV !== "production";
}

export type PublicServerErrorBody = {
  error: string;
  code: "internal_error";
  message?: string;
  context?: string;
  stack?: string;
};

/**
 * Stable client body for unexpected 500s. Always log `err` before calling.
 * Pass `includeStack: true` only for local debug surfaces (never production).
 */
export function publicServerErrorBody(
  context: string,
  err: unknown,
  options: {
    env?: NodeJS.ProcessEnv;
    includeStack?: boolean;
  } = {}
): PublicServerErrorBody {
  const env = options.env ?? process.env;
  if (!exposesErrorDetailsToClient(env)) {
    return { error: context, code: "internal_error" };
  }
  const detail =
    err instanceof Error
      ? err.message || "Unknown error"
      : err != null && String(err)
        ? String(err)
        : "Unknown error";
  const body: PublicServerErrorBody = {
    error: detail && detail !== context ? detail : context,
    code: "internal_error",
    message: detail,
    context,
  };
  if (options.includeStack && err instanceof Error && err.stack) {
    body.stack = err.stack;
  }
  return body;
}

export function serverError(
  context: string,
  err: unknown,
  env: NodeJS.ProcessEnv = process.env
) {
  console.error(context, err);
  return Response.json(publicServerErrorBody(context, err, { env }), {
    status: 500,
  });
}
