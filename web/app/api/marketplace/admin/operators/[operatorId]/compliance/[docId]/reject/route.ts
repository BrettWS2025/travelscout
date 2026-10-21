/**
 * POST /api/marketplace/admin/operators/:operatorId/compliance/:docId/reject
 * Platform admin rejects a compliance document with reviewer_notes (Chunk 41).
 */

import { badRequest } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { getMediaStorage } from "@/lib/marketplace/media-storage";
import {
  fileUrlForComplianceDoc,
  rejectComplianceDocument,
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

    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return badRequest("JSON body with reviewer_notes is required.");
    }

    const notesRaw = body.reviewer_notes ?? body.notes;
    const reviewerNotes =
      notesRaw === null || notesRaw === undefined
        ? null
        : String(notesRaw);

    const store = getDealDraftHttpStore();
    const storage = getMediaStorage();
    const doc = rejectComplianceDocument(store, operatorId, docId, {
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
      "Failed to reject compliance document."
    );
  }
}