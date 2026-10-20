/**
 * GET/PATCH/DELETE /api/marketplace/operators/:operatorId/templates/:templateId
 * Chunk 25 — get, rename, or delete a DealTemplate.
 * GET: inventory.read; PATCH/DELETE: inventory.write.
 */

import { badRequest, unauthorized } from "@/lib/marketplace/auth";
import {
  dealDraftErrorResponse,
  getDealDraftHttpStore,
} from "@/lib/marketplace/deal-draft-http";
import {
  deleteOperatorTemplate,
  getOperatorTemplate,
  renameOperatorTemplate,
  serializeDealTemplate,
} from "@/lib/marketplace/deal-templates";
import { requirePermission } from "@/lib/marketplace/permissions";

export const runtime = "nodejs";

type Params = { params: { operatorId: string; templateId: string } };

export async function GET(req: Request, { params }: Params) {
  try {
    const { operatorId, templateId } = params;
    if (!operatorId || !templateId) {
      return badRequest("operatorId and templateId are required.");
    }

    const auth = await requirePermission(req, operatorId, "inventory.read");
    if (!auth.ok) return auth.response;

    const template = getOperatorTemplate(
      getDealDraftHttpStore(),
      operatorId,
      templateId
    );
    return Response.json({ template: serializeDealTemplate(template) });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to get template.");
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { operatorId, templateId } = params;
    if (!operatorId || !templateId) {
      return badRequest("operatorId and templateId are required.");
    }

    const auth = await requirePermission(req, operatorId, "inventory.write");
    if (!auth.ok) return auth.response;

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return badRequest("Request body must be JSON.");
    }

    const name =
      typeof body.name === "string"
        ? body.name
        : typeof body.template_name === "string"
          ? body.template_name
          : "";

    const template = renameOperatorTemplate(
      getDealDraftHttpStore(),
      operatorId,
      templateId,
      name
    );
    return Response.json({ template: serializeDealTemplate(template) });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to rename template.");
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const { operatorId, templateId } = params;
    if (!operatorId || !templateId) {
      return badRequest("operatorId and templateId are required.");
    }

    const auth = await requirePermission(req, operatorId, "inventory.write");
    if (!auth.ok) return auth.response;

    deleteOperatorTemplate(
      getDealDraftHttpStore(),
      operatorId,
      templateId
    );
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Authentication required.") {
      return unauthorized();
    }
    return dealDraftErrorResponse(err, "Failed to delete template.");
  }
}
