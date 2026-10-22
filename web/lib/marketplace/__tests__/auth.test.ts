import { readFileSync } from "fs";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";

const mockGetServerUser = vi.fn();
const mockGetUser = vi.fn();
const mockGetSession = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  getServerUser: (...args: unknown[]) => mockGetServerUser(...args),
  createServerClient: () => ({
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  }),
}));

import { getMarketplaceAuth } from "@/lib/marketplace/auth";

const AUTH_SOURCE = path.resolve(__dirname, "../auth.ts");
const SERVER_SOURCE = path.resolve(__dirname, "../../supabase/server.ts");

function fakeUser(id = "user-1"): User {
  return {
    id,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "",
  } as User;
}

describe("getMarketplaceAuth", () => {
  beforeEach(() => {
    mockGetServerUser.mockReset();
    mockGetUser.mockReset();
    mockGetSession.mockReset();
  });

  it("bearer header: validates with getServerUser(token) and returns that token", async () => {
    const user = fakeUser("bearer-user");
    mockGetServerUser.mockResolvedValue(user);

    const req = new Request("https://example.com/api/marketplace/operators/me", {
      headers: { Authorization: "Bearer header-jwt" },
    });
    const result = await getMarketplaceAuth(req);

    expect(mockGetServerUser).toHaveBeenCalledWith("header-jwt");
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(result).toEqual({ user, accessToken: "header-jwt" });
  });

  it("bearer header: rejected when getServerUser returns null", async () => {
    mockGetServerUser.mockResolvedValue(null);

    const req = new Request("https://example.com/api", {
      headers: { Authorization: "Bearer bad-jwt" },
    });
    const result = await getMarketplaceAuth(req);

    expect(result).toEqual({ user: null, accessToken: "bad-jwt" });
  });

  it("cookie path: valid getUser authenticates and returns session access token", async () => {
    const user = fakeUser("cookie-user");
    mockGetUser.mockResolvedValue({ data: { user }, error: null });
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "cookie-jwt", user } },
      error: null,
    });

    const result = await getMarketplaceAuth(
      new Request("https://example.com/api/marketplace/operators/me")
    );

    expect(mockGetServerUser).not.toHaveBeenCalled();
    expect(mockGetUser).toHaveBeenCalled();
    expect(result).toEqual({ user, accessToken: "cookie-jwt" });
  });

  it("cookie path: rejects when getUser fails even if getSession has a stale user", async () => {
    const stale = fakeUser("stale-user");
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid JWT" },
    });
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "stale-jwt", user: stale } },
      error: null,
    });

    const result = await getMarketplaceAuth(
      new Request("https://example.com/api/marketplace/operators/me")
    );

    expect(result).toEqual({ user: null });
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it("cookie path: rejects when getUser returns null user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const result = await getMarketplaceAuth(
      new Request("https://example.com/api")
    );

    expect(result).toEqual({ user: null });
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it("cookie path: returns null on createServerClient/getUser throw", async () => {
    mockGetUser.mockRejectedValue(new Error("cookies unavailable"));

    const result = await getMarketplaceAuth(
      new Request("https://example.com/api")
    );

    expect(result).toEqual({ user: null });
  });
});

describe("server cookie auth source (S1)", () => {
  it("marketplace auth cookie path uses getUser before trusting identity", () => {
    const src = readFileSync(AUTH_SOURCE, "utf8");
    expect(src).toMatch(/auth\.getUser\(\)/);
    // Must not authorize from session.user without a prior getUser check
    expect(src).not.toMatch(/user:\s*session\?\.user/);
  });

  it("getServerUser cookie fallback uses getUser not getSession", () => {
    const src = readFileSync(SERVER_SOURCE, "utf8");
    // Cookie branch inside getServerUser
    const cookieBranch = src.slice(src.indexOf("Cookie path:"));
    expect(cookieBranch).toMatch(/auth\.getUser\(\)/);
    expect(cookieBranch).not.toMatch(/auth\.getSession\(\)/);
    expect(cookieBranch).not.toMatch(/session\.user/);
  });
});
