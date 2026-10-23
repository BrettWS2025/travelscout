/**
 * Bridge operator signup → marketplace.operators + team_members → Inventory.
 *
 * Legacy signup still creates marketplace.organizations. Inventory reads
 * operators/team_members (and the in-memory DealDraftStore). This module:
 * - lists DB memberships
 * - creates an operator via RPC when missing
 * - hydrates the HTTP draft store so inventory APIs recognise the operator
 */

import { createMarketplaceClient, createUserRpcClient } from "./db";
import {
  getDealDraftHttpStore,
  listOperatorsForUserFromMemory,
  type ListedOperator,
} from "./deal-draft-http";
import { isAccountStatus, isUserRole, type UserRole } from "./enums";
import type { Operator, OperatorBookingDefaults, TeamMember } from "./operators";
import { buildDefaultBookingDefaults } from "./operators";
import {
  businessDetailsFromUserMetadata,
  normalizeOperatorBusinessDetails,
  type OperatorBusinessDetails,
} from "./operator-signup";
import { isPlatformRegion } from "./settings";

export type DbOperatorRow = {
  id: string;
  legal_name: string;
  trading_name: string;
  slug: string;
  logo: string | null;
  cover_image: string | null;
  short_description: string | null;
  long_description: string | null;
  website: string | null;
  public_email: string | null;
  public_phone: string | null;
  internal_email: string | null;
  internal_phone: string | null;
  address: string | null;
  regions_served: string[] | null;
  timezone: string;
  currency: string;
  languages: string[] | null;
  gst_number: string | null;
  nzbn: string | null;
  social_links: Record<string, unknown> | null;
  account_status: string;
  requires_manual_review: boolean;
  created_at: string;
  updated_at: string;
};

export type DbTeamMemberRow = {
  id: string;
  operator_id: string;
  user_id: string | null;
  role: string;
  invited_email: string;
  invite_status: string;
  invited_at: string;
  last_active_at: string | null;
  created_at: string;
  updated_at: string;
};

function optionalString(value: string | null | undefined): string | undefined {
  if (value == null || value === "") return undefined;
  return value;
}

export function operatorFromDbRow(row: DbOperatorRow): Operator {
  const accountStatus = isAccountStatus(row.account_status)
    ? row.account_status
    : "pending_verification";
  return {
    id: row.id,
    legalName: row.legal_name,
    tradingName: row.trading_name,
    slug: row.slug,
    logo: optionalString(row.logo),
    coverImage: optionalString(row.cover_image),
    shortDescription: optionalString(row.short_description),
    longDescription: optionalString(row.long_description),
    website: optionalString(row.website),
    publicEmail: optionalString(row.public_email),
    publicPhone: optionalString(row.public_phone),
    internalEmail: optionalString(row.internal_email),
    internalPhone: optionalString(row.internal_phone),
    address: optionalString(row.address),
    regionsServed: row.regions_served ?? [],
    timezone: row.timezone || "Pacific/Auckland",
    currency: row.currency || "NZD",
    languages: row.languages ?? [],
    gstNumber: optionalString(row.gst_number),
    nzbn: optionalString(row.nzbn),
    socialLinks: row.social_links ?? {},
    accountStatus,
    requiresManualReview: row.requires_manual_review === true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function teamMemberFromDbRow(row: DbTeamMemberRow): TeamMember {
  return {
    id: row.id,
    operatorId: row.operator_id,
    userId: row.user_id,
    role: (isUserRole(row.role) ? row.role : "staff") as UserRole,
    invitedEmail: row.invited_email,
    inviteStatus:
      row.invite_status === "accepted" ||
      row.invite_status === "pending" ||
      row.invite_status === "revoked"
        ? row.invite_status
        : "pending",
    invitedAt: row.invited_at,
    lastActiveAt: row.last_active_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Insert operator + owner (+ defaults) into the process DealDraftStore when
 * missing so inventory domain code can find the operator by id.
 */
export function hydrateOperatorIntoHttpStore(input: {
  operator: Operator;
  member: TeamMember;
  defaults?: OperatorBookingDefaults;
}): void {
  const store = getDealDraftHttpStore();
  const { operator, member } = input;
  if (!store.operators.operators.has(operator.id)) {
    store.operators.operators.set(operator.id, operator);
  }
  const defaults =
    input.defaults ??
    store.operators.bookingDefaults.get(operator.id) ??
    buildDefaultBookingDefaults(operator.id, operator.createdAt);
  store.operators.bookingDefaults.set(operator.id, defaults);

  const existingMember = [...store.operators.teamMembers.values()].find(
    (m) =>
      m.operatorId === operator.id &&
      m.userId != null &&
      m.userId === member.userId
  );
  if (existingMember) {
    store.operators.teamMembers.set(existingMember.id, {
      ...existingMember,
      ...member,
      id: existingMember.id,
    });
  } else {
    store.operators.teamMembers.set(member.id, member);
  }
}

export type OperatorMembershipRow = {
  operator: Operator;
  member: TeamMember;
  role: UserRole;
};

/**
 * List accepted operator memberships for the JWT user from Supabase.
 * Returns [] when env/DB is unavailable (caller may fall back to memory seed).
 */
export async function listOperatorMembershipsFromDb(
  accessToken: string,
  userId: string
): Promise<OperatorMembershipRow[]> {
  try {
    const supabase = createMarketplaceClient(accessToken);
    const { data, error } = await supabase
      .from("team_members")
      .select(
        "id, operator_id, user_id, role, invited_email, invite_status, invited_at, last_active_at, created_at, updated_at, operators(*)"
      )
      .eq("user_id", userId)
      .eq("invite_status", "accepted");

    if (error) {
      throw new Error(`Failed to list operator memberships: ${error.message}`);
    }

    const out: OperatorMembershipRow[] = [];
    for (const row of data ?? []) {
      const memberRow = row as DbTeamMemberRow & {
        operators: DbOperatorRow | DbOperatorRow[] | null;
      };
      const opRaw = Array.isArray(memberRow.operators)
        ? memberRow.operators[0]
        : memberRow.operators;
      if (!opRaw || !isUserRole(memberRow.role)) continue;
      const member = teamMemberFromDbRow(memberRow);
      const operator = operatorFromDbRow(opRaw);
      out.push({ operator, member, role: memberRow.role });
    }
    return out;
  } catch (err) {
    // Missing Supabase env in unit tests — fall through to memory.
    if (
      err instanceof Error &&
      err.message.includes("Missing NEXT_PUBLIC_SUPABASE")
    ) {
      return [];
    }
    throw err;
  }
}

export async function createOperatorFromBusiness(
  accessToken: string,
  business: OperatorBusinessDetails,
  options?: { slug?: string | null }
): Promise<Operator> {
  const region = business.region.trim();
  if (!isPlatformRegion(region)) {
    throw new Error("region must be a platform region.");
  }

  const supabase = createUserRpcClient(accessToken);
  const { data, error } = await supabase.rpc("create_marketplace_operator", {
    p_name: business.name.trim(),
    p_phone: business.phone.trim(),
    p_website: business.website.trim(),
    p_region: region,
    p_slug: options?.slug?.trim() || null,
  });

  if (error) {
    throw new Error(`Failed to create operator: ${error.message}`);
  }

  const row = (Array.isArray(data) ? data[0] : data) as DbOperatorRow | null;
  if (!row) throw new Error("Failed to create operator: no row returned.");
  return operatorFromDbRow(row);
}

/**
 * Ensure the user has an inventory operator. Creates from explicit business
 * details or operator signup metadata when none exists yet.
 */
export async function ensureOperatorInventory(
  accessToken: string,
  userId: string,
  options?: {
    business?: OperatorBusinessDetails | null;
    userMetadata?: Record<string, unknown> | null;
    email?: string | null;
  }
): Promise<ListedOperator | null> {
  const listed = await resolveOperatorsForUser(accessToken, userId, options?.email);
  if (listed.length > 0) return listed[0] ?? null;

  const details =
    normalizeOperatorBusinessDetails(options?.business) ??
    businessDetailsFromUserMetadata(options?.userMetadata ?? null);
  if (!details) return null;

  await createOperatorFromBusiness(accessToken, details);

  const again = await resolveOperatorsForUser(
    accessToken,
    userId,
    options?.email
  );
  return again[0] ?? null;
}

/**
 * DB memberships (hydrated into HTTP store) plus in-memory seed operators
 * for local demo emails. DB wins on id collision.
 */
export async function resolveOperatorsForUser(
  accessToken: string | null | undefined,
  userId: string,
  email?: string | null
): Promise<ListedOperator[]> {
  const byId = new Map<string, ListedOperator>();

  if (accessToken) {
    const memberships = await listOperatorMembershipsFromDb(accessToken, userId);
    for (const m of memberships) {
      hydrateOperatorIntoHttpStore({
        operator: m.operator,
        member: m.member,
      });
      byId.set(m.operator.id, {
        id: m.operator.id,
        tradingName: m.operator.tradingName,
        slug: m.operator.slug,
        role: m.role,
        timezone: m.operator.timezone,
        currency: m.operator.currency,
      });
    }
  }

  for (const mem of listOperatorsForUserFromMemory(userId, email)) {
    if (!byId.has(mem.id)) byId.set(mem.id, mem);
  }

  return [...byId.values()];
}
