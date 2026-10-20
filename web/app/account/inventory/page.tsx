"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { DealsList } from "@/components/inventory/deals-list/DealsList";
import { isDealListTab, type DealListTab } from "@/lib/marketplace/deal-list";

function InventoryPageInner() {
  const params = useSearchParams();
  const tabRaw = params.get("tab");
  const initialTab: DealListTab | undefined =
    tabRaw && isDealListTab(tabRaw) ? tabRaw : undefined;
  return <DealsList initialTab={initialTab} />;
}

export default function AccountInventoryPage() {
  return (
    <Suspense
      fallback={
        <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          Loading inventory…
        </p>
      }
    >
      <InventoryPageInner />
    </Suspense>
  );
}
