import { redirect } from "next/navigation";

/** Legacy org dashboard — inventory uses operators only. */
export default function OrganizationDetailPage() {
  redirect("/account/inventory");
}
