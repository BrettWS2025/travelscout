import { redirect } from "next/navigation";

/** Legacy profile URL — account details now live at /account/details. */
export default function ProfileRedirectPage() {
  redirect("/account/details");
}
