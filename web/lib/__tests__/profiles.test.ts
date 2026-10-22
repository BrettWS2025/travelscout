import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureUserProfile } from "@/lib/profiles";

const maybeSingle = vi.fn();
const upsertMaybeSingle = vi.fn();
const upsert = vi.fn(() => ({
  select: () => ({
    maybeSingle: upsertMaybeSingle,
  }),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle,
        }),
      }),
      upsert,
    }),
  },
}));

describe("ensureUserProfile", () => {
  beforeEach(() => {
    maybeSingle.mockReset();
    upsertMaybeSingle.mockReset();
    upsert.mockClear();
  });

  it("returns an existing profile", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: "u1", email: "a@b.com", display_name: "Ada" },
      error: null,
    });

    const profile = await ensureUserProfile({
      id: "u1",
      email: "a@b.com",
      user_metadata: {},
    } as never);

    expect(profile.display_name).toBe("Ada");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("creates a profile when none exists instead of coercing .single()", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    upsertMaybeSingle.mockResolvedValue({
      data: { id: "u1", email: "a@b.com", display_name: "Ada" },
      error: null,
    });

    const profile = await ensureUserProfile({
      id: "u1",
      email: "a@b.com",
      user_metadata: { full_name: "Ada" },
    } as never);

    expect(profile).toEqual({
      id: "u1",
      email: "a@b.com",
      display_name: "Ada",
    });
  });

  it("S7: upsert omits is_platform_admin even if user_metadata claims admin", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    upsertMaybeSingle.mockResolvedValue({
      data: { id: "u1", email: "a@b.com", display_name: "Ada" },
      error: null,
    });

    const profile = await ensureUserProfile({
      id: "u1",
      email: "a@b.com",
      user_metadata: { full_name: "Ada", is_platform_admin: true },
    } as never);

    expect(upsert).toHaveBeenCalledWith(
      {
        id: "u1",
        email: "a@b.com",
        display_name: "Ada",
      },
      { onConflict: "id" }
    );
    const payload = upsert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("is_platform_admin");
    expect(profile).not.toHaveProperty("is_platform_admin");
  });
});
