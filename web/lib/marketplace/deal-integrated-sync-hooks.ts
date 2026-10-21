/**
 * Chunk 35 — post-sync provider hooks for integrated deals.
 *
 * Called by runSync after product/session upsert and DealSession seat refresh:
 * - Session cancelled/removed (or product archived) → DealSession already
 *   cancelled by sync; if none sellable remain → applyAutoPause(session_cancelled)
 * - Provider original / discounted price drift failing 50% (or discount ≠
 *   deal_price_minor) → update originals, applyAutoPause(price_below_threshold)
 * - Notify deal_auto_paused (stub until Chunk 39)
 *
 * session_cancelled and price_below_threshold are NOT auto-resumable.
 */

import type { DealDraftStore } from "./deal-draft";
import type { Deal } from "./deal";
import { parseProviderPriceOptions } from "./deal-integrated";
import {
  parseSeparateProductRef,
} from "./deal-integrated-pricing-shared";
import type { DealPriceOption, DealSession } from "./deal-session";
import {
  applyAutoPause,
  type DealActor,
} from "./deal-status";
import type { ExternalProduct, Integration } from "./integration";
import { isIntegratedDealType } from "./enums";
import { meetsMinDiscount, withDiscountPct } from "./pricing";

// ---------------------------------------------------------------------------
// Notification stub (Chunk 39 replaces with notify())
// ---------------------------------------------------------------------------

export type DealAutoPausedNotifyPayload = {
  operatorId: string;
  dealId: string;
  reason: "session_cancelled" | "price_below_threshold";
  detail: string;
  at: string;
};

export type SendDealAutoPausedFn = (
  payload: DealAutoPausedNotifyPayload
) => void | Promise<void>;

let sendDealAutoPausedHook: SendDealAutoPausedFn = () => {
  // no-op until notifications are wired (Chunk 39)
};

export function setSendDealAutoPaused(
  fn: SendDealAutoPausedFn | null
): void {
  sendDealAutoPausedHook = fn ?? (() => undefined);
}

export async function sendDealAutoPaused(
  payload: DealAutoPausedNotifyPayload
): Promise<void> {
  await sendDealAutoPausedHook(payload);
}

// ---------------------------------------------------------------------------
// Context (matches integration-sync PostSyncHookContext)
// ---------------------------------------------------------------------------

export type PostSyncHookContext = {
  store: DealDraftStore;
  integration: Integration;
  affectedDealIds: string[];
  updatedExternalSessionIds: string[];
  cancelledExternalSessionIds: string[];
  now: string;
  actor?: DealActor;
};

const AUTO_PAUSE_STATUSES = new Set(["live", "scheduled"]);

function sessionsForDeal(
  store: DealDraftStore,
  dealId: string
): DealSession[] {
  return [...store.sessions.values()].filter((s) => s.dealId === dealId);
}

function priceOptionsForDeal(
  store: DealDraftStore,
  dealId: string
): DealPriceOption[] {
  return [...store.priceOptions.values()].filter((p) => p.dealId === dealId);
}

/**
 * A session still counts as sellable for session_cancelled when it is not
 * cancelled/expired (sold_out with 0 seats is handled by the status ticker).
 */
export function isSessionNotCancelled(session: DealSession): boolean {
  return session.status !== "cancelled" && session.status !== "expired";
}

function productForDeal(
  store: DealDraftStore,
  deal: Deal
): ExternalProduct | null {
  if (!deal.externalProductId || !store.externalProducts) return null;
  return store.externalProducts.get(deal.externalProductId) ?? null;
}

/**
 * Mirror Chunk 33 syncIntegratedOriginalPrices without importing that module
 * (avoids a cycle through deal-publish-validation).
 */
function syncOriginalPricesFromProduct(
  store: DealDraftStore,
  dealId: string,
  product: ExternalProduct,
  now: string
): Set<string> {
  const updatedIds = new Set<string>();
  const byExternalId = new Map(
    parseProviderPriceOptions(product).map(
      (p) => [p.external_id, p] as const
    )
  );
  for (const [id, opt] of store.priceOptions) {
    if (opt.dealId !== dealId || !opt.externalPriceOptionId) continue;
    const providerOpt = byExternalId.get(opt.externalPriceOptionId);
    if (!providerOpt || opt.originalPriceMinor === providerOpt.price_minor) {
      continue;
    }
    const withPct = withDiscountPct({
      originalPriceMinor: providerOpt.price_minor,
      dealPriceMinor: opt.dealPriceMinor,
    });
    store.priceOptions.set(id, {
      ...opt,
      originalPriceMinor: providerOpt.price_minor,
      originalPriceSource: "provider",
      discountPct: withPct.discountPct,
      updatedAt: now,
    });
    updatedIds.add(id);
  }
  return updatedIds;
}

/**
 * Find provider pricing drift that should auto-pause.
 * Only fires when originals just changed (and now fail 50%), or when a
 * configured discounted / separate-product price no longer matches.
 * Unconfigured drafts (no discount mapping yet) are left alone — publish
 * validation covers those.
 */
export function findPriceBelowThresholdDetail(
  store: DealDraftStore,
  deal: Deal,
  product: ExternalProduct,
  updatedOriginalOptionIds: Set<string> = new Set()
): string | null {
  const providerOptions = parseProviderPriceOptions(product);
  const byExternalId = new Map(
    providerOptions.map((p) => [p.external_id, p] as const)
  );
  const options = priceOptionsForDeal(store, deal.id);

  for (const opt of options) {
    const label = opt.label || opt.id;
    const originalUpdated = updatedOriginalOptionIds.has(opt.id);

    if (
      originalUpdated &&
      !meetsMinDiscount(opt.originalPriceMinor, opt.dealPriceMinor)
    ) {
      return `${label}: deal price no longer meets the minimum discount against the provider original`;
    }

    if (deal.discountMechanism === "price_option") {
      const dealOptId = opt.externalDealPriceOptionId;
      // Not configured yet — skip (publish validation enforces mapping)
      if (!dealOptId || parseSeparateProductRef(dealOptId)) continue;

      const discounted = byExternalId.get(dealOptId);
      if (!discounted) {
        return `${label}: discounted provider option ${dealOptId} not found`;
      }
      if (discounted.price_minor !== opt.dealPriceMinor) {
        return `${label}: provider discount price is ${discounted.price_minor}, deal price is ${opt.dealPriceMinor}`;
      }
      if (!meetsMinDiscount(opt.originalPriceMinor, opt.dealPriceMinor)) {
        return `${label}: deal price no longer meets the minimum discount against the provider original`;
      }
    }

    if (deal.discountMechanism === "separate_product") {
      const separateId = parseSeparateProductRef(opt.externalDealPriceOptionId);
      if (!separateId) continue;

      const separate = store.externalProducts?.get(separateId);
      if (!separate || separate.archivedInProvider) {
        return `${label}: separate product is missing or archived`;
      }
      const separatePrices = parseProviderPriceOptions(separate);
      if (separatePrices.length === 0) {
        return `${label}: separate product has no price options`;
      }
      const currentDealPrice =
        separatePrices.find((p) => p.type === opt.type)?.price_minor ??
        separatePrices[0]!.price_minor;
      if (currentDealPrice !== opt.dealPriceMinor) {
        return `${label}: separate product price is ${currentDealPrice}, deal price is ${opt.dealPriceMinor}`;
      }
      if (!meetsMinDiscount(opt.originalPriceMinor, currentDealPrice)) {
        return `${label}: separate product price no longer meets the minimum discount`;
      }
    }
  }

  return null;
}

async function pauseAndNotify(
  store: DealDraftStore,
  deal: Deal,
  reason: "session_cancelled" | "price_below_threshold",
  detail: string,
  now: string,
  actor: DealActor
): Promise<void> {
  applyAutoPause(store, deal.id, reason, detail, { actor, now });
  await sendDealAutoPaused({
    operatorId: deal.operatorId,
    dealId: deal.id,
    reason,
    detail,
    at: now,
  });
}

/**
 * Called after a successful product/session upsert. Applies provider-driven
 * auto-pauses for session cancellation and price threshold failures.
 */
export async function runPostSyncProviderHooks(
  ctx: PostSyncHookContext
): Promise<void> {
  const { store, integration, affectedDealIds, now } = ctx;
  const actor: DealActor = ctx.actor ?? { type: "system" };

  const seen = new Set<string>();
  for (const dealId of affectedDealIds) {
    if (seen.has(dealId)) continue;
    seen.add(dealId);

    const deal = store.deals.get(dealId);
    if (!deal) continue;
    if (!isIntegratedDealType(deal.dealType)) continue;
    if (deal.integrationId !== integration.id) continue;
    if (!AUTO_PAUSE_STATUSES.has(deal.status)) continue;

    const product = productForDeal(store, deal);

    if (product?.archivedInProvider) {
      await pauseAndNotify(
        store,
        deal,
        "session_cancelled",
        "Product archived in provider",
        now,
        actor
      );
      continue;
    }

    const sessions = sessionsForDeal(store, dealId);
    const anyNotCancelled = sessions.some(isSessionNotCancelled);
    if (sessions.length === 0 || !anyNotCancelled) {
      await pauseAndNotify(
        store,
        deal,
        "session_cancelled",
        sessions.length === 0
          ? "No provider sessions remain on this deal"
          : "All selected provider sessions were cancelled or removed",
        now,
        actor
      );
      continue;
    }

    if (!product) continue;

    const updatedOriginals = syncOriginalPricesFromProduct(
      store,
      dealId,
      product,
      now
    );

    const fresh = store.deals.get(dealId) ?? deal;
    const detail = findPriceBelowThresholdDetail(
      store,
      fresh,
      product,
      updatedOriginals
    );
    if (detail) {
      await pauseAndNotify(
        store,
        fresh,
        "price_below_threshold",
        detail,
        now,
        actor
      );
    }
  }
}
