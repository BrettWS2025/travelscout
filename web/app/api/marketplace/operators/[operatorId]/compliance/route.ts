/**
 * GET|POST /api/marketplace/operators/:operatorId/compliance
 * Chunk 41 — list / create compliance documents (settings.compliance).
 * POST accepts multipart/form-data (file + metadata) or JSON with no file
 * is rejected (file required on create).
 */

import { badRequest, unauthorized } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { getMediaStorage } from "@/lib/marketplace/media-storage";
import {
  createComplianceDocument,
  fileUrlForComplianceDoc,
  listOperatorComplianceDocuments,
  serializeComplianceDocument,
} from "@/lib/marketplace/operator-compliance";
import { requirePermission } from "@/lib/marketplace/permissions";

export const runtime = "nodejs";

type Params = { params: { operatorId: string } };

function formString(form: FormData, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = form.get(key);
    if (typeof v === "string") return v;
  }
  return undefined;
}

export async function GET(req: Request, { params }: Params) {
  try {
    const operatorId = params.operatorId;
    if (!operatorId) return badRequest("operatorId is required.");

    const auth = await requirePermission(
      req,
      operatorId,
      "settings.compliance"
    );
    if (!auth.ok) return auth.response;

    const store = getDealDraftHttpStore();
    const storage = getMediaStorage();
    const docs = listOperatorComplianceDocuments(store, operatorId).map((d) =>
      serializeComplianceDocument(d, {
        fileUrl: fileUrlForComplianceDoc(d, storage),
      })
    );
    return Response.json({ documents: docs });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to list compliance documents.");
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const operatorId = params.operatorId;
    if (!operatorId) return badRequest("operatorId is required.");

    const auth = await requirePermission(
      req,
      operatorId,
      "settings.compliance"
    );
    if (!auth.ok) return auth.response;

    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      return badRequest(
        "Content-Type must be multipart/form-data with a file."
      );
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return badRequest("Could not parse multipart body.");
    }

    let file: File | null = null;
    for (const key of ["file", "document", "upload"]) {
      const value = form.get(key);
      if (value instanceof File && value.size > 0) {
        file = value;
        break;
      }
    }
    if (!file) {
      return badRequest("A file is required (field: file).");
    }

    const body: Record<string, unknown> = {
      doc_type: formString(form, "doc_type", "docType"),
      issuer: formString(form, "issuer"),
      reference_number: formString(form, "reference_number", "referenceNumber"),
      issued_on: formString(form, "issued_on", "issuedOn"),
      expires_on: formString(form, "expires_on", "expiresOn"),
    };

    const store = getDealDraftHttpStore();
    const storage = getMediaStorage();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await createComplianceDocument(
      store,
      operatorId,
      body,
      {
        filename: file.name || "document",
        bytes,
        contentType: file.type || null,
      },
      { storage }
    );

    return Response.json(
      {
        document: serializeComplianceDocument(doc, {
          fileUrl: fileUrlForComplianceDoc(doc, storage),
        }),
      },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to create compliance document.");
  }
}
