import { readFileSync } from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  computeSeatsDisplayed,
  validateDealSessionFields,
  validateDiscountStepFields,
  withSeatsDisplayed,
} from "@/lib/marketplace/deal-session";

const MIGRATION_PATH = path.resolve(
  __dirname,
  "../../../../supabase/migrations/20261020000001_create_deal_sessions_price_options.sql"
);

const MANUAL_DEAL = {
  dealType: "manual_session" as const,
  seatCap: null as number | null,
};

const INTEGRATED_DEAL = {
  dealType: "integrated_session" as const,
  seatCap: null as number | null,
};

describe("Chunk 4 migration", () => {
  it("defines sessions, price options and discount steps under operator_deals", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");

    expect(sql).toContain("CREATE TABLE marketplace.deal_sessions");
    expect(sql).toContain("CREATE TABLE marketplace.deal_price_options");
    expect(sql).toContain("CREATE TABLE marketplace.discount_steps");
    expect(sql).toContain(
      "REFERENCES marketplace.operator_deals(id) ON DELETE CASCADE"
    );
    expect(sql).toContain(
      "REFERENCES marketplace.deal_price_options(id) ON DELETE CASCADE"
    );
    expect(sql).toContain("'live', 'sold_out', 'cancelled', 'expired'");
    expect(sql).toContain("hours_before_start >= 1 AND hours_before_start <= 72");
    expect(sql).toContain("manual_seats_available <= 999");
    expect(sql).toContain("marketplace.operator_id_for_deal");
    expect(sql).toContain("Child tables of marketplace.operator_deals");
  });
});

describe("computeSeatsDisplayed", () => {
  it("uses manual_seats_available for manual deals (no caps)", () => {
    expect(
      computeSeatsDisplayed(
        {
          providerSeatsAvailable: 99,
          manualSeatsAvailable: 6,
          seatCap: null,
        },
        MANUAL_DEAL
      )
    ).toBe(6);
  });

  it("uses provider_seats_available for integrated deals (no caps)", () => {
    expect(
      computeSeatsDisplayed(
        {
          providerSeatsAvailable: 12,
          manualSeatsAvailable: 99,
          seatCap: null,
        },
        INTEGRATED_DEAL
      )
    ).toBe(12);
  });

  it("applies session seat_cap over deal seat_cap", () => {
    expect(
      computeSeatsDisplayed(
        {
          providerSeatsAvailable: 10,
          manualSeatsAvailable: null,
          seatCap: 4,
        },
        { ...INTEGRATED_DEAL, seatCap: 8 }
      )
    ).toBe(4);
  });

  it("falls back to deal seat_cap when session has none", () => {
    expect(
      computeSeatsDisplayed(
        {
          providerSeatsAvailable: 10,
          manualSeatsAvailable: null,
          seatCap: null,
        },
        { ...INTEGRATED_DEAL, seatCap: 3 }
      )
    ).toBe(3);

    expect(
      computeSeatsDisplayed(
        {
          providerSeatsAvailable: null,
          manualSeatsAvailable: 20,
          seatCap: null,
        },
        { dealType: "manual_open_window", seatCap: 5 }
      )
    ).toBe(5);
  });

  it("never returns below 0", () => {
    expect(
      computeSeatsDisplayed(
        {
          providerSeatsAvailable: -5,
          manualSeatsAvailable: null,
          seatCap: null,
        },
        INTEGRATED_DEAL
      )
    ).toBe(0);

    expect(
      computeSeatsDisplayed(
        {
          providerSeatsAvailable: null,
          manualSeatsAvailable: -2,
          seatCap: 10,
        },
        MANUAL_DEAL
      )
    ).toBe(0);
  });

  it("treats null available as 0 (fail closed)", () => {
    expect(
      computeSeatsDisplayed(
        {
          providerSeatsAvailable: null,
          manualSeatsAvailable: null,
          seatCap: 10,
        },
        INTEGRATED_DEAL
      )
    ).toBe(0);

    expect(
      computeSeatsDisplayed(
        {
          providerSeatsAvailable: 8,
          manualSeatsAvailable: null,
          seatCap: null,
        },
        MANUAL_DEAL
      )
    ).toBe(0);
  });

  it("withSeatsDisplayed recomputes on save shape", () => {
    const saved = withSeatsDisplayed(
      {
        providerSeatsAvailable: 10,
        manualSeatsAvailable: null,
        seatCap: 4,
      },
      { ...INTEGRATED_DEAL, seatCap: 99 }
    );
    expect(saved.seatsDisplayed).toBe(4);
  });

  it("handles multi-session and open-window deal types", () => {
    expect(
      computeSeatsDisplayed(
        {
          providerSeatsAvailable: 7,
          manualSeatsAvailable: null,
          seatCap: null,
        },
        { dealType: "integrated_multi_session", seatCap: null }
      )
    ).toBe(7);
  });
});

describe("field validators", () => {
  const originalEnv = process.env.MAX_LEAD_HOURS;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.MAX_LEAD_HOURS;
    } else {
      process.env.MAX_LEAD_HOURS = originalEnv;
    }
  });

  it("rejects manual seats outside 0–999", () => {
    expect(
      validateDealSessionFields({ manualSeatsAvailable: 1000 }).map(
        (e) => e.field
      )
    ).toContain("manual_seats_available");
    expect(validateDealSessionFields({ manualSeatsAvailable: 0 })).toEqual([]);
  });

  it("enforces hours_before_start against MAX_LEAD_HOURS", () => {
    expect(
      validateDiscountStepFields({ hoursBeforeStart: 72 })
    ).toEqual([]);
    expect(
      validateDiscountStepFields({ hoursBeforeStart: 73 }).map((e) => e.field)
    ).toContain("hours_before_start");
    expect(
      validateDiscountStepFields({ hoursBeforeStart: 0 }).map((e) => e.field)
    ).toContain("hours_before_start");

    process.env.MAX_LEAD_HOURS = "48";
    expect(
      validateDiscountStepFields({ hoursBeforeStart: 49 }).map((e) => e.field)
    ).toContain("hours_before_start");
    expect(validateDiscountStepFields({ hoursBeforeStart: 48 })).toEqual([]);
  });
});
