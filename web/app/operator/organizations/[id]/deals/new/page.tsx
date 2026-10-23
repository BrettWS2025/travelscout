import { redirect } from "next/navigation";

/** Legacy org deal create — use Account → Inventory instead. */
export default function NewOrganizationDealPage() {
  redirect("/account/inventory/deals/new");
}
