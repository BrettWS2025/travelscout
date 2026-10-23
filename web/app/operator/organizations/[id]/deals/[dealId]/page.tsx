import { redirect } from "next/navigation";

/** Legacy org deal editor — use Account → Inventory instead. */
export default function OrganizationDealDetailPage() {
  redirect("/account/inventory");
}
