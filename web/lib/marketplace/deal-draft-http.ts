/**
 * HTTP helpers for Chunk 12 deal draft routes.
 * Maps domain errors to Response; holds the process-level in-memory store
 * until Supabase persistence is wired in a later chunk.
 */

import {
  badRequest,
  forbidden,
  notFound,
  serverError,
} from "./auth";
import { BookingLinkError } from "./booking-link";
import {
  createDealDraftStore,
  DealDeleteNotAllowedError,
  DealDraftError,
  type DealDraftStore,
} from "./deal-draft";
import { DealPublishError } from "./deal-publish";
import {
  LiveDealConfirmRequiredError,
  MinDiscountError,
} from "./deal-inventory";
import {
  ImportProviderImagesStubError,
  MediaUploadBatchError,
} from "./deal-media-api";
import {
  DealMediaLimitError,
  DealMediaValidationError,
} from "./deal-media";
import { DealNotFoundError } from "./deal-status";
import { DealValidationError } from "./deal";

let processStore: DealDraftStore | null = null;

/** Process-level store for route handlers (replaceable in tests). */
export function getDealDraftHttpStore(): DealDraftStore {
  if (!processStore) {
    processStore = createDealDraftStore();
  }
  return processStore;
}

export function setDealDraftHttpStore(store: DealDraftStore | null): void {
  processStore = store;
}

export function dealDraftErrorResponse(err: unknown, context: string): Response {
  if (err instanceof DealNotFoundError) {
    return notFound("Deal not found.");
  }
  if (err instanceof DealPublishError) {
    return Response.json(
      {
        error: err.message,
        ...(err.checks ? { checks: err.checks } : {}),
        ...(err.validation ? { validation: err.validation } : {}),
      },
      { status: err.status }
    );
  }
  if (err instanceof BookingLinkError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof LiveDealConfirmRequiredError) {
    return Response.json(
      {
        error: err.message,
        needs_confirm: true,
        warnings: err.warnings,
        validation: err.validation,
      },
      { status: 409 }
    );
  }
  if (err instanceof MinDiscountError) {
    return Response.json(
      {
        error: err.message,
        max_deal_price_minor: err.maxDealPriceMinor,
        errors: err.errors ?? [],
      },
      { status: 400 }
    );
  }
  if (err instanceof MediaUploadBatchError) {
    return Response.json(
      {
        error: err.message,
        file_errors: err.fileErrors,
        errors: err.errors ?? [],
      },
      { status: 400 }
    );
  }
  if (err instanceof ImportProviderImagesStubError) {
    return Response.json(
      { error: err.message, deferred: "chunk_32" },
      { status: 501 }
    );
  }
  if (err instanceof DealMediaLimitError || err instanceof DealMediaValidationError) {
    return Response.json(
      {
        error: err.message,
        errors:
          err instanceof DealMediaValidationError
            ? err.errors
            : [{ field: "images", message: err.message }],
      },
      { status: 400 }
    );
  }
  if (err instanceof DealDeleteNotAllowedError) {
    return Response.json({ error: err.message }, { status: 409 });
  }
  if (err instanceof DealDraftError) {
    if (err.status === 403) return forbidden(err.message);
    if (err.status === 404) return notFound(err.message);
    return Response.json(
      { error: err.message, errors: err.errors ?? [] },
      { status: err.status }
    );
  }
  if (err instanceof DealValidationError) {
    return Response.json(
      { error: err.message, errors: err.errors },
      { status: 400 }
    );
  }
  if (err instanceof Error && /required|invalid/i.test(err.message)) {
    return badRequest(err.message);
  }
  return serverError(context, err);
}
