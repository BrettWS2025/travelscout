/**
 * GET /api/marketplace/operators/me
 * Operators the authenticated user belongs to (Chunk 22 editor context).
 *
 * Resolves marketplace.operators + team_members from Supabase, auto-ensures
 * an operator from signup metadata when missing, and hydrates the in-memory
 * inventory store so deal APIs recognise the membership.
 */

import { unauthorized } from "@/lib/marketplace/auth";
import { getMarketplaceAuth } from "@/lib/marketplace/auth";
import {
  ensureOperatorInventory,
  resolveOperatorsForUser,
} from "@/lib/marketplace/operator-bootstrap";
import { isOperatorAccountMetadata } from "@/lib/marketplace/operator-signup";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { user, accessToken } = await getMarketplaceAuth(req);
    if (!user || !accessToken) return unauthorized();

    let operators = await resolveOperatorsForUser(
      accessToken,
      user.id,
      user.email ?? null
    );

    // Real signups: create inventory operator from auth metadata when missing
    // (covers email-confirm + users who only got a legacy organisation).
    if (
      operators.length === 0 &&
      isOperatorAccountMetadata(
        user.user_metadata as Record<string, unknown> | undefined
      )
    ) {
      await ensureOperatorInventory(accessToken, user.id, {
        userMetadata: user.user_metadata as Record<string, unknown>,
        email: user.email ?? null,
      });
      operators = await resolveOperatorsForUser(
        accessToken,
        user.id,
        user.email ?? null
      );
    }

    return Response.json({ operators });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    console.error("Failed to list my operators", err);
    return Response.json(
      { error: "Failed to list operators." },
      { status: 500 }
    );
  }
}
