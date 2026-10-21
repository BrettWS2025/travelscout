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
import { DealTemplatesError } from "./deal-templates";
import { DealActionsError } from "./deal-actions";
import { DealAttestationError } from "./deal-attestation";
import { DealListError } from "./deal-list";
import { DealPublishError } from "./deal-publish";
import { IntegrationConnectError } from "./integration-connect";
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
import { isUserRole, type UserRole } from "./enums";
import { setMemoryOperatorRoleLookup } from "./permissions";
import { DEV_SEED_USERS, seedDevMarketplace } from "./seed-dev";

let processStore: DealDraftStore | null = null;
let memoryLookupInstalled = false;

function ensureMemoryRoleLookup(): void {
  if (memoryLookupInstalled) return;
  memoryLookupInstalled = true;
  setMemoryOperatorRoleLookup((userId, operatorId, email) => {
    if (!processStore) return null;
    const seedMatch = email
      ? DEV_SEED_USERS.find(
          (u) => u.email.toLowerCase() === email.toLowerCase()
        )
      : undefined;
    const candidateIds = new Set<string>([userId]);
    if (seedMatch) candidateIds.add(seedMatch.userId);

    for (const m of processStore.operators.teamMembers.values()) {
      if (
        m.userId != null &&
        candidateIds.has(m.userId) &&
        m.operatorId === operatorId &&
        m.inviteStatus === "accepted" &&
        isUserRole(m.role)
      ) {
        return m.role as UserRole;
      }
    }
    return null;
  });
}

/**
 * Process-level store for route handlers (replaceable in tests).
 * First access seeds Harbour Kayaks / Bay Cruises so the editor APIs work
 * before Supabase persistence lands.
 */
export function getDealDraftHttpStore(): DealDraftStore {
  ensureMemoryRoleLookup();
  if (!processStore) {
    const seeded = seedDevMarketplace();
    processStore = createDealDraftStore(seeded.store);
    processStore.integrations = new Map(
      seeded.integrations.map((i) => [i.id, i])
    );
    processStore.syncLogs = new Map();
  }
  return processStore;
}

export function setDealDraftHttpStore(store: DealDraftStore | null): void {
  ensureMemoryRoleLookup();
  processStore = store;
}

/** Operators the given user (or matching seed email) belongs to. */
export function listOperatorsForUser(
  userId: string,
  email?: string | null
): Array<{
  id: string;
  tradingName: string;
  slug: string;
  role: UserRole;
  timezone: string;
  currency: string;
}> {
  const store = getDealDraftHttpStore();
  const seedMatch = email
    ? DEV_SEED_USERS.find((u) => u.email.toLowerCase() === email.toLowerCase())
    : undefined;
  const candidateIds = new Set<string>([userId]);
  if (seedMatch) candidateIds.add(seedMatch.userId);

  const out: Array<{
    id: string;
    tradingName: string;
    slug: string;
    role: UserRole;
    timezone: string;
    currency: string;
  }> = [];

  for (const m of store.operators.teamMembers.values()) {
    if (
      m.userId == null ||
      !candidateIds.has(m.userId) ||
      m.inviteStatus !== "accepted" ||
      !isUserRole(m.role)
    ) {
      continue;
    }
    const op = store.operators.operators.get(m.operatorId);
    if (!op) continue;
    out.push({
      id: op.id,
      tradingName: op.tradingName,
      slug: op.slug,
      role: m.role,
      timezone: op.timezone,
      currency: op.currency,
    });
  }
  return out;
}

export function dealDraftErrorResponse(err: unknown, context: string): Response {
  if (err instanceof DealNotFoundError) {
    return notFound("Deal not found.");
  }
  if (
    err instanceof DealPublishError ||
    err instanceof DealActionsError ||
    err instanceof DealAttestationError
  ) {
    return Response.json(
      {
        error: err.message,
        ...(err.checks ? { checks: err.checks } : {}),
        ...(err.validation ? { validation: err.validation } : {}),
      },
      { status: err.status }
    );
  }
  if (err instanceof DealListError) {
    return Response.json({ error: err.message }, { status: err.status });
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
  if (err instanceof IntegrationConnectError) {
    if (err.status === 403) return forbidden(err.message);
    if (err.status === 404) return notFound(err.message);
    return Response.json(
      {
        error: err.message,
        ...(err.code ? { code: err.code } : {}),
      },
      { status: err.status }
    );
  }
  if (err instanceof DealDraftError || err instanceof DealTemplatesError) {
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
