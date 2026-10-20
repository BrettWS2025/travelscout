"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { DealEditor } from "@/components/inventory/deal-editor/DealEditor";
import {
  getOperatorDeal,
  listMyOperators,
  type MyOperator,
} from "@/lib/marketplace/operator-deals-client";

export default function EditDealEditorPage() {
  const params = useParams<{ dealId: string }>();
  const dealId = params.dealId;
  const { session } = useAuth();
  const [operator, setOperator] = useState<MyOperator | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ operators }, detail] = await Promise.all([
          listMyOperators(session?.access_token),
          getOperatorDeal(dealId, session?.access_token),
        ]);
        if (cancelled) return;
        const match =
          operators.find((o) => o.id === detail.deal.operatorId) ??
          operators[0] ??
          null;
        if (!match) {
          setError("No operator membership found for this deal.");
        } else {
          setOperator(match);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load deal");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dealId, session?.access_token]);

  if (loading) {
    return (
      <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
        Loading deal…
      </p>
    );
  }

  if (error || !operator) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--ts-ink)]/15 bg-white/70 px-6 py-10 text-center">
        <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
          {error ?? "Deal unavailable."}
        </p>
        <a
          href="/account/inventory"
          className="mt-3 inline-block text-sm font-semibold text-[var(--ts-teal)]"
        >
          Back to inventory
        </a>
      </div>
    );
  }

  return <DealEditor operatorId={operator.id} dealId={dealId} />;
}
