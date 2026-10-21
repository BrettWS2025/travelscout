/**
 * Browser client for Team settings APIs (Chunk 40).
 */

export class TeamApiError extends Error {
  status: number;
  code?: string;
  errors: Array<{ field: string; message: string }>;

  constructor(
    message: string,
    status: number,
    extras?: {
      code?: string;
      errors?: Array<{ field: string; message: string }>;
    }
  ) {
    super(message);
    this.name = "TeamApiError";
    this.status = status;
    this.code = extras?.code;
    this.errors = extras?.errors ?? [];
  }
}

export type TeamMemberApiRow = {
  id: string;
  operator_id: string;
  user_id: string | null;
  role: string;
  role_label: string;
  invited_email: string;
  invite_status: string;
  invite_status_label: string;
  invited_at: string;
  last_active_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TeamInvitePreview = {
  operatorId: string;
  operatorName: string;
  role: string;
  invitedEmail: string;
  inviteStatus: string;
  expiresAt: string;
  expired: boolean;
  used: boolean;
  revoked: boolean;
};

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function throwApiError(data: Record<string, unknown>, status: number, fallback: string): never {
  throw new TeamApiError(
    typeof data.error === "string" ? data.error : fallback,
    status,
    {
      code: typeof data.code === "string" ? data.code : undefined,
      errors: Array.isArray(data.errors)
        ? (data.errors as Array<{ field: string; message: string }>)
        : [],
    }
  );
}

export async function listTeamApi(
  operatorId: string,
  token: string
): Promise<{ members: TeamMemberApiRow[] }> {
  const res = await fetch(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/team`,
    { headers: authHeaders(token), cache: "no-store" }
  );
  const data = await parseJson(res);
  if (!res.ok) throwApiError(data, res.status, "Failed to load team");
  return { members: (data.members ?? []) as TeamMemberApiRow[] };
}

export async function inviteTeamMemberApi(
  operatorId: string,
  token: string,
  body: { email: string; role: string }
): Promise<{
  member: TeamMemberApiRow;
  invite_path: string;
  expires_at: string;
}> {
  const res = await fetch(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/team`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(body),
    }
  );
  const data = await parseJson(res);
  if (!res.ok) throwApiError(data, res.status, "Failed to invite");
  return {
    member: data.member as TeamMemberApiRow,
    invite_path: String(data.invite_path ?? ""),
    expires_at: String(data.expires_at ?? ""),
  };
}

export async function updateTeamMemberRoleApi(
  memberId: string,
  token: string,
  role: string
): Promise<{ member: TeamMemberApiRow }> {
  const res = await fetch(
    `/api/marketplace/team/${encodeURIComponent(memberId)}`,
    {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ role }),
    }
  );
  const data = await parseJson(res);
  if (!res.ok) throwApiError(data, res.status, "Failed to update role");
  return { member: data.member as TeamMemberApiRow };
}

export async function removeTeamMemberApi(
  memberId: string,
  token: string
): Promise<void> {
  const res = await fetch(
    `/api/marketplace/team/${encodeURIComponent(memberId)}`,
    { method: "DELETE", headers: authHeaders(token) }
  );
  const data = await parseJson(res);
  if (!res.ok) throwApiError(data, res.status, "Failed to remove member");
}

export async function resendTeamInviteApi(
  memberId: string,
  token: string
): Promise<{
  member: TeamMemberApiRow;
  invite_path: string;
  expires_at: string;
}> {
  const res = await fetch(
    `/api/marketplace/team/${encodeURIComponent(memberId)}/resend`,
    { method: "POST", headers: authHeaders(token) }
  );
  const data = await parseJson(res);
  if (!res.ok) throwApiError(data, res.status, "Failed to resend invite");
  return {
    member: data.member as TeamMemberApiRow,
    invite_path: String(data.invite_path ?? ""),
    expires_at: String(data.expires_at ?? ""),
  };
}

export async function revokeTeamInviteApi(
  memberId: string,
  token: string
): Promise<{ member: TeamMemberApiRow }> {
  const res = await fetch(
    `/api/marketplace/team/${encodeURIComponent(memberId)}/revoke`,
    { method: "POST", headers: authHeaders(token) }
  );
  const data = await parseJson(res);
  if (!res.ok) throwApiError(data, res.status, "Failed to revoke invite");
  return { member: data.member as TeamMemberApiRow };
}

export async function getTeamInvitePreviewApi(
  rawToken: string
): Promise<{ invite: TeamInvitePreview }> {
  const res = await fetch(
    `/api/marketplace/team/invite/${encodeURIComponent(rawToken)}`,
    { cache: "no-store" }
  );
  const data = await parseJson(res);
  if (!res.ok) throwApiError(data, res.status, "Failed to load invite");
  const inv = data.invite as Record<string, unknown>;
  return {
    invite: {
      operatorId: String(inv.operatorId ?? inv.operator_id ?? ""),
      operatorName: String(inv.operatorName ?? inv.operator_name ?? ""),
      role: String(inv.role ?? ""),
      invitedEmail: String(inv.invitedEmail ?? inv.invited_email ?? ""),
      inviteStatus: String(inv.inviteStatus ?? inv.invite_status ?? ""),
      expiresAt: String(inv.expiresAt ?? inv.expires_at ?? ""),
      expired: Boolean(inv.expired),
      used: Boolean(inv.used),
      revoked: Boolean(inv.revoked),
    },
  };
}

export async function acceptTeamInviteApi(
  rawToken: string,
  accessToken: string
): Promise<{ member: TeamMemberApiRow; ok: boolean }> {
  const res = await fetch(
    `/api/marketplace/team/invite/${encodeURIComponent(rawToken)}`,
    { method: "POST", headers: authHeaders(accessToken) }
  );
  const data = await parseJson(res);
  if (!res.ok) throwApiError(data, res.status, "Failed to accept invite");
  return {
    member: data.member as TeamMemberApiRow,
    ok: Boolean(data.ok),
  };
}
