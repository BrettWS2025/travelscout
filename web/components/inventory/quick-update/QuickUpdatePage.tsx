"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AuthPageFrame,
  authLinkClassName,
  authPanelClassName,
  authPrimaryButtonClassName,
  authSecondaryButtonClassName,
} from "@/components/auth/AuthPageFrame";
import { SeatStepper } from "@/components/inventory/quick-update/SeatStepper";
import {
  formatQuickUpdateSessionLabel,
  getQuickUpdate,
  QuickUpdateApiError,
  submitQuickUpdate,
  type GetQuickUpdateResponse,
  type QuickUpdateDealAction,
  type QuickUpdateDealView,
} from "@/lib/marketplace/quick-update-client";
import { statusLabel } from "@/lib/marketplace/display-labels";

type Props = {
  token: string;
};

type DealDraftState = {
  action: QuickUpdateDealAction | null;
  seatsBySession: Record<string, number>;
};

type PagePhase =
  | { kind: "loading" }
  | { kind: "ready"; data: GetQuickUpdateResponse }
  | { kind: "empty"; data: GetQuickUpdateResponse }
  | { kind: "success"; resultsOk: number; resultsFail: number }
  | { kind: "token_error"; message: string; expiredOrUsed: boolean }
  | { kind: "error"; message: string };

function initialDrafts(
  deals: QuickUpdateDealView[]
): Record<string, DealDraftState> {
  const out: Record<string, DealDraftState> = {};
  for (const deal of deals) {
    const seatsBySession: Record<string, number> = {};
    for (const session of deal.sessions) {
      seatsBySession[session.id] =
        session.manual_seats_available ?? session.seats_displayed ?? 0;
    }
    out[deal.id] = { action: null, seatsBySession };
  }
  return out;
}

function statusBadge(deal: QuickUpdateDealView): string | null {
  if (deal.status === "auto_paused" && deal.pause_reason === "attestation_expired") {
    return "Needs Reconfirm";
  }
  if (deal.status === "live") return "Live";
  return statusLabel(deal.status);
}

export function QuickUpdatePage({ token }: Props) {
  const [phase, setPhase] = useState<PagePhase>({ kind: "loading" });
  const [drafts, setDrafts] = useState<Record<string, DealDraftState>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPhase({ kind: "loading" });
    setSubmitError(null);
    try {
      const data = await getQuickUpdate(token);
      setDrafts(initialDrafts(data.deals));
      if (data.deals.length === 0) {
        setPhase({ kind: "empty", data });
      } else {
        setPhase({ kind: "ready", data });
      }
    } catch (err) {
      if (err instanceof QuickUpdateApiError) {
        setPhase({
          kind: "token_error",
          message: err.message,
          expiredOrUsed: err.isExpiredOrUsed || err.isInvalidToken,
        });
        return;
      }
      setPhase({
        kind: "error",
        message: err instanceof Error ? err.message : "Failed to load",
      });
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const deals =
    phase.kind === "ready" || phase.kind === "empty" ? phase.data.deals : [];

  const allChosen = useMemo(() => {
    if (deals.length === 0) return false;
    return deals.every((d) => drafts[d.id]?.action != null);
  }, [deals, drafts]);

  function setSeats(dealId: string, sessionId: string, seats: number) {
    setDrafts((prev) => {
      const current = prev[dealId];
      if (!current) return prev;
      return {
        ...prev,
        [dealId]: {
          ...current,
          seatsBySession: { ...current.seatsBySession, [sessionId]: seats },
        },
      };
    });
  }

  function chooseAction(dealId: string, action: QuickUpdateDealAction) {
    setDrafts((prev) => {
      const current = prev[dealId];
      if (!current) return prev;
      const seatsBySession =
        action === "sold_out"
          ? Object.fromEntries(
              Object.keys(current.seatsBySession).map((id) => [id, 0])
            )
          : current.seatsBySession;
      return {
        ...prev,
        [dealId]: { ...current, action, seatsBySession },
      };
    });
  }

  async function confirmAll() {
    if (phase.kind !== "ready") return;
    const submissions = phase.data.deals
      .map((deal) => {
        const draft = drafts[deal.id];
        if (!draft?.action) return null;
        return {
          deal_id: deal.id,
          action: draft.action,
          seats_by_session:
            draft.action === "still_available"
              ? draft.seatsBySession
              : undefined,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s != null);

    if (submissions.length === 0) {
      setSubmitError("Choose Still available or Sold out for each deal.");
      return;
    }
    if (submissions.length < phase.data.deals.length) {
      setSubmitError("Choose Still available or Sold out for every deal before confirming.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await submitQuickUpdate(token, submissions);
      const resultsOk = result.results.filter((r) => r.ok).length;
      const resultsFail = result.results.filter((r) => !r.ok).length;
      setPhase({ kind: "success", resultsOk, resultsFail });
    } catch (err) {
      if (err instanceof QuickUpdateApiError) {
        if (err.isExpiredOrUsed || err.isInvalidToken) {
          setPhase({
            kind: "token_error",
            message: err.message,
            expiredOrUsed: true,
          });
        } else {
          setSubmitError(err.message);
        }
      } else {
        setSubmitError(
          err instanceof Error ? err.message : "Failed to submit updates"
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (phase.kind === "loading") {
    return (
      <AuthPageFrame
        eyebrow="Quick update"
        title={
          <>
            Checking your{" "}
            <span className="italic text-[var(--ts-teal)]">inventory…</span>
          </>
        }
        description="Loading deals that need a seat reconfirm."
      >
        <div className={authPanelClassName}>
          <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
            Loading…
          </p>
        </div>
      </AuthPageFrame>
    );
  }

  if (phase.kind === "token_error") {
    return (
      <AuthPageFrame
        eyebrow="Quick update"
        title={
          <>
            This link{" "}
            <span className="italic text-[var(--ts-teal)]">isn&apos;t valid.</span>
          </>
        }
        description={
          phase.expiredOrUsed
            ? "It may have expired or already been used. Sign in to reconfirm seats from your dashboard."
            : "We couldn't open this quick-update link."
        }
      >
        <div className={authPanelClassName}>
          <p
            role="alert"
            className="font-[family-name:var(--font-sora)] text-sm text-red-700"
          >
            {phase.message}
          </p>
          <Link
            href="/auth/login?returnTo=%2Faccount%2Finventory"
            className={`${authPrimaryButtonClassName} mt-4 inline-flex items-center justify-center text-center`}
          >
            Log in to dashboard
          </Link>
          <p className="mt-3 text-center">
            <Link href="/auth/login" className={authLinkClassName}>
              Or go to sign in
            </Link>
          </p>
        </div>
      </AuthPageFrame>
    );
  }

  if (phase.kind === "error") {
    return (
      <AuthPageFrame
        eyebrow="Quick update"
        title={
          <>
            Something{" "}
            <span className="italic text-[var(--ts-teal)]">went wrong.</span>
          </>
        }
        description="Try opening the link again from your reminder email or SMS."
      >
        <div className={authPanelClassName}>
          <p
            role="alert"
            className="font-[family-name:var(--font-sora)] text-sm text-red-700"
          >
            {phase.message}
          </p>
          <button
            type="button"
            className={`${authSecondaryButtonClassName} mt-4`}
            onClick={() => void load()}
          >
            Try again
          </button>
        </div>
      </AuthPageFrame>
    );
  }

  if (phase.kind === "success") {
    return (
      <AuthPageFrame
        eyebrow="Quick update"
        title={
          <>
            Seats{" "}
            <span className="italic text-[var(--ts-teal)]">updated.</span>
          </>
        }
        description={
          phase.resultsFail > 0
            ? `${phase.resultsOk} deal${phase.resultsOk === 1 ? "" : "s"} updated. ${phase.resultsFail} need attention in the dashboard.`
            : "Thanks — your inventory is reconfirmed. Live deals are visible again where checks pass."
        }
      >
        <div className={authPanelClassName}>
          <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
            You can close this page. This link can&apos;t be used again.
          </p>
          <Link
            href="/auth/login?returnTo=%2Faccount%2Finventory"
            className={`${authPrimaryButtonClassName} mt-4 inline-flex items-center justify-center text-center`}
          >
            Open inventory
          </Link>
        </div>
      </AuthPageFrame>
    );
  }

  if (phase.kind === "empty") {
    return (
      <AuthPageFrame
        eyebrow="Quick update"
        title={
          <>
            Nothing needs{" "}
            <span className="italic text-[var(--ts-teal)]">reconfirming.</span>
          </>
        }
        description="There are no live or attestation-paused manual deals for this link right now."
      >
        <div className={authPanelClassName}>
          <Link
            href="/auth/login?returnTo=%2Faccount%2Finventory"
            className={`${authPrimaryButtonClassName} inline-flex items-center justify-center text-center`}
          >
            Log in to dashboard
          </Link>
        </div>
      </AuthPageFrame>
    );
  }

  // ready
  return (
    <AuthPageFrame
      eyebrow="Quick update"
      title={
        <>
          Reconfirm{" "}
          <span className="italic text-[var(--ts-teal)]">seats.</span>
        </>
      }
      description="Adjust seats per session, then mark each deal Still available or Sold out. Confirm once — this link is single-use."
    >
      <div className="space-y-4">
        {phase.data.deals.map((deal) => {
          const draft = drafts[deal.id];
          const badge = statusBadge(deal);
          const chosen = draft?.action;
          return (
            <section
              key={deal.id}
              className={authPanelClassName}
              aria-labelledby={`deal-${deal.id}-title`}
            >
              <div className="flex items-start justify-between gap-3">
                <h2
                  id={`deal-${deal.id}-title`}
                  className="font-[family-name:var(--font-instrument)] text-2xl leading-tight text-[var(--ts-ink)]"
                >
                  {deal.title?.trim() || "Untitled deal"}
                </h2>
                {badge ? (
                  <span className="shrink-0 rounded-lg bg-[var(--ts-mist)] px-2 py-1 font-[family-name:var(--font-sora)] text-[11px] font-semibold uppercase tracking-wide text-[var(--ts-teal)]">
                    {badge}
                  </span>
                ) : null}
              </div>

              {deal.sessions.length === 0 ? (
                <p className="mt-3 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
                  No sessions on this deal.
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {deal.sessions.map((session) => (
                    <li key={session.id}>
                      <SeatStepper
                        id={`seats-${deal.id}-${session.id}`}
                        label={formatQuickUpdateSessionLabel(session.start_at)}
                        value={draft?.seatsBySession[session.id] ?? 0}
                        disabled={submitting || chosen === "sold_out"}
                        onChange={(n) => setSeats(deal.id, session.id, n)}
                      />
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={submitting}
                  aria-pressed={chosen === "still_available"}
                  onClick={() => chooseAction(deal.id, "still_available")}
                  className={
                    chosen === "still_available"
                      ? authPrimaryButtonClassName
                      : authSecondaryButtonClassName
                  }
                >
                  Still available
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  aria-pressed={chosen === "sold_out"}
                  onClick={() => chooseAction(deal.id, "sold_out")}
                  className={
                    chosen === "sold_out"
                      ? "w-full rounded-xl bg-[var(--ts-ink)] px-5 py-3.5 font-[family-name:var(--font-sora)] text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                      : authSecondaryButtonClassName
                  }
                >
                  Sold out
                </button>
              </div>
            </section>
          );
        })}

        {submitError ? (
          <p
            role="alert"
            className="font-[family-name:var(--font-sora)] text-sm text-red-700"
          >
            {submitError}
          </p>
        ) : null}

        <button
          type="button"
          disabled={submitting || !allChosen}
          onClick={() => void confirmAll()}
          className={authPrimaryButtonClassName}
        >
          {submitting
            ? "Updating…"
            : allChosen
              ? `Confirm ${phase.data.deals.length} update${phase.data.deals.length === 1 ? "" : "s"}`
              : "Choose an action for each deal"}
        </button>
      </div>
    </AuthPageFrame>
  );
}
