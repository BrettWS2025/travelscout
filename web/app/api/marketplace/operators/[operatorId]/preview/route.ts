/**
 * GET /api/marketplace/operators/:operatorId/preview
 * Public-shaped operator page data for Settings → Business profile Preview (Chunk 38).
 * Requires settings.profile.read (staff may preview).
 * Payload matches security S8 `marketplace.operators_public` /
 * `serializeOperatorPreview` (no internal PII / tax IDs). Anon PostgREST
 * must use that view, not the base `operators` table.
 */

import { badRequest, unauthorized } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import {
  getOperatorPreview,
  serializeOperatorPreview,
} from "@/lib/marketplace/operator-profile";
import { requirePermission } from "@/lib/marketplace/permissions";

export const runtime = "nodejs";

type Params = { params: { operatorId: string } };

export async function GET(req: Request, { params }: Params) {
  try {
    const operatorId = params.operatorId;
    if (!operatorId) return badRequest("operatorId is required.");

    const auth = await requirePermission(
      req,
      operatorId,
      "settings.profile.read"
    );
    if (!auth.ok) return auth.response;

    const operator = getOperatorPreview(getDealDraftHttpStore(), operatorId);
    return Response.json({
      preview: serializeOperatorPreview(operator),
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to load operator preview.");
  }
}
