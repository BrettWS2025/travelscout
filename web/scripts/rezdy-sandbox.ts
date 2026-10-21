/**
 * Optional manual script — hit a real Rezdy sandbox/test account (Chunk 31).
 *
 * Usage (from web/):
 *   REZDY_API_KEY=... npx tsx scripts/rezdy-sandbox.ts
 *   REZDY_API_KEY=... REZDY_STAGING=1 npx tsx scripts/rezdy-sandbox.ts
 *
 * Never commit API keys. This script is not run in CI.
 */

import {
  configureSecrets,
  createMemorySecretBackend,
  createSecretsHelper,
} from "../lib/marketplace/secrets";
import {
  createRezdyAdapter,
  REZDY_STAGING_BASE,
  REZDY_PRODUCTION_BASE,
} from "../lib/marketplace/providers/rezdy";
import type { Integration } from "../lib/marketplace/integration";
import { getPlatformConfig } from "../lib/marketplace/config";

async function main(): Promise<void> {
  const apiKey = process.env.REZDY_API_KEY?.trim();
  if (!apiKey) {
    console.error(
      "Set REZDY_API_KEY to a Supplier API key (Integrations → Rezdy API)."
    );
    process.exit(1);
  }

  const useStaging =
    process.env.REZDY_STAGING === "1" ||
    process.env.REZDY_STAGING === "true";
  const baseUrl =
    process.env.REZDY_BASE_URL?.trim() ||
    (useStaging ? REZDY_STAGING_BASE : REZDY_PRODUCTION_BASE);

  const keyHex =
    process.env.SECRETS_ENCRYPTION_KEY?.trim() ||
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  configureSecrets(
    createSecretsHelper({
      backend: createMemorySecretBackend(),
      key: Buffer.from(keyHex, "hex"),
    })
  );

  const adapter = createRezdyAdapter({ defaultBaseUrl: baseUrl });
  console.log(`Connecting to ${baseUrl} …`);
  const connected = await adapter.connect({
    api_key: apiKey,
    base_url: baseUrl,
  });
  console.log("Connected:", {
    external_account_id: connected.external_account_id,
    external_account_name: connected.external_account_name,
    booking_base_url: connected.booking_base_url,
  });

  const now = new Date().toISOString();
  const integration: Integration = {
    id: "sandbox",
    operatorId: "sandbox",
    provider: "rezdy",
    status: "connected",
    authType: "api_key",
    credentialsRef: connected.credentials_ref,
    webhookSecretRef: connected.webhook_secret_ref ?? null,
    externalAccountId: connected.external_account_id,
    externalAccountName: connected.external_account_name,
    syncMode: "hybrid",
    pollIntervalSeconds: 300,
    webhookLastReceivedAt: null,
    lastSyncAt: null,
    lastSuccessfulSyncAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    defaultBookingDestinationType: "provider_booking_page",
    bookingBaseUrl: connected.booking_base_url ?? null,
    conversionTrackingMethod: "none",
    bookingSourceLabel: null,
    autoEnableNewProducts: false,
    connectedAt: now,
    connectedBy: null,
    createdAt: now,
    updatedAt: now,
  };

  const test = await adapter.testConnection(integration);
  console.log("testConnection:", test);

  const products = await adapter.listProducts(integration);
  console.log(`Products: ${products.length}`);
  for (const p of products.slice(0, 10)) {
    console.log(
      `  - ${p.external_id}  ${p.name}  options=${p.price_options.length}  archived=${p.archived}`
    );
  }

  const { MAX_LEAD_HOURS } = getPlatformConfig();
  const from = new Date();
  const to = new Date(from.getTime() + MAX_LEAD_HOURS * 60 * 60 * 1000);
  const sample = products.find((p) => !p.archived) ?? products[0];
  if (sample) {
    const sessions = await adapter.listSessions(
      integration,
      sample.external_id,
      from,
      to
    );
    console.log(
      `Sessions for ${sample.external_id} in next ${MAX_LEAD_HOURS}h: ${sessions.length}`
    );
    for (const s of sessions.slice(0, 8)) {
      console.log(
        `  - ${s.external_id}  ${s.start_at}  seats=${s.seats_available}  ${s.status}`
      );
    }
    console.log(
      "Booking URL:",
      adapter.buildBookingUrl(integration, sample, sessions[0])
    );
  }

  console.log("Done. (Credentials stayed in-process memory only.)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
