export default function AccountInventoryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-instrument)] text-3xl text-[var(--ts-ink)]">
          Inventory
        </h2>
        <p className="mt-1 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          Load and manage the deal details you publish to travelers.
        </p>
      </div>

      <div className="rounded-2xl border border-dashed border-[var(--ts-ink)]/15 bg-white/70 px-6 py-12 text-center shadow-[0_16px_40px_rgba(16,36,28,0.04)]">
        <p className="font-[family-name:var(--font-sora)] text-sm font-medium text-[var(--ts-ink)]">
          Inventory coming soon
        </p>
        <p className="mx-auto mt-2 max-w-md font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          This is where you&apos;ll upload and edit deal details. We&apos;re
          building this next — check back shortly.
        </p>
      </div>
    </div>
  );
}
