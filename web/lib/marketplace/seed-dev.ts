/**
 * Dev-only seed data for the deals platform (Chunk 8).
 *
 * Creates:
 * - Operator A "Harbour Kayaks" (manual) with owner, manager, staff
 * - Operator B "Bay Cruises" with a Rezdy Integration in status not_connected
 * - Default notification preferences for each seeded member
 * - Billing account rows for both operators
 *
 * In-memory for unit tests. SQL twin: supabase/seeds/deals_platform_dev.sql
 * (run against local Supabase only — never production).
 */

import type { Integration } from "./integration";
import {
  createOperatorStore,
  seedOperatorWithOwner,
  type Operator,
  type OperatorBookingDefaults,
  type OperatorStore,
  type TeamMember,
} from "./operators";
import {
  buildDefaultNotificationPreferences,
  type BillingAccount,
  type NotificationPreference,
} from "./settings";

/** Stable IDs so tests and SQL seed stay aligned. */
export const DEV_SEED_IDS = {
  harbourKayaks: {
    operatorId: "a1000000-0000-4000-8000-000000000001",
    ownerUserId: "a1000000-0000-4000-8000-000000000011",
    managerUserId: "a1000000-0000-4000-8000-000000000012",
    staffUserId: "a1000000-0000-4000-8000-000000000013",
    ownerMemberId: "a1000000-0000-4000-8000-000000000021",
    managerMemberId: "a1000000-0000-4000-8000-000000000022",
    staffMemberId: "a1000000-0000-4000-8000-000000000023",
    billingId: "a1000000-0000-4000-8000-000000000031",
  },
  bayCruises: {
    operatorId: "b2000000-0000-4000-8000-000000000001",
    ownerUserId: "b2000000-0000-4000-8000-000000000011",
    ownerMemberId: "b2000000-0000-4000-8000-000000000021",
    integrationId: "b2000000-0000-4000-8000-000000000041",
    billingId: "b2000000-0000-4000-8000-000000000031",
  },
} as const;

/** Login emails for the seeded users (password in SQL seed comments). */
export const DEV_SEED_USERS = [
  {
    email: "owner@harbour-kayaks.dev",
    role: "owner" as const,
    operatorSlug: "harbour-kayaks",
    userId: DEV_SEED_IDS.harbourKayaks.ownerUserId,
  },
  {
    email: "manager@harbour-kayaks.dev",
    role: "manager" as const,
    operatorSlug: "harbour-kayaks",
    userId: DEV_SEED_IDS.harbourKayaks.managerUserId,
  },
  {
    email: "staff@harbour-kayaks.dev",
    role: "staff" as const,
    operatorSlug: "harbour-kayaks",
    userId: DEV_SEED_IDS.harbourKayaks.staffUserId,
  },
  {
    email: "owner@bay-cruises.dev",
    role: "owner" as const,
    operatorSlug: "bay-cruises",
    userId: DEV_SEED_IDS.bayCruises.ownerUserId,
  },
] as const;

export type DevSeedResult = {
  store: OperatorStore;
  harbourKayaks: {
    operator: Operator;
    defaults: OperatorBookingDefaults;
    owner: TeamMember;
    manager: TeamMember;
    staff: TeamMember;
  };
  bayCruises: {
    operator: Operator;
    defaults: OperatorBookingDefaults;
    owner: TeamMember;
    integration: Integration;
  };
  notificationPreferences: NotificationPreference[];
  billingAccounts: BillingAccount[];
  integrations: Integration[];
};

function addTeamMember(
  store: OperatorStore,
  member: TeamMember
): TeamMember {
  store.teamMembers.set(member.id, member);
  return member;
}

function buildBillingAccount(
  id: string,
  operatorId: string,
  billingEmail: string,
  now: string
): BillingAccount {
  return {
    id,
    operatorId,
    plan: "starter",
    billingModel: "subscription",
    commissionPct: null,
    billingEmail,
    paymentMethodRef: null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

function buildNotConnectedRezdy(
  id: string,
  operatorId: string,
  now: string
): Integration {
  return {
    id,
    operatorId,
    provider: "rezdy",
    status: "not_connected",
    authType: null,
    credentialsRef: null,
    webhookSecretRef: null,
    externalAccountId: null,
    externalAccountName: null,
    syncMode: null,
    pollIntervalSeconds: null,
    webhookLastReceivedAt: null,
    lastSyncAt: null,
    lastSuccessfulSyncAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    defaultBookingDestinationType: null,
    bookingBaseUrl: null,
    conversionTrackingMethod: "none",
    bookingSourceLabel: null,
    autoEnableNewProducts: false,
    connectedAt: null,
    connectedBy: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Seed the two Chunk 8 operators into an in-memory store.
 * Idempotent when called on a fresh store; callers should not re-seed the same store.
 */
export function seedDevMarketplace(
  options?: { now?: string; store?: OperatorStore }
): DevSeedResult {
  const now = options?.now ?? "2026-10-20T00:00:00.000Z";
  const store = options?.store ?? createOperatorStore();
  const ids = DEV_SEED_IDS;

  const harbour = seedOperatorWithOwner(
    store,
    {
      legalName: "Harbour Kayaks Limited",
      tradingName: "Harbour Kayaks",
      slug: "harbour-kayaks",
      shortDescription: "Guided harbour kayak tours from the city waterfront.",
      regionsServed: ["Auckland"],
      languages: ["en"],
      accountStatus: "active",
      publicEmail: "hello@harbour-kayaks.dev",
      ownerUserId: ids.harbourKayaks.ownerUserId,
      ownerEmail: "owner@harbour-kayaks.dev",
    },
    {
      id: ids.harbourKayaks.operatorId,
      memberId: ids.harbourKayaks.ownerMemberId,
      now,
    }
  );

  const manager = addTeamMember(store, {
    id: ids.harbourKayaks.managerMemberId,
    operatorId: harbour.operator.id,
    userId: ids.harbourKayaks.managerUserId,
    role: "manager",
    invitedEmail: "manager@harbour-kayaks.dev",
    inviteStatus: "accepted",
    invitedAt: now,
    lastActiveAt: now,
    createdAt: now,
    updatedAt: now,
  });

  const staff = addTeamMember(store, {
    id: ids.harbourKayaks.staffMemberId,
    operatorId: harbour.operator.id,
    userId: ids.harbourKayaks.staffUserId,
    role: "staff",
    invitedEmail: "staff@harbour-kayaks.dev",
    inviteStatus: "accepted",
    invitedAt: now,
    lastActiveAt: now,
    createdAt: now,
    updatedAt: now,
  });

  const bay = seedOperatorWithOwner(
    store,
    {
      legalName: "Bay Cruises Limited",
      tradingName: "Bay Cruises",
      slug: "bay-cruises",
      shortDescription: "Scenic bay cruises with live booking via Rezdy.",
      regionsServed: ["Bay of Plenty"],
      languages: ["en"],
      accountStatus: "active",
      publicEmail: "hello@bay-cruises.dev",
      ownerUserId: ids.bayCruises.ownerUserId,
      ownerEmail: "owner@bay-cruises.dev",
    },
    {
      id: ids.bayCruises.operatorId,
      memberId: ids.bayCruises.ownerMemberId,
      now,
    }
  );

  const integration = buildNotConnectedRezdy(
    ids.bayCruises.integrationId,
    bay.operator.id,
    now
  );

  const notificationPreferences: NotificationPreference[] = [
    ...buildDefaultNotificationPreferences(
      ids.harbourKayaks.ownerUserId,
      harbour.operator.id,
      { now }
    ),
    ...buildDefaultNotificationPreferences(
      ids.harbourKayaks.managerUserId,
      harbour.operator.id,
      { now }
    ),
    ...buildDefaultNotificationPreferences(
      ids.harbourKayaks.staffUserId,
      harbour.operator.id,
      { now }
    ),
    ...buildDefaultNotificationPreferences(
      ids.bayCruises.ownerUserId,
      bay.operator.id,
      { now }
    ),
  ];

  const billingAccounts: BillingAccount[] = [
    buildBillingAccount(
      ids.harbourKayaks.billingId,
      harbour.operator.id,
      "billing@harbour-kayaks.dev",
      now
    ),
    buildBillingAccount(
      ids.bayCruises.billingId,
      bay.operator.id,
      "billing@bay-cruises.dev",
      now
    ),
  ];

  return {
    store,
    harbourKayaks: {
      operator: harbour.operator,
      defaults: harbour.defaults,
      owner: harbour.owner,
      manager,
      staff,
    },
    bayCruises: {
      operator: bay.operator,
      defaults: bay.defaults,
      owner: bay.owner,
      integration,
    },
    notificationPreferences,
    billingAccounts,
    integrations: [integration],
  };
}

/** True when NODE_ENV is development or DEAL_PLATFORM_SEED=1. */
export function isDevSeedAllowed(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return (
    env.DEAL_PLATFORM_SEED === "1" ||
    env.NODE_ENV === "development" ||
    env.NODE_ENV === "test"
  );
}
