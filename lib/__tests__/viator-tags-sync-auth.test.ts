import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { requireViatorTagsSyncAuth } from "@/lib/viator-tags-sync-auth";

describe("requireViatorTagsSyncAuth", () => {
  const prev = process.env.VIATOR_TAGS_SYNC_SECRET;

  beforeEach(() => {
    process.env.VIATOR_TAGS_SYNC_SECRET = "test-secret-value";
  });

  afterEach(() => {
    if (prev === undefined) {
      delete process.env.VIATOR_TAGS_SYNC_SECRET;
    } else {
      process.env.VIATOR_TAGS_SYNC_SECRET = prev;
    }
  });

  it("returns null when Authorization Bearer matches", () => {
    const req = new Request("https://example.com/api/viator/tags/sync", {
      headers: { Authorization: "Bearer test-secret-value" },
    });
    expect(requireViatorTagsSyncAuth(req)).toBeNull();
  });

  it("returns null when x-viator-tags-sync-secret matches", () => {
    const req = new Request("https://example.com/api/viator/tags/sync", {
      headers: { "x-viator-tags-sync-secret": "test-secret-value" },
    });
    expect(requireViatorTagsSyncAuth(req)).toBeNull();
  });

  it("returns 401 when secret is wrong", () => {
    const req = new Request("https://example.com/api/viator/tags/sync", {
      headers: { Authorization: "Bearer wrong" },
    });
    const res = requireViatorTagsSyncAuth(req);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("returns 503 when VIATOR_TAGS_SYNC_SECRET is not set", () => {
    delete process.env.VIATOR_TAGS_SYNC_SECRET;
    const req = new Request("https://example.com/api/viator/tags/sync");
    const res = requireViatorTagsSyncAuth(req);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(503);
  });
});
