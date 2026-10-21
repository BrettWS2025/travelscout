"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { ConfirmLiveEditDialog } from "@/components/inventory/deal-editor/ConfirmLiveEditDialog";
import { DealEditorSidebar } from "@/components/inventory/deal-editor/DealEditorSidebar";
import {
  AvailabilityStep,
  ContentStep,
  DestinationStep,
  ImagesStep,
  PricingStep,
  ReviewStep,
  TypeStep,
} from "@/components/inventory/deal-editor/DealEditorSteps";
import { useDebouncedCallback } from "@/components/inventory/deal-editor/useDebouncedCallback";
import type { Deal } from "@/lib/marketplace/deal";
import type { FieldError } from "@/lib/marketplace/deal";
import type { DealDetail } from "@/lib/marketplace/deal-draft";
import {
  EDITOR_STEP_LABELS,
  EDITOR_STEPS,
  isLiveDeal,
  summarizeDealEditor,
  type EditorStep,
} from "@/lib/marketplace/deal-editor";
import type { DealType } from "@/lib/marketplace/enums";
import type { PublishValidationCheckKeyed } from "@/lib/marketplace/deal-publish-validation";
import type { PublishButtonLabel } from "@/lib/marketplace/deal-publish";
import {
  OperatorDealsApiError,
  addDealVideoEmbedApi,
  createDealFromTemplateApi,
  createDealPriceOptionApi,
  createDealSessionApi,
  createOperatorDeal,
  deleteDealMediaApi,
  deleteDealPriceOptionApi,
  deleteDealSessionApi,
  duplicateOperatorDeal,
  getOperatorDeal,
  importProviderImagesApi,
  listAvailableSessionsApi,
  listDealProductsApi,
  listOperatorTemplatesApi,
  publishOperatorDeal,
  revertDealFieldApi,
  selectIntegratedSessionsApi,
  setDealMediaCoverApi,
  testDealLinkApi,
  updateDealMediaApi,
  updateDealPriceOptionApi,
  updateDealSessionApi,
  updateOperatorDeal,
  uploadDealMediaApi,
  verifyDealDiscountApi,
  type AvailableExternalSessionRow,
  type DealProductPickerItem,
  type OperatorDealTemplate,
} from "@/lib/marketplace/operator-deals-client";
import { CAPACITY_CAP_NOTE } from "@/lib/marketplace/deal-integrated-availability-shared";
import { isIntegratedDealType } from "@/lib/marketplace/enums";

type Props = {
  operatorId: string;
  dealId?: string;
};

export function DealEditor({ operatorId, dealId: initialDealId }: Props) {
  const { session } = useAuth();
  const token = session?.access_token;
  const router = useRouter();

  const [step, setStep] = useState<EditorStep>(
    initialDealId ? "content" : "type"
  );
  const [dealId, setDealId] = useState<string | undefined>(initialDealId);
  const [detail, setDetail] = useState<DealDetail | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busyMedia, setBusyMedia] = useState(false);
  const [testingLink, setTestingLink] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [attest, setAttest] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmWarnings, setConfirmWarnings] = useState<string[]>([]);
  const [pendingConfirm, setPendingConfirm] = useState<
    null | (() => Promise<void>)
  >(null);
  const [templates, setTemplates] = useState<OperatorDealTemplate[]>([]);
  const [products, setProducts] = useState<DealProductPickerItem[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [hasConnectedIntegration, setHasConnectedIntegration] =
    useState(false);
  const [availableSessions, setAvailableSessions] = useState<
    AvailableExternalSessionRow[] | null
  >(null);
  const [capacityNote, setCapacityNote] = useState<string | null>(
    CAPACITY_CAP_NOTE
  );

  const deal = detail?.deal ?? null;
  const summary = summarizeDealEditor(detail);
  const publishButton: PublishButtonLabel =
    detail?.publish_button ?? "Publish";
  const checks: PublishValidationCheckKeyed[] =
    detail && "checks" in detail.validation
      ? (detail.validation.checks as PublishValidationCheckKeyed[])
      : [];

  const reload = useCallback(async (id: string) => {
    const next = await getOperatorDeal(id, token);
    setDetail(next);
    setDealId(id);
    return next;
  }, [token]);

  const reloadAvailableSessions = useCallback(
    async (id: string) => {
      try {
        const res = await listAvailableSessionsApi(id, token);
        setAvailableSessions(res.sessions);
        setCapacityNote(res.note ?? CAPACITY_CAP_NOTE);
      } catch {
        setAvailableSessions([]);
      }
    },
    [token]
  );

  useEffect(() => {
    if (step !== "availability" || !dealId || !deal) return;
    if (!isIntegratedDealType(deal.dealType)) {
      setAvailableSessions(null);
      return;
    }
    void reloadAvailableSessions(dealId);
  }, [step, dealId, deal, reloadAvailableSessions]);

  useEffect(() => {
    if (!initialDealId) return;
    let cancelled = false;
    (async () => {
      try {
        const next = await getOperatorDeal(initialDealId, token);
        if (!cancelled) setDetail(next);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load deal"
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialDealId, token]);

  useEffect(() => {
    if (initialDealId) return;
    let cancelled = false;
    (async () => {
      try {
        const { templates: rows } = await listOperatorTemplatesApi(
          operatorId,
          token
        );
        if (!cancelled) setTemplates(rows);
      } catch {
        // Templates are optional on the type step.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialDealId, operatorId, token]);

  useEffect(() => {
    let cancelled = false;
    setProductsLoading(true);
    (async () => {
      try {
        const res = await listDealProductsApi(operatorId, token);
        if (!cancelled) {
          setProducts(res.products);
          setHasConnectedIntegration(res.has_connected_integration);
        }
      } catch {
        if (!cancelled) {
          setProducts([]);
          setHasConnectedIntegration(false);
        }
      } finally {
        if (!cancelled) setProductsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [operatorId, token]);

  async function withLiveConfirm(
    run: (confirm: boolean) => Promise<void>
  ): Promise<void> {
    try {
      await run(false);
    } catch (err) {
      if (err instanceof OperatorDealsApiError && err.needsConfirm) {
        setConfirmWarnings(err.warnings);
        setPendingConfirm(() => async () => {
          await run(true);
          setConfirmOpen(false);
          setPendingConfirm(null);
        });
        setConfirmOpen(true);
        return;
      }
      throw err;
    }
  }

  const patchDeal = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!dealId) return;
      setSaving(true);
      setError(null);
      setFieldErrors([]);
      try {
        const { deal: updated } = await updateOperatorDeal(
          dealId,
          patch,
          token
        );
        setDetail((prev) =>
          prev
            ? { ...prev, deal: updated }
            : prev
        );
        // Refresh validation after content changes
        await reload(dealId);
      } catch (err) {
        if (err instanceof OperatorDealsApiError) {
          setFieldErrors(err.errors);
          setError(err.message);
        } else {
          setError(err instanceof Error ? err.message : "Save failed");
        }
      } finally {
        setSaving(false);
      }
    },
    [dealId, reload, token]
  );

  const debouncedPatch = useDebouncedCallback(
    (patch: Record<string, unknown>) => {
      void patchDeal(patch);
    },
    450
  );

  function onContentChange(patch: Record<string, unknown>) {
    if (!deal) return;
    // Optimistic local merge for counters
    setDetail((prev) => {
      if (!prev) return prev;
      const merged = { ...prev.deal } as Deal;
      for (const [k, v] of Object.entries(patch)) {
        const camel = k.includes("_")
          ? k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
          : k;
        (merged as Record<string, unknown>)[camel] = v;
      }
      return { ...prev, deal: merged };
    });
    debouncedPatch(patch);
  }

  async function onCreate(dealType: DealType) {
    setCreating(true);
    setError(null);
    try {
      const { deal: created } = await createOperatorDeal(
        operatorId,
        { deal_type: dealType },
        token
      );
      router.replace(`/account/inventory/deals/${created.id}`);
      setDealId(created.id);
      await reload(created.id);
      setStep("content");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function onCreateIntegrated(
    dealType: "integrated_session" | "integrated_multi_session",
    productId: string
  ) {
    setCreating(true);
    setError(null);
    try {
      const product = products.find((p) => p.id === productId);
      const { deal: created } = await createOperatorDeal(
        operatorId,
        {
          deal_type: dealType,
          external_product_id: productId,
          source_provider: product?.provider ?? null,
        },
        token
      );
      router.replace(`/account/inventory/deals/${created.id}`);
      setDealId(created.id);
      await reload(created.id);
      setStep("content");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function onRevertField(field: string) {
    if (!dealId) return;
    setSaving(true);
    setError(null);
    try {
      await revertDealFieldApi(dealId, field, token);
      await reload(dealId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revert failed");
    } finally {
      setSaving(false);
    }
  }

  async function onDuplicate() {
    if (!dealId) return;
    setCreating(true);
    try {
      const { deal: copy } = await duplicateOperatorDeal(dealId, token);
      router.push(`/account/inventory/deals/${copy.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Duplicate failed");
    } finally {
      setCreating(false);
    }
  }

  async function onCreateFromTemplate(templateId: string) {
    setCreating(true);
    setError(null);
    try {
      const { deal: created } = await createDealFromTemplateApi(
        operatorId,
        templateId,
        {},
        token
      );
      router.replace(`/account/inventory/deals/${created.id}`);
      setDealId(created.id);
      await reload(created.id);
      setStep("content");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Create from template failed"
      );
    } finally {
      setCreating(false);
    }
  }

  async function refreshAfterChildChange() {
    if (dealId) await reload(dealId);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-instrument)] text-3xl text-[var(--ts-ink)]">
            {deal?.title || "New deal"}
          </h2>
          <p className="mt-1 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
            {saving ? "Saving…" : "Draft autosaves as you edit"}
          </p>
        </div>
        <a
          href="/account/inventory"
          className="font-[family-name:var(--font-sora)] text-sm font-medium text-[var(--ts-teal)]"
        >
          ← Inventory
        </a>
      </div>

      <nav
        aria-label="Editor steps"
        className="flex flex-wrap gap-1.5"
      >
        {EDITOR_STEPS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={!dealId && s !== "type"}
            onClick={() => setStep(s)}
            className={`rounded-lg px-3 py-1.5 font-[family-name:var(--font-sora)] text-xs font-semibold transition ${
              step === s
                ? "bg-[var(--ts-teal)] text-white"
                : "bg-white/80 text-[var(--ts-muted)] hover:text-[var(--ts-ink)]"
            } disabled:opacity-40`}
          >
            {EDITOR_STEP_LABELS[s]}
          </button>
        ))}
      </nav>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-[family-name:var(--font-sora)] text-sm text-red-800"
        >
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="rounded-2xl border border-[var(--ts-ink)]/10 bg-white/90 p-5 shadow-[0_12px_30px_rgba(16,36,28,0.04)]">
          {step === "type" && (
            <TypeStep
              deal={deal}
              creating={creating}
              onCreate={(t) => void onCreate(t)}
              onCreateIntegrated={(t, productId) =>
                void onCreateIntegrated(t, productId)
              }
              onDuplicate={() => void onDuplicate()}
              onCreateFromTemplate={(id) => void onCreateFromTemplate(id)}
              templates={templates}
              hasConnectedIntegration={hasConnectedIntegration}
              products={products}
              productsLoading={productsLoading}
            />
          )}

          {step === "content" && deal && (
            <ContentStep
              deal={deal}
              errors={fieldErrors}
              onChange={onContentChange}
              providerValues={detail?.provider_values ?? null}
              overriddenFields={detail?.overridden_fields ?? []}
              onRevertField={(field) => void onRevertField(field)}
            />
          )}

          {step === "images" && dealId && detail && (
            <ImagesStep
              media={detail.media}
              busy={busyMedia}
              canImportProvider={Boolean(deal?.externalProductId)}
              onImportProvider={async () => {
                if (!dealId) return;
                setBusyMedia(true);
                setError(null);
                try {
                  await importProviderImagesApi(dealId, token);
                  await refreshAfterChildChange();
                } catch (err) {
                  setError(
                    err instanceof Error ? err.message : "Import failed"
                  );
                } finally {
                  setBusyMedia(false);
                }
              }}
              onUpload={async (files) => {
                if (!files?.length || !dealId) return;
                setBusyMedia(true);
                setError(null);
                try {
                  await uploadDealMediaApi(
                    dealId,
                    Array.from(files),
                    token,
                    "Deal photo"
                  );
                  await refreshAfterChildChange();
                } catch (err) {
                  setError(
                    err instanceof Error ? err.message : "Upload failed"
                  );
                } finally {
                  setBusyMedia(false);
                }
              }}
              onEmbed={async (url) => {
                if (!dealId) return;
                setBusyMedia(true);
                try {
                  await addDealVideoEmbedApi(
                    dealId,
                    { url, alt_text: "Deal video" },
                    token
                  );
                  await refreshAfterChildChange();
                } catch (err) {
                  setError(
                    err instanceof Error ? err.message : "Embed failed"
                  );
                } finally {
                  setBusyMedia(false);
                }
              }}
              onSetCover={async (mediaId) => {
                if (!dealId) return;
                await setDealMediaCoverApi(dealId, mediaId, token);
                await refreshAfterChildChange();
              }}
              onDelete={async (mediaId) => {
                if (!dealId) return;
                await deleteDealMediaApi(dealId, mediaId, token);
                await refreshAfterChildChange();
              }}
              onPatchAlt={(mediaId, alt) => {
                if (!dealId) return;
                void updateDealMediaApi(
                  dealId,
                  mediaId,
                  { alt_text: alt },
                  token
                ).then(() => refreshAfterChildChange());
              }}
            />
          )}

          {step === "pricing" && deal && detail && (
            <PricingStep
              deal={deal}
              options={detail.priceOptions}
              providerPriceOptions={detail.provider_price_options}
              discountVerification={detail.discount_verification}
              separateProducts={products}
              onPatchDeal={(patch) => void patchDeal(patch)}
              onVerifyDiscount={async (opts) => {
                if (!dealId) return;
                setError(null);
                try {
                  await verifyDealDiscountApi(dealId, opts ?? {}, token);
                  await refreshAfterChildChange();
                } catch (err) {
                  setError(
                    err instanceof OperatorDealsApiError
                      ? err.message
                      : err instanceof Error
                        ? err.message
                        : "Verify failed"
                  );
                }
              }}
              onAddOption={async (body) => {
                if (!dealId) return;
                setError(null);
                try {
                  await withLiveConfirm(async (confirm) => {
                    await createDealPriceOptionApi(
                      dealId,
                      { ...body, confirm },
                      token
                    );
                    await refreshAfterChildChange();
                  });
                } catch (err) {
                  if (err instanceof OperatorDealsApiError) {
                    setError(
                      err.maxDealPriceMinor != null
                        ? `${err.message} (max ${err.maxDealPriceMinor} cents)`
                        : err.message
                    );
                  } else {
                    setError(
                      err instanceof Error ? err.message : "Price failed"
                    );
                  }
                }
              }}
              onUpdateOption={async (id, body) => {
                if (!dealId) return;
                try {
                  await withLiveConfirm(async (confirm) => {
                    await updateDealPriceOptionApi(
                      dealId,
                      id,
                      { ...body, confirm },
                      token
                    );
                    await refreshAfterChildChange();
                  });
                } catch (err) {
                  if (err instanceof OperatorDealsApiError) {
                    setError(err.message);
                  }
                }
              }}
              onDeleteOption={async (id) => {
                if (!dealId) return;
                await withLiveConfirm(async (confirm) => {
                  await deleteDealPriceOptionApi(
                    dealId,
                    id,
                    { confirm },
                    token
                  );
                  await refreshAfterChildChange();
                });
              }}
            />
          )}

          {step === "availability" && deal && detail && (
            <AvailabilityStep
              deal={deal}
              sessions={detail.sessions}
              availableSessions={availableSessions}
              capacityNote={capacityNote}
              onPatchDeal={(patch) => void patchDeal(patch)}
              onSelectIntegratedSessions={async (body) => {
                if (!dealId) return;
                setError(null);
                try {
                  await withLiveConfirm(async (confirm) => {
                    await selectIntegratedSessionsApi(
                      dealId,
                      { ...body, confirm },
                      token
                    );
                    await refreshAfterChildChange();
                    await reloadAvailableSessions(dealId);
                  });
                } catch (err) {
                  setError(
                    err instanceof OperatorDealsApiError
                      ? err.message
                      : err instanceof Error
                        ? err.message
                        : "Session selection failed"
                  );
                }
              }}
              onAddSession={async (body) => {
                if (!dealId) return;
                try {
                  await withLiveConfirm(async (confirm) => {
                    await createDealSessionApi(
                      dealId,
                      { ...body, confirm },
                      token
                    );
                    await refreshAfterChildChange();
                  });
                } catch (err) {
                  setError(
                    err instanceof Error ? err.message : "Session failed"
                  );
                }
              }}
              onUpdateSession={async (id, body) => {
                if (!dealId) return;
                try {
                  await withLiveConfirm(async (confirm) => {
                    await updateDealSessionApi(
                      dealId,
                      id,
                      { ...body, confirm },
                      token
                    );
                    await refreshAfterChildChange();
                  });
                } catch (err) {
                  setError(
                    err instanceof Error ? err.message : "Session failed"
                  );
                }
              }}
              onDeleteSession={async (id) => {
                if (!dealId) return;
                await withLiveConfirm(async (confirm) => {
                  await deleteDealSessionApi(
                    dealId,
                    id,
                    { confirm },
                    token
                  );
                  await refreshAfterChildChange();
                });
              }}
            />
          )}

          {step === "destination" && deal && (
            <DestinationStep
              deal={deal}
              onPatchDeal={(patch) => {
                if (isLiveDeal(deal)) {
                  void withLiveConfirm(async (confirm) => {
                    // Destination fields are on the deal; live confirm is
                    // for pricing/sessions primarily — still save immediately.
                    void confirm;
                    await patchDeal(patch);
                  });
                } else {
                  void patchDeal(patch);
                }
              }}
              testing={testingLink}
              onTestLink={async () => {
                if (!dealId) return;
                setTestingLink(true);
                setError(null);
                try {
                  const result = await testDealLinkApi(dealId, token);
                  if (result.url) {
                    window.open(result.url, "_blank", "noopener,noreferrer");
                  }
                  if (!result.check.ok) {
                    setError(
                      result.check.error ||
                        `Link check failed (${result.check.status ?? "?"})`
                    );
                  }
                  await refreshAfterChildChange();
                } catch (err) {
                  setError(
                    err instanceof Error ? err.message : "Test link failed"
                  );
                } finally {
                  setTestingLink(false);
                }
              }}
            />
          )}

          {step === "review" && deal && (
            <ReviewStep
              deal={deal}
              checks={checks}
              publishButton={publishButton}
              attest={attest}
              onAttestChange={setAttest}
              onFix={(s) => setStep(s as EditorStep)}
              publishing={publishing}
              onPublish={async () => {
                if (!dealId) return;
                setPublishing(true);
                setError(null);
                try {
                  await publishOperatorDeal(dealId, { attest: true }, token);
                  await reload(dealId);
                } catch (err) {
                  if (err instanceof OperatorDealsApiError) {
                    setError(err.message);
                    if (err.checks?.length) {
                      await reload(dealId);
                    }
                  } else {
                    setError(
                      err instanceof Error ? err.message : "Publish failed"
                    );
                  }
                } finally {
                  setPublishing(false);
                }
              }}
            />
          )}

          {!deal && step !== "type" && (
            <p className="text-sm text-[var(--ts-muted)]">
              Choose a deal type first.
            </p>
          )}
        </div>

        <DealEditorSidebar
          summary={summary}
          status={deal?.status ?? null}
          onFix={setStep}
        />
      </div>

      <ConfirmLiveEditDialog
        open={confirmOpen}
        warnings={confirmWarnings}
        onCancel={() => {
          setConfirmOpen(false);
          setPendingConfirm(null);
        }}
        onConfirm={() => {
          if (pendingConfirm) void pendingConfirm();
        }}
      />
    </div>
  );
}
