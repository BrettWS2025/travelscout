/**
 * Provider adapter registry (Chunk 26 + 31).
 *
 * getAdapter(provider) → implementation. Unknown providers throw.
 * FareHarbor / Bókun / Checkfront are "coming soon" (available:false).
 * Rezdy uses RezdyAdapter by default; set REZDY_USE_MOCK=1 (or register a
 * factory) to keep the controllable mock for local/dev without an API key.
 */

import {
  INTEGRATION_PROVIDERS,
  isIntegrationProvider,
  type IntegrationProvider,
} from "../enums";
import type { ProviderAdapter } from "./adapter";
import {
  COMING_SOON_PROVIDERS,
  createComingSoonAdapter,
  isComingSoonProvider,
} from "./coming-soon";
import { UnknownProviderError } from "./errors";
import {
  createMockAdapter,
  type MockAdapterController,
} from "./mock";
import { getRezdyAdapter, resetRezdyAdapterSingleton } from "./rezdy";

export type AdapterFactory = () => ProviderAdapter;

const factories = new Map<IntegrationProvider, AdapterFactory>();

/** Shared mock when REZDY_USE_MOCK is enabled or tests ask for it. */
let defaultMock: MockAdapterController | null = null;

function useMockRezdy(): boolean {
  const flag = process.env.REZDY_USE_MOCK?.trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

function getOrCreateDefaultMock(): MockAdapterController {
  if (!defaultMock) {
    defaultMock = createMockAdapter();
  }
  return defaultMock;
}

function defaultRezdyFactory(): ProviderAdapter {
  if (useMockRezdy()) {
    return getOrCreateDefaultMock().adapter;
  }
  return getRezdyAdapter();
}

/** Access the default mock controller (dev/tests). Creates it if needed. */
export function getDefaultMockController(): MockAdapterController {
  ensureDefaultsRegistered();
  return getOrCreateDefaultMock();
}

function ensureDefaultsRegistered(): void {
  if (!factories.has("rezdy")) {
    factories.set("rezdy", defaultRezdyFactory);
  }
  for (const provider of COMING_SOON_PROVIDERS) {
    if (!factories.has(provider)) {
      factories.set(provider, () => createComingSoonAdapter(provider));
    }
  }
}

/**
 * Replace or install the factory for a provider (tests / custom wiring).
 * Pass null to clear and restore the default on next getAdapter.
 */
export function registerAdapterFactory(
  provider: IntegrationProvider,
  factory: AdapterFactory | null
): void {
  if (!isIntegrationProvider(provider)) {
    throw new UnknownProviderError(provider);
  }
  if (factory === null) {
    factories.delete(provider);
    return;
  }
  factories.set(provider, factory);
}

/**
 * Clear all custom factories and the default mock / Rezdy singletons
 * (test teardown). Defaults re-apply lazily on the next getAdapter call.
 */
export function resetAdapterRegistry(): void {
  factories.clear();
  defaultMock = null;
  resetRezdyAdapterSingleton();
}

/**
 * Resolve the adapter for an integration provider.
 * @throws UnknownProviderError for unknown / manual providers
 */
export function getAdapter(provider: string): ProviderAdapter {
  if (!isIntegrationProvider(provider)) {
    throw new UnknownProviderError(provider);
  }
  ensureDefaultsRegistered();
  const factory = factories.get(provider);
  if (!factory) {
    throw new UnknownProviderError(provider);
  }
  return factory();
}

/** Providers the Settings UI can show cards for. */
export function listRegisteredProviders(): IntegrationProvider[] {
  ensureDefaultsRegistered();
  return [...INTEGRATION_PROVIDERS];
}

/** True when the adapter reports available:false (coming soon). */
export function isProviderAvailable(provider: string): boolean {
  if (!isIntegrationProvider(provider)) return false;
  if (isComingSoonProvider(provider)) return false;
  try {
    return getAdapter(provider).capabilities().available;
  } catch {
    return false;
  }
}
