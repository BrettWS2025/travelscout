"use client";

import { AutoDealRuleEditor } from "@/components/inventory/auto-deal-rules/AutoDealRuleEditor";

type Props = { params: { ruleId: string } };

export default function AccountInventoryEditAutoDealRulePage({ params }: Props) {
  return <AutoDealRuleEditor ruleId={params.ruleId} />;
}
