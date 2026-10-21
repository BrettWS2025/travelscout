/**
 * Provider adapter registry (Chunk 26).
 *
 * getAdapter(provider) → implementation. Unknown providers throw.
 * FareHarbor / Bókun / Checkfront are "coming soon" (available:false).
 * Rezdy uses the mock adapter until Chunk 31 registers the real one,
 * unless a custom factory is installed via registerAdapterFactory.
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

export type AdapterFactory = () => ProviderAdapter;

const factories = new Map<IntegrationProvider, AdapterFactory>();

/** Shared mock used as the default rezdy adapter until Chunk 31. */
let defaultMock: MockAdapterController | null = null;

function getOrCreateDefaultMock(): MockAdapterController {
  if (!defaultMock) {
    defaultMock = createMockAdapter();
  }
  return defaultMock;
}

function defaultRezdyFactory(): ProviderAdapter {
  // Chunk 31 will replace this with RezdyAdapter. Until then the mock backs
  // rezdy so connect/sync/book-now flows and contract tests have a real target.
  return getOrCreateDefaultMock().adapter;
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
 * Replace or install the factory for a provider (tests / Chunk 31 Rezdy).
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
 * Clear all custom factories and the default mock singleton (test teardown).
 * Defaults re-apply lazily on the next getAdapter call.
 */
export function resetAdapterRegistry(): void {
  factories.clear();
  defaultMock = null;
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
