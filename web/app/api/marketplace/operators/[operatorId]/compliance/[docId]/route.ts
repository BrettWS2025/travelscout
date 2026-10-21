/**
 * GET|PATCH|DELETE /api/marketplace/operators/:operatorId/compliance/:docId
 * Chunk 41 — read / update / delete a compliance document.
 * PATCH may be JSON (metadata) or multipart (metadata + optional file replace).
 * Any change resets review_status to pending.
 */

import { badRequest, unauthorized } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { getMediaStorage } from "@/lib/marketplace/media-storage";
import {
  deleteComplianceDocument,
  fileUrlForComplianceDoc,
  getComplianceDocument,
  serializeComplianceDocument,
  updateComplianceDocument,
  type ComplianceUploadFile,
} from "@/lib/marketplace/operator-compliance";
import { requirePermission } from "@/lib/marketplace/permissions";

export const runtime = "nodejs";

type Params = { params: { operatorId: string; docId: string } };

function formString(form: FormData, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = form.get(key);
    if (typeof v === "string") return v;
  }
  return undefined;
}

export async function GET(req: Request, { params }: Params) {
  try {
    const { operatorId, docId } = params;
    if (!operatorId || !docId) return badRequest("operatorId and docId required.");

    const auth = await requirePermission(
      req,
      operatorId,
      "settings.compliance"
    );
    if (!auth.ok) return auth.response;

    const store = getDealDraftHttpStore();
    const storage = getMediaStorage();
    const doc = getComplianceDocument(store, operatorId, docId);
    return Response.json({
      document: serializeComplianceDocument(doc, {
        fileUrl: fileUrlForComplianceDoc(doc, storage),
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to load compliance document.");
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { operatorId, docId } = params;
    if (!operatorId || !docId) return badRequest("operatorId and docId required.");

    const auth = await requirePermission(
      req,
      operatorId,
      "settings.compliance"
    );
    if (!auth.ok) return auth.response;

    const contentType = req.headers.get("content-type") ?? "";
    const isMultipart = contentType
      .toLowerCase()
      .includes("multipart/form-data");

    let body: Record<string, unknown> = {};
    let upload: ComplianceUploadFile | null = null;

    if (isMultipart) {
      let form: FormData;
      try {
        form = await req.formData();
      } catch {
        return badRequest("Could not parse multipart body.");
      }
      body = {
        doc_type: formString(form, "doc_type", "docType"),
        issuer: formString(form, "issuer"),
        reference_number: formString(
          form,
          "reference_number",
          "referenceNumber"
        ),
        issued_on: formString(form, "issued_on", "issuedOn"),
        expires_on: formString(form, "expires_on", "expiresOn"),
      };
      // Drop undefined so we don't clear fields unintentionally
      for (const key of Object.keys(body)) {
        if (body[key] === undefined) delete body[key];
      }
      for (const key of ["file", "document", "upload"]) {
        const value = form.get(key);
        if (value instanceof File && value.size > 0) {
          upload = {
            filename: value.name || "document",
            bytes: new Uint8Array(await value.arrayBuffer()),
            contentType: value.type || null,
          };
          break;
        }
      }
    } else {
      try {
        body = (await req.json()) as Record<string, unknown>;
      } catch {
        return badRequest("Invalid JSON body.");
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return badRequest("Body must be an object.");
      }
    }

    const store = getDealDraftHttpStore();
    const storage = getMediaStorage();
    const doc = await updateComplianceDocument(store, operatorId, docId, body, {
      file: upload,
      storage,
    });

    return Response.json({
      document: serializeComplianceDocument(doc, {
        fileUrl: fileUrlForComplianceDoc(doc, storage),
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to update compliance document.");
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const { operatorId, docId } = params;
    if (!operatorId || !docId) return badRequest("operatorId and docId required.");

    const auth = await requirePermission(
      req,
      operatorId,
      "settings.compliance"
    );
    if (!auth.ok) return auth.response;

    const store = getDealDraftHttpStore();
    await deleteComplianceDocument(store, operatorId, docId, {
      storage: getMediaStorage(),
    });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to delete compliance document.");
  }
}
