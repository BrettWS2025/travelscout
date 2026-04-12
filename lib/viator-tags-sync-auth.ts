import { NextResponse } from "next/server";

/**
 * Application-level auth for `/api/viator/tags/sync`.
 * Set `VIATOR_TAGS_SYNC_SECRET` in the server environment and send either:
 * - `Authorization: Bearer <secret>`
 * - `x-viator-tags-sync-secret: <secret>`
 */
export function requireViatorTagsSyncAuth(req: Request): NextResponse | null {
  const secret = process.env.VIATOR_TAGS_SYNC_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        error: "Server misconfiguration",
        message:
          "VIATOR_TAGS_SYNC_SECRET is not set. Configure it in your deployment environment.",
      },
      { status: 503 }
    );
  }

  const bearer = req.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    ?.trim();
  const custom = req.headers.get("x-viator-tags-sync-secret")?.trim();

  if (bearer === secret || custom === secret) {
    return null;
  }

  return NextResponse.json(
    { error: "Unauthorized" },
    { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="viator-tags-sync"' } }
  );
}
