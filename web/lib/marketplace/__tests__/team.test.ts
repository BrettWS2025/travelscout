/**
 * Chunk 40 — Team: invite, accept, last owner, role rules, last_active.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createDealDraftStore } from "@/lib/marketplace/deal-draft";
import { can } from "@/lib/marketplace/permissions";
import { DEV_SEED_IDS, seedDevMarketplace } from "@/lib/marketplace/seed-dev";
import {
  LAST_ACTIVE_THROTTLE_MS,
  acceptTeamInvite,
  deleteTeamMember,
  getTeamInvitePreview,
  inviteTeamMember,
  listOperatorTeam,
  resendTeamInvite,
  revokeTeamInvite,
  setTeamInviteEmailSender,
  touchTeamMemberLastActive,
  updateTeamMemberRole,
  TeamError,
} from "@/lib/marketplace/team";

const NOW = "2026-10-21T04:00:00.000Z";

function freshStore() {
  const seeded = seedDevMarketplace({ now: NOW });
  const store = createDealDraftStore(seeded.store);
  return {
    store,
    operatorId: DEV_SEED_IDS.harbourKayaks.operatorId,
    ownerId: DEV_SEED_IDS.harbourKayaks.ownerUserId,
    ownerMemberId: DEV_SEED_IDS.harbourKayaks.ownerMemberId,
    managerId: DEV_SEED_IDS.harbourKayaks.managerUserId,
    managerMemberId: DEV_SEED_IDS.harbourKayaks.managerMemberId,
    staffId: DEV_SEED_IDS.harbourKayaks.staffUserId,
    staffMemberId: DEV_SEED_IDS.harbourKayaks.staffMemberId,
  };
}

afterEach(() => {
  setTeamInviteEmailSender(null);
});

describe("Chunk 40 team list", () => {
  it("lists members with roles and invite status", () => {
    const { store, operatorId } = freshStore();
    const members = listOperatorTeam(store, operatorId);
    expect(members.map((m) => m.role)).toEqual(["owner", "manager", "staff"]);
    expect(members.every((m) => m.inviteStatus === "accepted")).toBe(true);
  });
});

describe("Chunk 40 last owner", () => {
  it("blocks removing the only owner", () => {
    const { store, ownerId, ownerMemberId, operatorId } = freshStore();
    expect(() =>
      deleteTeamMember(
        store,
        ownerMemberId,
        { userId: ownerId, role: "owner" },
        { now: NOW }
      )
    ).toThrow(TeamError);
    try {
      deleteTeamMember(
        store,
        ownerMemberId,
        { userId: ownerId, role: "owner" },
        { now: NOW }
      );
    } catch (err) {
      expect(err).toBeInstanceOf(TeamError);
      expect((err as TeamError).code).toBe("last_owner");
      expect((err as TeamError).status).toBe(409);
    }
    expect(
      listOperatorTeam(store, operatorId).some(
        (m) => m.id === ownerMemberId && m.inviteStatus === "accepted"
      )
    ).toBe(true);
  });

  it("blocks demoting the only owner", () => {
    const { store, ownerId, ownerMemberId } = freshStore();
    expect(() =>
      updateTeamMemberRole(
        store,
        ownerMemberId,
        { userId: ownerId, role: "owner" },
        "manager",
        { now: NOW }
      )
    ).toThrow(/at least one accepted owner/i);
  });
});

describe("Chunk 40 invite + accept", () => {
  it("invites staff, accepts, and staff has inventory.read only", async () => {
    const emails: Array<{ to: string; inviteUrl: string }> = [];
    setTeamInviteEmailSender((msg) => {
      emails.push({ to: msg.to, inviteUrl: msg.inviteUrl });
    });

    const { store, operatorId, ownerId } = freshStore();
    const issued = await inviteTeamMember(
      store,
      operatorId,
      { userId: ownerId, role: "owner", email: "owner@harbour-kayaks.dev" },
      { email: "newstaff@example.com", role: "staff" },
      { now: NOW, origin: "https://app.example" }
    );

    expect(issued.member.inviteStatus).toBe("pending");
    expect(issued.member.userId).toBeNull();
    expect(emails).toHaveLength(1);
    expect(emails[0]!.to).toBe("newstaff@example.com");
    expect(emails[0]!.inviteUrl).toContain("/team/invite/");

    const preview = getTeamInvitePreview(store, issued.rawToken, { now: NOW });
    expect(preview.operatorName).toBe("Harbour Kayaks");
    expect(preview.role).toBe("staff");
    expect(preview.expired).toBe(false);

    const newUserId = "cccccccc-0000-4000-8000-000000000099";
    const accepted = acceptTeamInvite(
      store,
      issued.rawToken,
      { id: newUserId, email: "newstaff@example.com" },
      { now: NOW }
    );
    expect(accepted.inviteStatus).toBe("accepted");
    expect(accepted.userId).toBe(newUserId);

    const permissionUser = {
      id: newUserId,
      isPlatformAdmin: false,
      operatorRoles: { [operatorId]: "staff" as const },
    };
    expect(can(permissionUser, operatorId, "inventory.read")).toBe(true);
    expect(can(permissionUser, operatorId, "inventory.write")).toBe(false);
    expect(can(permissionUser, operatorId, "settings.team")).toBe(false);

    // Token single-use
    expect(() =>
      acceptTeamInvite(
        store,
        issued.rawToken,
        { id: newUserId, email: "newstaff@example.com" },
        { now: NOW }
      )
    ).toThrow(/already been used/i);
  });

  it("rejects accept when signed-in email does not match invite", async () => {
    setTeamInviteEmailSender(() => undefined);
    const { store, operatorId, ownerId } = freshStore();
    const issued = await inviteTeamMember(
      store,
      operatorId,
      { userId: ownerId, role: "owner" },
      { email: "invitee@example.com", role: "manager" },
      { now: NOW }
    );
    expect(() =>
      acceptTeamInvite(
        store,
        issued.rawToken,
        { id: "u1", email: "other@example.com" },
        { now: NOW }
      )
    ).toThrow(/invited email/i);
  });
});

describe("Chunk 40 owner-only owner changes", () => {
  it("blocks manager from inviting or promoting owners", async () => {
    setTeamInviteEmailSender(() => undefined);
    const { store, operatorId, managerId, staffMemberId } = freshStore();

    await expect(
      inviteTeamMember(
        store,
        operatorId,
        { userId: managerId, role: "manager" },
        { email: "boss@example.com", role: "owner" },
        { now: NOW }
      )
    ).rejects.toMatchObject({ status: 403, code: "owner_required" });

    expect(() =>
      updateTeamMemberRole(
        store,
        staffMemberId,
        { userId: managerId, role: "manager" },
        "owner",
        { now: NOW }
      )
    ).toThrow(/Only owners/i);
  });

  it("allows manager to invite staff and resend/revoke", async () => {
    setTeamInviteEmailSender(() => undefined);
    const { store, operatorId, managerId } = freshStore();
    const issued = await inviteTeamMember(
      store,
      operatorId,
      { userId: managerId, role: "manager" },
      { email: "helper@example.com", role: "staff" },
      { now: NOW }
    );
    expect(issued.member.role).toBe("staff");

    const resent = await resendTeamInvite(
      store,
      issued.member.id,
      { userId: managerId, role: "manager" },
      { now: "2026-10-21T05:00:00.000Z" }
    );
    expect(resent.rawToken).not.toBe(issued.rawToken);

    const revoked = revokeTeamInvite(
      store,
      issued.member.id,
      { userId: managerId, role: "manager" },
      { now: "2026-10-21T06:00:00.000Z" }
    );
    expect(revoked.inviteStatus).toBe("revoked");
  });
});

describe("Chunk 40 last_active throttle", () => {
  it("updates then skips within throttle window", () => {
    const { store, operatorId, ownerId, ownerMemberId } = freshStore();
    const t1 = touchTeamMemberLastActive(store, operatorId, ownerId, {
      now: NOW,
      throttleMs: LAST_ACTIVE_THROTTLE_MS,
    });
    expect(t1?.lastActiveAt).toBe(NOW);

    const soon = new Date(Date.parse(NOW) + 60_000).toISOString();
    const t2 = touchTeamMemberLastActive(store, operatorId, ownerId, {
      now: soon,
      throttleMs: LAST_ACTIVE_THROTTLE_MS,
    });
    expect(t2?.lastActiveAt).toBe(NOW);

    const later = new Date(
      Date.parse(NOW) + LAST_ACTIVE_THROTTLE_MS + 1
    ).toISOString();
    const t3 = touchTeamMemberLastActive(store, operatorId, ownerId, {
      now: later,
      throttleMs: LAST_ACTIVE_THROTTLE_MS,
    });
    expect(t3?.lastActiveAt).toBe(later);
    expect(store.operators.teamMembers.get(ownerMemberId)?.lastActiveAt).toBe(
      later
    );
  });
});

describe("Chunk 40 duplicate invite", () => {
  it("rejects second pending invite for same email", async () => {
    setTeamInviteEmailSender(() => undefined);
    const { store, operatorId, ownerId } = freshStore();
    await inviteTeamMember(
      store,
      operatorId,
      { userId: ownerId, role: "owner" },
      { email: "dup@example.com", role: "staff" },
      { now: NOW }
    );
    await expect(
      inviteTeamMember(
        store,
        operatorId,
        { userId: ownerId, role: "owner" },
        { email: "DUP@example.com", role: "manager" },
        { now: NOW }
      )
    ).rejects.toMatchObject({ code: "invite_pending", status: 409 });
  });
});

// silence unused vi if needed
void vi;
