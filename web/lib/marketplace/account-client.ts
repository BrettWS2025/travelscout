/**
 * Browser client for Account settings APIs (Chunk 42).
 */

export class AccountApiError extends Error {
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
    this.name = "AccountApiError";
    this.status = status;
    this.code = extras?.code;
    this.errors = extras?.errors ?? [];
  }
}

export type ExportFileRow = {
  filename: string;
  content: string;
  content_type: string;
};

export type ExportApiResult = {
  files: ExportFileRow[];
  generated_at: string;
  deal_count: number;
};

export type CloseAccountResult = {
  operator_id: string;
  account_status: string;
  ended_deal_ids: string[];
  disconnected_providers: string[];
  closed_at: string;
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

function throwApiError(
  data: Record<string, unknown>,
  status: number,
  fallback: string
): never {
  throw new AccountApiError(
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

export async function exportOperatorDataApi(
  operatorId: string,
  token: string
): Promise<ExportApiResult> {
  const res = await fetch(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/export`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({}),
    }
  );
  const data = await parseJson(res);
  if (!res.ok) throwApiError(data, res.status, "Failed to export data");
  return {
    files: (data.files ?? []) as ExportFileRow[],
    generated_at:
      typeof data.generated_at === "string"
        ? data.generated_at
        : new Date().toISOString(),
    deal_count: typeof data.deal_count === "number" ? data.deal_count : 0,
  };
}

export async function closeOperatorAccountApi(
  operatorId: string,
  token: string,
  confirmText: string
): Promise<{ closed: CloseAccountResult }> {
  const res = await fetch(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/close`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ confirm_text: confirmText }),
    }
  );
  const data = await parseJson(res);
  if (!res.ok) throwApiError(data, res.status, "Failed to close account");
  return { closed: data.closed as CloseAccountResult };
}

/** Trigger browser downloads for each CSV file from an export response. */
export function downloadExportFiles(files: ExportFileRow[]): void {
  for (const file of files) {
    const blob = new Blob([file.content], {
      type: file.content_type || "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
}
