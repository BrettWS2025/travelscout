"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { SettingsSubnav } from "@/components/settings/SettingsSubnav";
import {
  listMyOperators,
  type MyOperator,
} from "@/lib/marketplace/operator-deals-client";
import {
  ComplianceApiError,
  createComplianceDocumentApi,
  deleteComplianceDocumentApi,
  listComplianceDocumentsApi,
  updateComplianceDocumentApi,
  type ComplianceDocumentRow,
} from "@/lib/marketplace/compliance-client";
import {
  COMPLIANCE_FILE_LIMITS,
  canManageCompliance,
  complianceDocTypeOptions,
  fieldErrorMap,
  formatComplianceDate,
  reviewStatusTone,
} from "@/lib/marketplace/compliance-ui";

function FieldLabel({
  children,
  htmlFor,
}: {
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="block font-[family-name:var(--font-sora)] text-xs font-semibold text-[var(--ts-muted)]"
    >
      {children}
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 font-[family-name:var(--font-sora)] text-xs text-red-600">
      {message}
    </p>
  );
}

function statusClass(status: string): string {
  const tone = reviewStatusTone(status);
  if (tone === "ok") return "bg-emerald-50 text-emerald-800";
  if (tone === "warn") return "bg-amber-50 text-amber-900";
  if (tone === "bad") return "bg-red-50 text-red-800";
  return "bg-[var(--ts-mist)] text-[var(--ts-muted)]";
}

type FormState = {
  doc_type: string;
  issuer: string;
  reference_number: string;
  issued_on: string;
  expires_on: string;
};

const EMPTY_FORM: FormState = {
  doc_type: "public_liability_insurance",
  issuer: "",
  reference_number: "",
  issued_on: "",
  expires_on: "",
};

export function ComplianceSettings() {
  const { session, isLoading: authLoading } = useAuth();
  const token = session?.access_token ?? null;

  const [operators, setOperators] = useState<MyOperator[]>([]);
  const [operatorId, setOperatorId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<ComplianceDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [file, setFile] = useState<File | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const currentOp = operators.find((o) => o.id === operatorId) ?? null;
  const canEdit = canManageCompliance(currentOp?.role);
  const typeOptions = complianceDocTypeOptions();

  const loadOperators = useCallback(async () => {
    if (!token) return;
    const res = await listMyOperators(token);
    setOperators(res.operators);
    if (res.operators.length && !operatorId) {
      setOperatorId(res.operators[0]!.id);
    }
  }, [token, operatorId]);

  const loadDocs = useCallback(async () => {
    if (!token || !operatorId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await listComplianceDocumentsApi(operatorId, token);
      setDocuments(res.documents);
    } catch (err) {
      setError(
        err instanceof ComplianceApiError
          ? err.message
          : "Failed to load compliance documents"
      );
    } finally {
      setLoading(false);
    }
  }, [token, operatorId]);

  useEffect(() => {
    if (authLoading || !token) return;
    void loadOperators();
  }, [authLoading, token, loadOperators]);

  useEffect(() => {
    if (!operatorId || !token) return;
    void loadDocs();
  }, [operatorId, token, loadDocs]);

  function startEdit(doc: ComplianceDocumentRow) {
    setEditingId(doc.id);
    setForm({
      doc_type: doc.doc_type,
      issuer: doc.issuer ?? "",
      reference_number: doc.reference_number ?? "",
      issued_on: doc.issued_on ?? "",
      expires_on: doc.expires_on ?? "",
    });
    setFile(null);
    setFormErrors({});
    setBanner(null);
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFile(null);
    setFormErrors({});
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !operatorId || !canEdit) return;
    setSaving(true);
    setFormErrors({});
    setBanner(null);
    setError(null);
    try {
      if (editingId) {
        await updateComplianceDocumentApi(
          operatorId,
          editingId,
          token,
          {
            doc_type: form.doc_type,
            issuer: form.issuer,
            reference_number: form.reference_number,
            issued_on: form.issued_on,
            expires_on: form.expires_on,
          },
          file
        );
        setBanner("Document updated — pending platform review.");
      } else {
        if (!file) {
          setFormErrors({ file: "A PDF, JPG, or PNG file is required" });
          setSaving(false);
          return;
        }
        if (file.size > COMPLIANCE_FILE_LIMITS.maxFileSizeBytes) {
          setFormErrors({ file: "File must be 10 MB or smaller" });
          setSaving(false);
          return;
        }
        await createComplianceDocumentApi(
          operatorId,
          token,
          {
            doc_type: form.doc_type,
            issuer: form.issuer || undefined,
            reference_number: form.reference_number || undefined,
            issued_on: form.issued_on || undefined,
            expires_on: form.expires_on || undefined,
          },
          file
        );
        setBanner("Document uploaded — pending platform review.");
      }
      resetForm();
      await loadDocs();
    } catch (err) {
      if (err instanceof ComplianceApiError) {
        const map = fieldErrorMap(err.errors);
        if (Object.keys(map).length) setFormErrors(map);
        else setError(err.message);
      } else {
        setError("Could not save document");
      }
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(docId: string) {
    if (!token || !operatorId || !canEdit) return;
    if (!window.confirm("Remove this compliance document?")) return;
    setBusyId(docId);
    setError(null);
    try {
      await deleteComplianceDocumentApi(operatorId, docId, token);
      setBanner("Document removed.");
      if (editingId === docId) resetForm();
      await loadDocs();
    } catch (err) {
      setError(
        err instanceof ComplianceApiError
          ? err.message
          : "Failed to delete document"
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--ts-ink)]">
          Settings
        </h1>
        <p className="mt-1 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          Licences and insurance on file for your operator account.
        </p>
      </div>

      <SettingsSubnav />

      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-sora)] text-lg font-semibold text-[var(--ts-ink)]">
            Compliance
          </h2>
          {!canEdit && (
            <p className="mt-1 font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
              Staff cannot manage compliance documents.
            </p>
          )}
        </div>
        {operators.length > 1 && (
          <select
            className="rounded-xl border border-[var(--ts-ink)]/15 bg-white px-3 py-2 font-[family-name:var(--font-sora)] text-sm"
            value={operatorId ?? ""}
            onChange={(e) => setOperatorId(e.target.value)}
            aria-label="Operator"
          >
            {operators.map((op) => (
              <option key={op.id} value={op.id}>
                {op.tradingName}
              </option>
            ))}
          </select>
        )}
      </div>

      {banner && (
        <p
          className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 font-[family-name:var(--font-sora)] text-sm text-emerald-900"
          role="status"
        >
          {banner}
        </p>
      )}
      {error && (
        <p
          className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 font-[family-name:var(--font-sora)] text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      )}

      {canEdit && (
        <form
          onSubmit={onSubmit}
          className="mt-6 space-y-4 border-t border-[var(--ts-ink)]/10 pt-6"
        >
          <h3 className="font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)]">
            {editingId ? "Update document" : "Upload document"}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="doc_type">Document type</FieldLabel>
              <select
                id="doc_type"
                className="mt-1 w-full rounded-xl border border-[var(--ts-ink)]/15 bg-white px-3 py-2.5 font-[family-name:var(--font-sora)] text-sm"
                value={form.doc_type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, doc_type: e.target.value }))
                }
              >
                {typeOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <FieldError message={formErrors.doc_type} />
            </div>
            <div>
              <FieldLabel htmlFor="file">
                File {editingId ? "(optional replace)" : ""} — PDF, JPG, PNG ≤10
                MB
              </FieldLabel>
              <input
                id="file"
                type="file"
                accept={COMPLIANCE_FILE_LIMITS.acceptAttr}
                className="mt-1 block w-full font-[family-name:var(--font-sora)] text-sm"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <FieldError message={formErrors.file} />
            </div>
            <div>
              <FieldLabel htmlFor="issuer">Issuer</FieldLabel>
              <input
                id="issuer"
                className="mt-1 w-full rounded-xl border border-[var(--ts-ink)]/15 bg-white px-3 py-2.5 font-[family-name:var(--font-sora)] text-sm"
                value={form.issuer}
                onChange={(e) =>
                  setForm((f) => ({ ...f, issuer: e.target.value }))
                }
              />
              <FieldError message={formErrors.issuer} />
            </div>
            <div>
              <FieldLabel htmlFor="reference_number">Reference number</FieldLabel>
              <input
                id="reference_number"
                className="mt-1 w-full rounded-xl border border-[var(--ts-ink)]/15 bg-white px-3 py-2.5 font-[family-name:var(--font-sora)] text-sm"
                value={form.reference_number}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    reference_number: e.target.value,
                  }))
                }
              />
              <FieldError message={formErrors.reference_number} />
            </div>
            <div>
              <FieldLabel htmlFor="issued_on">Issued on</FieldLabel>
              <input
                id="issued_on"
                type="date"
                className="mt-1 w-full rounded-xl border border-[var(--ts-ink)]/15 bg-white px-3 py-2.5 font-[family-name:var(--font-sora)] text-sm"
                value={form.issued_on}
                onChange={(e) =>
                  setForm((f) => ({ ...f, issued_on: e.target.value }))
                }
              />
              <FieldError message={formErrors.issued_on} />
            </div>
            <div>
              <FieldLabel htmlFor="expires_on">Expires on</FieldLabel>
              <input
                id="expires_on"
                type="date"
                className="mt-1 w-full rounded-xl border border-[var(--ts-ink)]/15 bg-white px-3 py-2.5 font-[family-name:var(--font-sora)] text-sm"
                value={form.expires_on}
                onChange={(e) =>
                  setForm((f) => ({ ...f, expires_on: e.target.value }))
                }
              />
              <FieldError message={formErrors.expires_on} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-[var(--ts-ink)] px-4 py-2.5 font-[family-name:var(--font-sora)] text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving
                ? "Saving…"
                : editingId
                  ? "Save changes"
                  : "Upload document"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl border border-[var(--ts-ink)]/20 px-4 py-2.5 font-[family-name:var(--font-sora)] text-sm font-medium text-[var(--ts-ink)]"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      <div className="mt-8">
        <h3 className="font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)]">
          On file
        </h3>
        {loading ? (
          <p className="mt-3 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
            Loading…
          </p>
        ) : documents.length === 0 ? (
          <p className="mt-3 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
            No compliance documents uploaded yet.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--ts-ink)]/10 border-t border-[var(--ts-ink)]/10">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)]">
                      {doc.doc_type_label}
                    </p>
                    <span
                      className={`rounded-md px-2 py-0.5 font-[family-name:var(--font-sora)] text-xs font-medium ${statusClass(doc.review_status)}`}
                    >
                      {doc.review_status_label}
                    </span>
                  </div>
                  <p className="mt-1 font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
                    {doc.issuer ? `${doc.issuer} · ` : ""}
                    Expires {formatComplianceDate(doc.expires_on)}
                    {doc.reference_number
                      ? ` · Ref ${doc.reference_number}`
                      : ""}
                  </p>
                  {doc.reviewer_notes && (
                    <p className="mt-1 font-[family-name:var(--font-sora)] text-xs text-[var(--ts-muted)]">
                      Notes: {doc.reviewer_notes}
                    </p>
                  )}
                  {doc.file_url && (
                    <a
                      href={doc.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block font-[family-name:var(--font-sora)] text-xs font-medium text-[var(--ts-ink)] underline"
                    >
                      View file
                    </a>
                  )}
                </div>
                {canEdit && (
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(doc)}
                      className="rounded-lg border border-[var(--ts-ink)]/15 px-3 py-1.5 font-[family-name:var(--font-sora)] text-xs font-medium text-[var(--ts-ink)]"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={busyId === doc.id}
                      onClick={() => void onDelete(doc.id)}
                      className="rounded-lg border border-red-200 px-3 py-1.5 font-[family-name:var(--font-sora)] text-xs font-medium text-red-700 disabled:opacity-60"
                    >
                      {busyId === doc.id ? "Removing…" : "Remove"}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
