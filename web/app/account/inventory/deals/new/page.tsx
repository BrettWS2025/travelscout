"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { DealEditor } from "@/components/inventory/deal-editor/DealEditor";
import {
  listMyOperators,
  type MyOperator,
} from "@/lib/marketplace/operator-deals-client";

export default function NewDealEditorPage() {
  const { session } = useAuth();
  const [operator, setOperator] = useState<MyOperator | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { operators } = await listMyOperators(session?.access_token);
        if (cancelled) return;
        if (operators.length === 0) {
          setError(
            "No operator membership found. Seed Harbour Kayaks or join a team."
          );
        } else {
          setOperator(operators[0]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  if (loading) {
    return (
      <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
        Loading…
      </p>
    );
  }

  if (error || !operator) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--ts-ink)]/15 bg-white/70 px-6 py-10 text-center">
        <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-ink)]">
          {error ?? "No operator available."}
        </p>
      </div>
    );
  }

  return <DealEditor operatorId={operator.id} />;
}
