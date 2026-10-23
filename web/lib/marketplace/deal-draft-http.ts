/**
 * HTTP helpers for Chunk 12 deal draft routes.
 * Maps domain errors to Response; holds the process-level in-memory store
 * until Supabase persistence is wired in a later chunk.
 */

import {
  badRequest,
  forbidden,
  getMarketplaceAuth,
  notFound,
  serverError,
  unauthorized,
} from "./auth";
import {
  BookingLinkError,
  setNotifyBookingLinkBroken,
} from "./booking-link";
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
import { IntegrationSyncError } from "./integration-sync";
import {
  LiveDealConfirmRequiredError,
  MinDiscountError,
} from "./deal-inventory";
import {
  ImportProviderImagesStubError,
  MediaUploadBatchError,
} from "./deal-media-api";
import { IntegratedDealError } from "./deal-integrated";
import { DealBookNowError } from "./deal-book-now";
import {
  DealMediaLimitError,
  DealMediaValidationError,
} from "./deal-media";
import { DealNotFoundError } from "./deal-status";
import { setNotifyDealLifecycle } from "./deal-status-ticker";
import { DealValidationError } from "./deal";
import { isUserRole, type UserRole } from "./enums";
import { OperatorValidationError } from "./operators";
import {
  requirePermission,
  setMemoryOperatorRoleLookup,
  type PermissionAction,
  type RequirePermissionOk,
  type RequirePermissionOptions,
  type RequirePermissionResult,
} from "./permissions";
import {
  NotificationError,
  notifyBookingLinkBroken,
  notifyDealLifecycle,
  seedNotificationPreferences,
} from "./notifications";
import { DEV_SEED_USERS, seedDevMarketplace } from "./seed-dev";
import {
  TeamError,
  setLastActiveTouchHandler,
  touchTeamMemberLastActive,
} from "./team";
import { ComplianceError } from "./operator-compliance";
import { AccountError } from "./account";
import { BillingError, seedBillingAccounts } from "./billing";
import { DealRulesError } from "./deal-rules";
import { DealMetricsError } from "./deal-metrics";

/** Wire Chunk 39 notify into modules that must stay client-safe. */
let notificationHooksInstalled = false;
function ensureNotificationHooks(): void {
  if (notificationHooksInstalled) return;
  notificationHooksInstalled = true;
  setNotifyBookingLinkBroken(async (store, payload) => {
    await notifyBookingLinkBroken(store, payload);
  });
  setNotifyDealLifecycle(async (store, payload) => {
    await notifyDealLifecycle(store, payload);
  });
}

let processStore: DealDraftStore | null = null;
let memoryLookupInstalled = false;
let lastActiveHookInstalled = false;

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

/** Chunk 40: throttled last_active_at updates via requirePermission. */
function ensureLastActiveHook(): void {
  if (lastActiveHookInstalled) return;
  lastActiveHookInstalled = true;
  setLastActiveTouchHandler((operatorId, userId) => {
    if (!processStore) return;
    touchTeamMemberLastActive(processStore, operatorId, userId);
  });
}

/**
 * Process-level store for route handlers (replaceable in tests).
 * First access seeds Harbour Kayaks / Bay Cruises so the editor APIs work
 * before Supabase persistence lands.
 */
export function getDealDraftHttpStore(): DealDraftStore {
  ensureMemoryRoleLookup();
  ensureNotificationHooks();
  ensureLastActiveHook();
  if (!processStore) {
    const seeded = seedDevMarketplace();
    processStore = createDealDraftStore(seeded.store);
    processStore.integrations = new Map(
      seeded.integrations.map((i) => [i.id, i])
    );
    processStore.syncLogs = new Map();
    processStore.externalProducts = new Map();
    processStore.externalSessions = new Map();
    processStore.integrationPollState = new Map();
    processStore.teamInviteTokens = new Map();
    processStore.billingAccounts = new Map();
    seedBillingAccounts(processStore, seeded.billingAccounts);
    seedNotificationPreferences(
      processStore,
      seeded.notificationPreferences
    );
  }
  return processStore;
}

export function setDealDraftHttpStore(store: DealDraftStore | null): void {
  ensureMemoryRoleLookup();
  ensureNotificationHooks();
  ensureLastActiveHook();
  processStore = store;
}

export type RequirePermissionForDealOk = RequirePermissionOk & {
  operatorId: string;
};

export type RequirePermissionForDealResult =
  | RequirePermissionForDealOk
  | { ok: false; response: Response };

/**
 * Security S19: auth before deal existence on operator/admin deal-id routes.
 *
 * Unauthenticated callers always get 401 whether the deal id exists or not
 * (no existence oracle). Authenticated callers still get 404 for missing
 * deals and 403 when membership/admin permission fails.
 */
export async function requirePermissionForDeal(
  req: Request,
  dealId: string,
  action: PermissionAction,
  options?: RequirePermissionOptions
): Promise<RequirePermissionForDealResult> {
  const getAuth = options?.getAuth ?? getMarketplaceAuth;
  const { user, accessToken } = await getAuth(req);
  if (!user || !accessToken) {
    return { ok: false, response: unauthorized() };
  }

  const store = getDealDraftHttpStore();
  const deal = store.deals.get(dealId);
  if (!deal) {
    return { ok: false, response: notFound("Deal not found.") };
  }

  const auth: RequirePermissionResult = await requirePermission(
    req,
    deal.operatorId,
    action,
    {
      ...options,
      getAuth: async () => ({ user, accessToken }),
    }
  );
  if (!auth.ok) return auth;

  return { ...auth, operatorId: deal.operatorId };
}

export type ListedOperator = {
  id: string;
  tradingName: string;
  slug: string;
  role: UserRole;
  timezone: string;
  currency: string;
};

/**
 * Operators from the in-memory HTTP store only (seed + hydrated rows).
 * Prefer `resolveOperatorsForUser` in operator-bootstrap for live requests.
 */
export function listOperatorsForUserFromMemory(
  userId: string,
  email?: string | null
): ListedOperator[] {
  const store = getDealDraftHttpStore();
  const seedMatch = email
    ? DEV_SEED_USERS.find((u) => u.email.toLowerCase() === email.toLowerCase())
    : undefined;
  const candidateIds = new Set<string>([userId]);
  if (seedMatch) candidateIds.add(seedMatch.userId);

  const out: ListedOperator[] = [];

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

/** @deprecated Prefer listOperatorsForUserFromMemory / resolveOperatorsForUser */
export function listOperatorsForUser(
  userId: string,
  email?: string | null
): ListedOperator[] {
  return listOperatorsForUserFromMemory(userId, email);
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
  if (
    err instanceof LiveDealConfirmRequiredError ||
    (err instanceof Error &&
      err.name === "LiveDealConfirmRequiredError" &&
      "validation" in err &&
      "warnings" in err)
  ) {
    const liveErr = err as LiveDealConfirmRequiredError;
    return Response.json(
      {
        error: liveErr.message,
        needs_confirm: true,
        warnings: liveErr.warnings,
        validation: liveErr.validation,
      },
      { status: 409 }
    );
  }
  if (
    err instanceof MinDiscountError ||
    (err instanceof Error &&
      err.name === "MinDiscountError" &&
      "maxDealPriceMinor" in err)
  ) {
    const minErr = err as MinDiscountError;
    return Response.json(
      {
        error: minErr.message,
        max_deal_price_minor: minErr.maxDealPriceMinor,
        errors: minErr.errors ?? [],
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
  if (
    err instanceof IntegrationConnectError ||
    err instanceof IntegrationSyncError
  ) {
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
  if (err instanceof DealBookNowError) {
    const headers: HeadersInit = {};
    if (err.status === 429 && err.retryAfterSec != null) {
      headers["Retry-After"] = String(err.retryAfterSec);
    }
    return Response.json(
      {
        error: err.message,
        ...(err.code ? { code: err.code } : {}),
      },
      { status: err.status, headers }
    );
  }
  if (err instanceof DealMetricsError) {
    if (err.status === 404) return notFound(err.message);
    return Response.json(
      {
        error: err.message,
        ...(err.code ? { code: err.code } : {}),
      },
      { status: err.status }
    );
  }
  if (
    err instanceof DealDraftError ||
    err instanceof DealTemplatesError ||
    err instanceof IntegratedDealError ||
    err instanceof DealRulesError
  ) {
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
  if (err instanceof OperatorValidationError) {
    return Response.json(
      { error: err.message, errors: err.errors },
      { status: 400 }
    );
  }
  if (err instanceof NotificationError) {
    if (err.status === 403) return forbidden(err.message);
    if (err.status === 404) return notFound(err.message);
    return Response.json(
      { error: err.message, errors: err.errors ?? [] },
      { status: err.status }
    );
  }
  if (err instanceof TeamError) {
    if (err.status === 403) return forbidden(err.message);
    if (err.status === 404) return notFound(err.message);
    return Response.json(
      {
        error: err.message,
        ...(err.code ? { code: err.code } : {}),
        errors: err.errors ?? [],
      },
      { status: err.status }
    );
  }
  if (err instanceof ComplianceError) {
    if (err.status === 403) return forbidden(err.message);
    if (err.status === 404) return notFound(err.message);
    return Response.json(
      {
        error: err.message,
        ...(err.code ? { code: err.code } : {}),
        errors: err.errors ?? [],
      },
      { status: err.status }
    );
  }
  if (err instanceof BillingError || err instanceof AccountError) {
    if (err.status === 403) return forbidden(err.message);
    if (err.status === 404) return notFound(err.message);
    return Response.json(
      {
        error: err.message,
        ...(err.code ? { code: err.code } : {}),
        errors: err.errors ?? [],
      },
      { status: err.status }
    );
  }
  if (err instanceof Error && /required|invalid/i.test(err.message)) {
    return badRequest(err.message);
  }
  return serverError(context, err);
}
