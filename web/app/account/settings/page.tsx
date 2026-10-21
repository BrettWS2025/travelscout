import { redirect } from "next/navigation";

/** Settings home → Integrations (Chunk 37). Other sections land in later chunks. */
export default function AccountSettingsPage() {
  redirect("/account/settings/integrations");
}
