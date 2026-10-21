"use client";

import { DealStatsPage } from "@/components/inventory/deal-stats/DealStatsPage";

type Props = { params: { dealId: string } };

export default function AccountDealStatsPage({ params }: Props) {
  return <DealStatsPage dealId={params.dealId} />;
}
