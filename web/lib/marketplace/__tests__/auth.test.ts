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

import {
  exposesErrorDetailsToClient,
  getMarketplaceAuth,
  publicServerErrorBody,
  serverError,
} from "@/lib/marketplace/auth";

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

describe("serverError production sanitization (S17)", () => {
  it("hides Error.message and stacks from clients when NODE_ENV=production", () => {
    expect(exposesErrorDetailsToClient({ NODE_ENV: "production" })).toBe(false);

    const err = new Error("relation marketplace.operator_deals does not exist");
    err.stack = "Error: secret\n    at /app/lib/db.ts:12:3";

    const body = publicServerErrorBody("Failed to list deals.", err, {
      env: { NODE_ENV: "production" },
      includeStack: true,
    });

    expect(body).toEqual({
      error: "Failed to list deals.",
      code: "internal_error",
    });
    expect(body).not.toHaveProperty("message");
    expect(body).not.toHaveProperty("stack");
    expect(JSON.stringify(body)).not.toContain("operator_deals");
    expect(JSON.stringify(body)).not.toContain("secret");
  });

  it("includes detail (and optional stack) outside production for debugging", () => {
    expect(exposesErrorDetailsToClient({ NODE_ENV: "development" })).toBe(true);
    expect(exposesErrorDetailsToClient({ NODE_ENV: "test" })).toBe(true);

    const err = new Error("boom detail");
    err.stack = "Error: boom detail\n    at test.ts:1:1";

    expect(
      publicServerErrorBody("Failed to list deals.", err, {
        env: { NODE_ENV: "development" },
      })
    ).toEqual({
      error: "boom detail",
      code: "internal_error",
      message: "boom detail",
      context: "Failed to list deals.",
    });

    expect(
      publicServerErrorBody("Internal server error", err, {
        env: { NODE_ENV: "development" },
        includeStack: true,
      }).stack
    ).toContain("test.ts:1:1");
  });

  it("serverError returns 500 JSON and still logs the full error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("db connection refused at 10.0.0.5");

    const res = serverError("Failed to get deal.", err, {
      NODE_ENV: "production",
    });
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Failed to get deal.",
      code: "internal_error",
    });
    expect(spy).toHaveBeenCalledWith("Failed to get deal.", err);

    const devRes = serverError("Failed to get deal.", err, {
      NODE_ENV: "development",
    });
    await expect(devRes.json()).resolves.toMatchObject({
      error: "db connection refused at 10.0.0.5",
      message: "db connection refused at 10.0.0.5",
      context: "Failed to get deal.",
      code: "internal_error",
    });

    spy.mockRestore();
  });

  it("Viator sync/tags routes use serverError (no raw stack/message in production path)", () => {
    const syncSrc = readFileSync(
      path.resolve(__dirname, "../../../app/api/viator/tags/sync/route.ts"),
      "utf8"
    );
    const tagsSrc = readFileSync(
      path.resolve(__dirname, "../../../app/api/viator/tags/route.ts"),
      "utf8"
    );
    expect(syncSrc).toMatch(/from "@\/lib\/marketplace\/auth"/);
    expect(syncSrc).toMatch(/serverError\(/);
    expect(syncSrc).not.toMatch(/stack:\s*process\.env\.NODE_ENV/);
    expect(tagsSrc).toMatch(/return serverError\(/);
    expect(tagsSrc).toMatch(/exposesErrorDetailsToClient/);
    // Client JSON must not re-emit PostgREST error fields (server logs may still)
    expect(tagsSrc).not.toMatch(/message:\s*fetchAllError\.message/);
    expect(tagsSrc).not.toMatch(
      /return NextResponse\.json\(\s*\{[^}]*details:\s*testError/
    );
  });
});
