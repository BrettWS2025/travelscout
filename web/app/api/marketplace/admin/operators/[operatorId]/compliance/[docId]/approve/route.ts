/**
 * POST /api/marketplace/admin/operators/:operatorId/compliance/:docId/approve
 * Platform admin approves a compliance document (Chunk 41).
 */

import { badRequest } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { getMediaStorage } from "@/lib/marketplace/media-storage";
import {
  approveComplianceDocument,
  fileUrlForComplianceDoc,
  serializeComplianceDocument,
} from "@/lib/marketplace/operator-compliance";
import { requirePermission } from "@/lib/marketplace/permissions";

export const runtime = "nodejs";

type Params = { params: { operatorId: string; docId: string } };

export async function POST(req: Request, { params }: Params) {
  try {
    const { operatorId, docId } = params;
    if (!operatorId || !docId) {
      return badRequest("operatorId and docId are required.");
    }

    const auth = await requirePermission(
      req,
      operatorId,
      "admin.compliance.review"
    );
    if (!auth.ok) return auth.response;

    let reviewerNotes: string | null | undefined;
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.toLowerCase().includes("application/json")) {
      try {
        const body = (await req.json()) as Record<string, unknown>;
        if (body.reviewer_notes !== undefined) {
          reviewerNotes =
            body.reviewer_notes === null
              ? null
              : String(body.reviewer_notes);
        } else if (body.notes !== undefined) {
          reviewerNotes =
            body.notes === null ? null : String(body.notes);
        }
      } catch {
        // empty body ok
      }
    }

    const store = getDealDraftHttpStore();
    const storage = getMediaStorage();
    const doc = approveComplianceDocument(store, operatorId, docId, {
      reviewerNotes,
    });

    return Response.json({
      document: serializeComplianceDocument(doc, {
        fileUrl: fileUrlForComplianceDoc(doc, storage),
      }),
    });
  } catch (err) {
    return dealDraftErrorResponse(
      err,
      "Failed to approve compliance document."
    );
  }
}
