"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import {
  listMyOperators,
  type MyOperator,
} from "@/lib/marketplace/operator-deals-client";

export default function AccountInventoryPage() {
  const { session } = useAuth();
  const [operator, setOperator] = useState<MyOperator | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { operators } = await listMyOperators(session?.access_token);
        if (!cancelled) setOperator(operators[0] ?? null);
      } catch {
        if (!cancelled) setOperator(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-[family-name:var(--font-instrument)] text-3xl text-[var(--ts-ink)]">
          Inventory
        </h2>
        <Link
          href="/account/inventory/deals/new"
          className="rounded-xl bg-[var(--ts-teal)] px-4 py-2.5 font-[family-name:var(--font-sora)] text-sm font-semibold text-white shadow-[0_12px_30px_rgba(14,124,102,0.25)]"
        >
          Create deal
        </Link>
      </div>

      <div className="rounded-2xl border border-dashed border-[var(--ts-ink)]/15 bg-white/70 px-6 py-12 text-center shadow-[0_16px_40px_rgba(16,36,28,0.04)]">
        {loading ? (
          <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
            Loading…
          </p>
        ) : (
          <>
            <p className="font-[family-name:var(--font-sora)] text-sm font-medium text-[var(--ts-ink)]">
              {operator
                ? `${operator.tradingName} — deal editor is ready`
                : "Create your first deal"}
            </p>
            <p className="mt-2 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
              The deals list UI lands in the next chunk. Use Create deal to open
              the manual editor.
            </p>
            <Link
              href="/account/inventory/deals/new"
              className="mt-5 inline-block font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-teal)]"
            >
              Open deal editor →
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
