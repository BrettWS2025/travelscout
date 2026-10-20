/**
 * Browser client for Chunk 20/24 quick-update (no login).
 * GET|POST /api/marketplace/quick-update/:token
 */

import type { Deal } from "./deal";
import type { DealAttestation } from "./deal-audit";
import type { PauseReason } from "./enums";
import type { SessionStatus } from "./enums";

export type QuickUpdateDealAction = "still_available" | "sold_out";

export type QuickUpdateSessionView = {
  id: string;
  start_at: string;
  end_at: string | null;
  manual_seats_available: number | null;
  seats_displayed: number | null;
  status: SessionStatus;
};

export type QuickUpdateDealView = {
  id: string;
  title: string | null;
  status: Deal["status"];
  pause_reason: PauseReason | null;
  attestation_expires_at: string | null;
  sessions: QuickUpdateSessionView[];
};

export type GetQuickUpdateResponse = {
  operator_id: string;
  token_expires_at: string;
  deals: QuickUpdateDealView[];
};

export type QuickUpdateDealSubmission = {
  deal_id: string;
  action: QuickUpdateDealAction;
  seats_by_session?: Record<string, number>;
};

export type SubmitQuickUpdateDealResult = {
  deal_id: string;
  ok: boolean;
  error?: string;
  deal?: Deal;
  attestation?: DealAttestation | null;
};

export type SubmitQuickUpdateResponse = {
  token: {
    id: string;
    operator_id: string;
    expires_at: string;
    used_at: string | null;
  };
  results: SubmitQuickUpdateDealResult[];
};

export class QuickUpdateApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "QuickUpdateApiError";
    this.status = status;
  }

  get isExpiredOrUsed(): boolean {
    return this.status === 410;
  }

  get isInvalidToken(): boolean {
    return this.status === 401 || this.status === 404;
  }
}

async function quickUpdateFetch<T>(
  token: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const encoded = encodeURIComponent(token);
  const res = await fetch(`/api/marketplace/quick-update/${encoded}`, {
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      ...(options.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
    },
    body:
      options.body !== undefined ? JSON.stringify(options.body) : undefined,
    credentials: "same-origin",
  });

  const text = await res.text();
  let data: Record<string, unknown> | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = { error: text };
    }
  }

  if (!res.ok) {
    const message =
      (data?.error as string | undefined) ||
      (data?.message as string | undefined) ||
      `Request failed (${res.status})`;
    throw new QuickUpdateApiError(message, res.status);
  }

  return data as T;
}

export function getQuickUpdate(token: string): Promise<GetQuickUpdateResponse> {
  return quickUpdateFetch<GetQuickUpdateResponse>(token);
}

export function submitQuickUpdate(
  token: string,
  deals: QuickUpdateDealSubmission[]
): Promise<SubmitQuickUpdateResponse> {
  return quickUpdateFetch<SubmitQuickUpdateResponse>(token, {
    method: "POST",
    body: { deals },
  });
}

/** Format a session start for mobile display (operator-local when timezone known). */
export function formatQuickUpdateSessionLabel(
  startAt: string,
  timeZone = "Pacific/Auckland"
): string {
  const date = new Date(startAt);
  if (Number.isNaN(date.getTime())) return startAt;
  try {
    return new Intl.DateTimeFormat("en-NZ", {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}
