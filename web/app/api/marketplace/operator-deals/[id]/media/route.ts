/**
 * POST /api/marketplace/operator-deals/:id/media
 * Multi-file image upload (Chunk 14). inventory.write.
 * multipart/form-data field name: `files` (or `file` for a single file).
 * Optional: alt_text (applied to all), alt_texts (JSON array matching file order).
 *
 * GET → list media (inventory.read).
 */

import { badRequest } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
  requirePermissionForDeal,
} from "@/lib/marketplace/deal-draft-http";
import {
  listDealMediaForDeal,
  uploadDealMedia,
  type UploadFileInput,
} from "@/lib/marketplace/deal-media-api";
import { getMediaStorage } from "@/lib/marketplace/media-storage";

export const runtime = "nodejs";

type Params = { params: { id: string } };

export async function GET(req: Request, { params }: Params) {
  try {
    const dealId = params.id;
    if (!dealId) return badRequest("Deal id is required.");

    const auth = await requirePermissionForDeal(req, dealId, "inventory.read");
    if (!auth.ok) return auth.response;

    const media = listDealMediaForDeal(getDealDraftHttpStore(), dealId);
    return Response.json({ media });
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to list media.");
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const dealId = params.id;
    if (!dealId) return badRequest("Deal id is required.");

    const auth = await requirePermissionForDeal(req, dealId, "inventory.write");
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

    const fileEntries: File[] = [];
    for (const key of ["files", "file", "images", "image"]) {
      for (const value of form.getAll(key)) {
        if (value instanceof File && value.size > 0) {
          fileEntries.push(value);
        }
      }
    }
    if (fileEntries.length === 0) {
      return badRequest("At least one file is required (field: files).");
    }

    const sharedAlt = form.get("alt_text") ?? form.get("altText");
    let altTexts: (string | null)[] = [];
    const altTextsRaw = form.get("alt_texts") ?? form.get("altTexts");
    if (typeof altTextsRaw === "string" && altTextsRaw.trim()) {
      try {
        const parsed = JSON.parse(altTextsRaw) as unknown;
        if (Array.isArray(parsed)) {
          altTexts = parsed.map((x) =>
            typeof x === "string" ? x : null
          );
        }
      } catch {
        return badRequest("alt_texts must be a JSON array of strings.");
      }
    }

    const uploads: UploadFileInput[] = [];
    for (let i = 0; i < fileEntries.length; i++) {
      const f = fileEntries[i]!;
      const buf = new Uint8Array(await f.arrayBuffer());
      const altFromArray = altTexts[i];
      const altText =
        altFromArray ??
        (typeof sharedAlt === "string" ? sharedAlt : null);
      uploads.push({
        filename: f.name || `file-${i}`,
        bytes: buf,
        contentType: f.type || null,
        altText,
      });
    }

    const result = await uploadDealMedia(
      getDealDraftHttpStore(),
      dealId,
      uploads,
      {
        actor: { type: "user", id: auth.user.id },
        storage: getMediaStorage(),
      }
    );

    return Response.json({
      media: result.media,
      file_errors: result.errors,
    });
  } catch (err) {
    return dealDraftErrorResponse(err, "Failed to upload media.");
  }
}
