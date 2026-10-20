import type { Metadata } from "next";
import { QuickUpdatePage } from "@/components/inventory/quick-update/QuickUpdatePage";

export const metadata: Metadata = {
  title: "Reconfirm seats",
  description:
    "Quick update for manual deal availability — no login required with a valid reminder link.",
  robots: { index: false, follow: false },
};

type Params = { params: { token: string } };

/**
 * Chunk 24: mobile reconfirm page for attestation reminders.
 * Path matches `buildQuickUpdatePath` → `/quick-update/:token`.
 */
export default function QuickUpdateTokenPage({ params }: Params) {
  let token = params.token ?? "";
  try {
    token = decodeURIComponent(token);
  } catch {
    // keep raw
  }

  return <QuickUpdatePage token={token} />;
}
