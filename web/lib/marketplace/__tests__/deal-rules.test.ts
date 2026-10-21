/**
 * Chunk 44 — auto-deal rules: CRUD, preview, runner (create once).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDealDraftStore,
  createDraftDeal,
} from "@/lib/marketplace/deal-draft";
import { listOperatorDeals } from "@/lib/marketplace/deal-list";
import {
  createDealRule,
  findMatchingSessionsForRule,
  listOperatorDealRules,
  previewDealRule,
  runDealRulesJob,
  scheduleSummaryText,
} from "@/lib/marketplace/deal-rules";
import {
  connectIntegration,
  ensureIntegrationSecretsConfigured,
  resetIntegrationSecretsBootstrap,
} from "@/lib/marketplace/integration-connect";
import {
  resetSyncLocks,
  runSync,
  setProductEnabledForDeals,
} from "@/lib/marketplace/integration-sync";
import {
  createMockAdapter,
  registerAdapterFactory,
  resetAdapterRegistry,
} from "@/lib/marketplace/providers";
import { DEV_SEED_IDS, seedDevMarketplace } from "@/lib/marketplace/seed-dev";
import { localDateKey } from "@/lib/marketplace/timezone";

const NOW = "2026-10-20T04:00:00.000Z";
const NOW_DATE = new Date(NOW);
const ACTOR = {
  type: "user" as const,
  id: DEV_SEED_IDS.bayCruises.ownerUserId,
};

function freshStore() {
  const seeded = seedDevMarketplace({ now: NOW });
  const store = createDealDraftStore(seeded.store);
  store.integrations = new Map(seeded.integrations.map((i) => [i.id, i]));
  store.syncLogs = new Map();
  store.externalProducts = new Map();
  store.externalSessions = new Map();
  store.integrationPollState = new Map();
  store.dealRules = new Map();
  return {
    store,
    bayOperatorId: DEV_SEED_IDS.bayCruises.operatorId,
    bayOwnerId: DEV_SEED_IDS.bayCruises.ownerUserId,
  };
}

describe("Chunk 44 auto-deal rules", () => {
  let mockController: ReturnType<typeof createMockAdapter>;

  beforeEach(() => {
    resetIntegrationSecretsBootstrap();
    ensureIntegrationSecretsConfigured();
    resetAdapterRegistry();
    resetSyncLocks();
    mockController = createMockAdapter({ now: NOW_DATE });
    registerAdapterFactory("rezdy", () => mockController.adapter);
  });

  afterEach(() => {
    resetIntegrationSecretsBootstrap();
    resetAdapterRegistry();
    resetSyncLocks();
  });

  async function connectTemplateAndRule(opts?: {
    listHours?: number;
    minSeats?: number;
    sessionTimes?: string[];
    autoPublish?: boolean;
  }) {
    const { store, bayOperatorId, bayOwnerId } = freshStore();
    const connected = await connectIntegration(
      store,
      bayOperatorId,
      "rezdy",
      { api_key: "chunk44-key" },
      { actor: { type: "user", id: bayOwnerId }, now: NOW }
    );
    const kayak = [...store.externalProducts!.values()].find(
      (p) => p.externalId === "prod-harbour-kayak"
    )!;
    setProductEnabledForDeals(store, bayOperatorId, "rezdy", kayak.id, true, {
      now: NOW,
    });
    await runSync(store, connected.integration.id, "full", { now: NOW });

    const template = createDraftDeal(store, {
      operatorId: bayOperatorId,
      dealType: "integrated_session",
      externalProductId: kayak.id,
      actor: ACTOR,
      now: NOW,
    });

    const tz =
      store.operators.operators.get(bayOperatorId)?.timezone ??
      "Pacific/Auckland";
    const startDate = localDateKey(NOW, tz);

    const rule = createDealRule(
      store,
      bayOperatorId,
      {
        name: "48h kayak leftovers",
        integration_id: connected.integration.id,
        external_product_id: kayak.id,
        template_deal_id: template.id,
        rule_type: "daily",
        list_hours_before_start: opts?.listHours ?? 48,
        min_unsold_seats: opts?.minSeats ?? 2,
        session_times: opts?.sessionTimes ?? [],
        discount_mechanism: "promo_code",
        promo_code: "LASTMINUTE55",
        auto_publish: opts?.autoPublish ?? false,
        start_date: startDate,
        price_config: {
          options: [
            {
              external_price_option_id: "po-kayak-adult",
              percentage: 55,
            },
          ],
        },
      },
      { now: NOW }
    );

    return {
      store,
      bayOperatorId,
      kayak,
      integration: connected.integration,
      template,
      rule,
      tz,
    };
  }

  it("builds schedule summary text", async () => {
    const { rule } = await connectTemplateAndRule({
      sessionTimes: ["14:00"],
    });
    expect(scheduleSummaryText(rule)).toBe(
      "Daily, 48 h before, 2pm sessions"
    );
  });

  it("preview: rule 48h before, min 2 seats → correct count; runner creates once", async () => {
    const { store, bayOperatorId, rule } = await connectTemplateAndRule({
      listHours: 48,
      minSeats: 2,
    });

    const matches = findMatchingSessionsForRule(store, rule, {
      now: NOW,
      useListHoursOnly: true,
    });
    // Mock: within 48h of 04:00Z → d0-09, d0-14, d1-09, d1-14 (4 sessions), 8 seats each
    expect(matches.length).toBe(4);

    const preview = previewDealRule(store, rule.id, {
      now: NOW,
      operatorId: bayOperatorId,
    });
    expect(preview.would_create).toBe(4);
    expect(preview.message).toContain("would create 4 deals");
    expect(preview.message).toContain("rezdy");
    expect(preview.sessions).toHaveLength(4);

    const firstRun = await runDealRulesJob(store, { now: NOW, actor: ACTOR });
    expect(firstRun.deals_created).toBe(4);
    expect(firstRun.rules_evaluated).toBe(1);

    const fromRule = [...store.deals.values()].filter(
      (d) => d.dealRuleId === rule.id
    );
    expect(fromRule).toHaveLength(4);
    expect(fromRule.every((d) => d.status === "draft")).toBe(true);
    expect(fromRule.every((d) => d.dealType === "integrated_session")).toBe(
      true
    );

    // Each generated deal has exactly one session linked to an external session
    for (const d of fromRule) {
      const sessions = [...store.sessions.values()].filter(
        (s) => s.dealId === d.id
      );
      expect(sessions).toHaveLength(1);
      expect(sessions[0].externalSessionId).toBeTruthy();
    }

    // Prices from price_config: 55% of $120 = $54
    const prices = [...store.priceOptions.values()].filter((p) =>
      fromRule.some((d) => d.id === p.dealId)
    );
    expect(prices.length).toBeGreaterThanOrEqual(4);
    expect(
      prices.every(
        (p) =>
          p.externalPriceOptionId === "po-kayak-adult" &&
          p.dealPriceMinor === 5400
      )
    ).toBe(true);

    // Deals list marks from_rule
    const list = listOperatorDeals(store, bayOperatorId, {
      tab: "drafts",
      pageSize: 50,
      permissionUser: {
        id: DEV_SEED_IDS.bayCruises.ownerUserId,
        isPlatformAdmin: false,
      },
      now: NOW,
    });
    const ruleRows = list.deals.filter((r) =>
      fromRule.some((d) => d.id === r.id)
    );
    expect(ruleRows.length).toBe(4);
    expect(ruleRows.every((r) => r.from_rule)).toBe(true);

    // Second run creates none (sessions already have non-ended deals)
    const second = await runDealRulesJob(store, { now: NOW, actor: ACTOR });
    expect(second.deals_created).toBe(0);
    expect(
      [...store.deals.values()].filter((d) => d.dealRuleId === rule.id)
    ).toHaveLength(4);

    const rows = listOperatorDealRules(store, bayOperatorId, { now: NOW });
    const row = rows.find((r) => r.id === rule.id)!;
    expect(row.deals_generated_last_7_days).toBe(4);
    expect(row.schedule_summary).toContain("Daily");
  });

  it("rejects template deal for a different product", async () => {
    const { store, bayOperatorId, kayak, integration } =
      await connectTemplateAndRule();
    const cruise = [...store.externalProducts!.values()].find(
      (p) => p.externalId === "prod-bay-cruise"
    )!;
    setProductEnabledForDeals(store, bayOperatorId, "rezdy", cruise.id, true, {
      now: NOW,
    });
    await runSync(store, integration.id, "full", { now: NOW });

    const otherTemplate = createDraftDeal(store, {
      operatorId: bayOperatorId,
      dealType: "integrated_session",
      externalProductId: cruise.id,
      actor: ACTOR,
      now: NOW,
    });

    expect(() =>
      createDealRule(store, bayOperatorId, {
        name: "mismatch",
        integration_id: integration.id,
        external_product_id: kayak.id,
        template_deal_id: otherTemplate.id,
        rule_type: "daily",
        list_hours_before_start: 48,
        min_unsold_seats: 2,
        discount_mechanism: "promo_code",
        promo_code: "XTRA50",
        start_date: "2026-10-20",
        price_config: {
          options: [
            {
              external_price_option_id: "po-kayak-adult",
              percentage: 50,
            },
          ],
        },
      })
    ).toThrow(/same external product/i);
  });

  it("rejects price_config that fails the 50% rule", async () => {
    const { store, bayOperatorId, kayak, integration, template } =
      await connectTemplateAndRule();

    expect(() =>
      createDealRule(store, bayOperatorId, {
        name: "too little discount",
        integration_id: integration.id,
        external_product_id: kayak.id,
        template_deal_id: template.id,
        rule_type: "daily",
        list_hours_before_start: 24,
        min_unsold_seats: 1,
        discount_mechanism: "promo_code",
        promo_code: "WEAK49",
        start_date: "2026-10-20",
        price_config: {
          options: [
            {
              external_price_option_id: "po-kayak-adult",
              percentage: 49,
            },
          ],
        },
      })
    ).toThrow(/Invalid deal rule|percentage/i);
  });
});
