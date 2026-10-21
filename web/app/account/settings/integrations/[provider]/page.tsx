"use client";

import { IntegrationDetail } from "@/components/settings/integrations/IntegrationDetail";

type Props = { params: { provider: string } };

export default function AccountIntegrationProviderPage({ params }: Props) {
  return <IntegrationDetail provider={params.provider} />;
}
