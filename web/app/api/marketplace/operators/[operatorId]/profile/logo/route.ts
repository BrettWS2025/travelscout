/**
 * POST /api/marketplace/operators/:operatorId/profile/logo
 * Logo upload via media pipeline (Chunk 38). settings.profile.write.
 * multipart/form-data field: file | logo | image
 */

import { badRequest, unauthorized } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import { getMediaStorage } from "@/lib/marketplace/media-storage";
import {
  serializeOperator,
  uploadOperatorProfileImage,
} from "@/lib/marketplace/operator-profile";
import { requirePermission } from "@/lib/marketplace/permissions";

export const runtime = "nodejs";

type Params = { params: { operatorId: string } };

export async function POST(req: Request, { params }: Params) {
  try {
    const operatorId = params.operatorId;
    if (!operatorId) return badRequest("operatorId is required.");

    const auth = await requirePermission(
      req,
      operatorId,
      "settings.profile.write"
    );
    if (!auth.ok) return auth.response;

    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      return badRequest("Content-Type must be multipart/form-data.");
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return badRequest("Could not parse multipart body.");
    }

    let file: File | null = null;
    for (const key of ["file", "logo", "image"]) {
      const value = form.get(key);
      if (value instanceof File && value.size > 0) {
        file = value;
        break;
      }
    }
    if (!file) {
      return badRequest("A file is required (field: file).");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const operator = await uploadOperatorProfileImage(
      getDealDraftHttpStore(),
      operatorId,
      "logo",
      {
        filename: file.name || "logo",
        bytes,
        contentType: file.type || null,
      },
      { storage: getMediaStorage() }
    );

    return Response.json({ operator: serializeOperator(operator) });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to upload logo.");
  }
}
