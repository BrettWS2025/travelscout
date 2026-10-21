/**
 * Browser client for Compliance settings APIs (Chunk 41).
 */

export class ComplianceApiError extends Error {
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
    this.name = "ComplianceApiError";
    this.status = status;
    this.code = extras?.code;
    this.errors = extras?.errors ?? [];
  }
}

export type ComplianceDocumentRow = {
  id: string;
  operator_id: string;
  doc_type: string;
  doc_type_label: string;
  file: string;
  file_url: string | null;
  issuer: string | null;
  reference_number: string | null;
  issued_on: string | null;
  expires_on: string | null;
  review_status: string;
  review_status_label: string;
  reviewer_notes: string | null;
  created_at: string;
  updated_at: string;
};

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function authHeaders(token: string, json = true): HeadersInit {
  const h: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

function throwApiError(
  data: Record<string, unknown>,
  status: number,
  fallback: string
): never {
  throw new ComplianceApiError(
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

export async function listComplianceDocumentsApi(
  operatorId: string,
  token: string
): Promise<{ documents: ComplianceDocumentRow[] }> {
  const res = await fetch(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/compliance`,
    { headers: authHeaders(token), cache: "no-store" }
  );
  const data = await parseJson(res);
  if (!res.ok) throwApiError(data, res.status, "Failed to load compliance documents");
  return {
    documents: (data.documents ?? []) as ComplianceDocumentRow[],
  };
}

export type ComplianceDocFormFields = {
  doc_type: string;
  issuer?: string;
  reference_number?: string;
  issued_on?: string;
  expires_on?: string;
};

export async function createComplianceDocumentApi(
  operatorId: string,
  token: string,
  fields: ComplianceDocFormFields,
  file: File
): Promise<{ document: ComplianceDocumentRow }> {
  const form = new FormData();
  form.set("doc_type", fields.doc_type);
  if (fields.issuer) form.set("issuer", fields.issuer);
  if (fields.reference_number) {
    form.set("reference_number", fields.reference_number);
  }
  if (fields.issued_on) form.set("issued_on", fields.issued_on);
  if (fields.expires_on) form.set("expires_on", fields.expires_on);
  form.set("file", file);

  const res = await fetch(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/compliance`,
    {
      method: "POST",
      headers: authHeaders(token, false),
      body: form,
    }
  );
  const data = await parseJson(res);
  if (!res.ok) throwApiError(data, res.status, "Failed to upload document");
  return { document: data.document as ComplianceDocumentRow };
}

export async function updateComplianceDocumentApi(
  operatorId: string,
  docId: string,
  token: string,
  fields: Partial<ComplianceDocFormFields>,
  file?: File | null
): Promise<{ document: ComplianceDocumentRow }> {
  if (file) {
    const form = new FormData();
    if (fields.doc_type) form.set("doc_type", fields.doc_type);
    if (fields.issuer !== undefined) form.set("issuer", fields.issuer);
    if (fields.reference_number !== undefined) {
      form.set("reference_number", fields.reference_number);
    }
    if (fields.issued_on !== undefined) form.set("issued_on", fields.issued_on);
    if (fields.expires_on !== undefined) {
      form.set("expires_on", fields.expires_on);
    }
    form.set("file", file);
    const res = await fetch(
      `/api/marketplace/operators/${encodeURIComponent(operatorId)}/compliance/${encodeURIComponent(docId)}`,
      {
        method: "PATCH",
        headers: authHeaders(token, false),
        body: form,
      }
    );
    const data = await parseJson(res);
    if (!res.ok) throwApiError(data, res.status, "Failed to update document");
    return { document: data.document as ComplianceDocumentRow };
  }

  const res = await fetch(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/compliance/${encodeURIComponent(docId)}`,
    {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(fields),
    }
  );
  const data = await parseJson(res);
  if (!res.ok) throwApiError(data, res.status, "Failed to update document");
  return { document: data.document as ComplianceDocumentRow };
}

export async function deleteComplianceDocumentApi(
  operatorId: string,
  docId: string,
  token: string
): Promise<void> {
  const res = await fetch(
    `/api/marketplace/operators/${encodeURIComponent(operatorId)}/compliance/${encodeURIComponent(docId)}`,
    {
      method: "DELETE",
      headers: authHeaders(token),
    }
  );
  const data = await parseJson(res);
  if (!res.ok) throwApiError(data, res.status, "Failed to delete document");
}
