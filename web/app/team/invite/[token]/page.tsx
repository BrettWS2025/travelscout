import type { Metadata } from "next";
import { TeamInviteAccept } from "@/components/settings/team/TeamInviteAccept";

export const metadata: Metadata = {
  title: "Team invite",
  description: "Accept an invitation to join an operator team.",
  robots: { index: false, follow: false },
};

type Params = { params: { token: string } };

/**
 * Chunk 40: accept team invite (sign in with invited email).
 * Path matches `buildTeamInvitePath` → `/team/invite/:token`.
 */
export default function TeamInviteTokenPage({ params }: Params) {
  let token = params.token ?? "";
  try {
    token = decodeURIComponent(token);
  } catch {
    // keep raw
  }

  return <TeamInviteAccept token={token} />;
}
