import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureUserProfile } from "@/lib/profiles";

const maybeSingle = vi.fn();
const upsertMaybeSingle = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle,
        }),
      }),
      upsert: () => ({
        select: () => ({
          maybeSingle: upsertMaybeSingle,
        }),
      }),
    }),
  },
}));

describe("ensureUserProfile", () => {
  beforeEach(() => {
    maybeSingle.mockReset();
    upsertMaybeSingle.mockReset();
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
    expect(upsertMaybeSingle).not.toHaveBeenCalled();
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
});
