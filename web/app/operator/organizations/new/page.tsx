import { redirect } from "next/navigation";

/** Legacy org create UI — inventory uses operators only. */
export default function NewOrganizationPage() {
  redirect("/account/inventory");
}
