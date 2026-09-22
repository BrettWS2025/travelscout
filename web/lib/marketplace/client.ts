// lib/marketplace/client.ts
// Browser helper for marketplace API routes.

import type {
  CreateDealInput,
  CreateOrganizationInput,
  Deal,
  Organization,
  UpdateDealInput,
} from "./types";

export class MarketplaceApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "MarketplaceApiError";
    this.status = status;
  }
}

async function marketplaceFetch<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    accessToken?: string | null;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.accessToken) {
    headers.Authorization = `Bearer ${options.accessToken}`;
  }

  const res = await fetch(path, {
    method: options.method || "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    credentials: "same-origin",
  });

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  if (!res.ok) {
    const message =
      (data as { error?: string; message?: string } | null)?.error ||
      (data as { message?: string } | null)?.message ||
      `Request failed (${res.status})`;
    throw new MarketplaceApiError(message, res.status);
  }

  return data as T;
}

export function listMyOrganizations(accessToken?: string | null) {
  return marketplaceFetch<{ organizations: Organization[] }>(
    "/api/marketplace/organizations",
    { accessToken }
  );
}

export function createOrganization(
  input: CreateOrganizationInput,
  accessToken?: string | null
) {
  return marketplaceFetch<{ organization: Organization }>(
    "/api/marketplace/organizations",
    { method: "POST", body: input, accessToken }
  );
}

export function getOrganization(id: string, accessToken?: string | null) {
  return marketplaceFetch<{ organization: Organization }>(
    `/api/marketplace/organizations/${id}`,
    { accessToken }
  );
}

export function listOrganizationDeals(
  organizationId: string,
  accessToken?: string | null
) {
  return marketplaceFetch<{ deals: Deal[] }>(
    `/api/marketplace/deals?organizationId=${encodeURIComponent(organizationId)}`,
    { accessToken }
  );
}

export function createDeal(input: CreateDealInput, accessToken?: string | null) {
  return marketplaceFetch<{ deal: Deal }>("/api/marketplace/deals", {
    method: "POST",
    body: input,
    accessToken,
  });
}

export function getDeal(id: string, accessToken?: string | null) {
  return marketplaceFetch<{ deal: Deal }>(`/api/marketplace/deals/${id}`, {
    accessToken,
  });
}

export function updateDeal(
  id: string,
  input: UpdateDealInput,
  accessToken?: string | null
) {
  return marketplaceFetch<{ deal: Deal }>(`/api/marketplace/deals/${id}`, {
    method: "PATCH",
    body: input,
    accessToken,
  });
}

export function deleteDeal(id: string, accessToken?: string | null) {
  return marketplaceFetch<{ ok: boolean }>(`/api/marketplace/deals/${id}`, {
    method: "DELETE",
    accessToken,
  });
}
