/**
 * Security S11: production must not fall back to hardcoded HMAC / encryption keys.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  DealAttestationError,
  resolveQuickUpdateTokenSecret,
} from "@/lib/marketplace/deal-attestation";
import {
  ensureIntegrationSecretsConfigured,
  IntegrationConnectError,
  resetIntegrationSecretsBootstrap,
} from "@/lib/marketplace/integration-connect";
import {
  allowsDevSecretFallback,
  resetSecretsConfig,
  resolveSecretsKey,
  SecretsConfigError,
} from "@/lib/marketplace/secrets";
import {
  resolveTeamInviteTokenSecret,
  TeamError,
} from "@/lib/marketplace/team";

const TEST_KEY_HEX =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

afterEach(() => {
  resetIntegrationSecretsBootstrap();
  resetSecretsConfig();
});

describe("Security S11 allowsDevSecretFallback", () => {
  it("allows test, development, and DEAL_PLATFORM_SEED=1 only", () => {
    expect(allowsDevSecretFallback({ NODE_ENV: "test" })).toBe(true);
    expect(allowsDevSecretFallback({ NODE_ENV: "development" })).toBe(true);
    expect(
      allowsDevSecretFallback({
        NODE_ENV: "production",
        DEAL_PLATFORM_SEED: "1",
      })
    ).toBe(true);
    expect(allowsDevSecretFallback({ NODE_ENV: "production" })).toBe(false);
    expect(allowsDevSecretFallback({})).toBe(false);
  });
});

describe("Security S11 resolveQuickUpdateTokenSecret", () => {
  it("fails closed in production when secrets are unset", () => {
    expect(() =>
      resolveQuickUpdateTokenSecret({ NODE_ENV: "production" })
    ).toThrow(DealAttestationError);
    try {
      resolveQuickUpdateTokenSecret({ NODE_ENV: "production" });
    } catch (err) {
      expect(err).toBeInstanceOf(DealAttestationError);
      expect((err as DealAttestationError).status).toBe(503);
    }
  });

  it("uses explicit env secret in production", () => {
    expect(
      resolveQuickUpdateTokenSecret({
        NODE_ENV: "production",
        QUICK_UPDATE_TOKEN_SECRET: "prod-quick-update-secret",
      })
    ).toBe("prod-quick-update-secret");
  });

  it("allows the explicit dev fallback in development and test", () => {
    expect(resolveQuickUpdateTokenSecret({ NODE_ENV: "development" })).toBe(
      "dev-quick-update-token-secret"
    );
    expect(resolveQuickUpdateTokenSecret({ NODE_ENV: "test" })).toBe(
      "dev-quick-update-token-secret"
    );
  });
});

describe("Security S11 resolveTeamInviteTokenSecret", () => {
  it("fails closed in production when secrets are unset", () => {
    expect(() =>
      resolveTeamInviteTokenSecret({ NODE_ENV: "production" })
    ).toThrow(TeamError);
    try {
      resolveTeamInviteTokenSecret({ NODE_ENV: "production" });
    } catch (err) {
      expect(err).toBeInstanceOf(TeamError);
      expect((err as TeamError).status).toBe(503);
      expect((err as TeamError).code).toBe("secrets_not_configured");
    }
  });

  it("uses explicit env secret in production", () => {
    expect(
      resolveTeamInviteTokenSecret({
        NODE_ENV: "production",
        TEAM_INVITE_TOKEN_SECRET: "prod-team-invite-secret",
      })
    ).toBe("prod-team-invite-secret");
  });

  it("allows the explicit dev fallback in development and test", () => {
    expect(resolveTeamInviteTokenSecret({ NODE_ENV: "development" })).toBe(
      "dev-team-invite-token-secret"
    );
    expect(resolveTeamInviteTokenSecret({ NODE_ENV: "test" })).toBe(
      "dev-team-invite-token-secret"
    );
  });
});

describe("Security S11 SECRETS_ENCRYPTION_KEY / DEV_TEST_KEY", () => {
  it("resolveSecretsKey always fails closed when unset", () => {
    expect(() => resolveSecretsKey({})).toThrow(SecretsConfigError);
    expect(() =>
      resolveSecretsKey({ NODE_ENV: "production" })
    ).toThrow(SecretsConfigError);
    expect(() => resolveSecretsKey({ NODE_ENV: "test" })).toThrow(
      SecretsConfigError
    );
  });

  it("ensureIntegrationSecretsConfigured rejects production without key", () => {
    expect(() =>
      ensureIntegrationSecretsConfigured({ NODE_ENV: "production" })
    ).toThrow(IntegrationConnectError);
    try {
      ensureIntegrationSecretsConfigured({ NODE_ENV: "production" });
    } catch (err) {
      expect(err).toBeInstanceOf(IntegrationConnectError);
      expect((err as IntegrationConnectError).status).toBe(503);
      expect((err as IntegrationConnectError).code).toBe(
        "secrets_not_configured"
      );
    }
  });

  it("ensureIntegrationSecretsConfigured accepts production with key", () => {
    expect(() =>
      ensureIntegrationSecretsConfigured({
        NODE_ENV: "production",
        SECRETS_ENCRYPTION_KEY: TEST_KEY_HEX,
      })
    ).not.toThrow();
  });

  it("ensureIntegrationSecretsConfigured allows DEV_TEST_KEY in development", () => {
    expect(() =>
      ensureIntegrationSecretsConfigured({ NODE_ENV: "development" })
    ).not.toThrow();
  });
});
