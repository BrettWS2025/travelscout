/**
 * Typed errors for the provider adapter registry (Chunk 26).
 */

export class UnknownProviderError extends Error {
  readonly provider: string;

  constructor(provider: string) {
    super(`Unknown booking provider: ${provider}`);
    this.name = "UnknownProviderError";
    this.provider = provider;
  }
}

export class AdapterNotImplementedError extends Error {
  readonly provider: string;

  constructor(provider: string, detail?: string) {
    const suffix = detail ? `: ${detail}` : "";
    super(
      `Provider adapter for "${provider}" is not implemented yet${suffix}`
    );
    this.name = "AdapterNotImplementedError";
    this.provider = provider;
  }
}

export class AdapterOperationError extends Error {
  readonly provider: string;
  readonly code: string;

  constructor(provider: string, code: string, message: string) {
    super(message);
    this.name = "AdapterOperationError";
    this.provider = provider;
    this.code = code;
  }
}
