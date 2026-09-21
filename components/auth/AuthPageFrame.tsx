import type { ReactNode } from "react";

type AuthPageFrameProps = {
  eyebrow: string;
  title: ReactNode;
  description: string;
  children: ReactNode;
};

/** Shared atmospheric shell for auth pages — matches TravelScout marketing branding. */
export function AuthPageFrame({
  eyebrow,
  title,
  description,
  children,
}: AuthPageFrameProps) {
  return (
    <div className="ts-page relative min-h-[100svh] overflow-hidden">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -right-16 top-24 h-72 w-72 rounded-full bg-[var(--ts-lime)]/25 blur-3xl" />
        <div className="absolute bottom-16 left-0 h-80 w-80 rounded-full bg-[var(--ts-teal)]/15 blur-3xl" />
        <div className="absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 rounded-full bg-[var(--ts-mist)]/80 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[100svh] max-w-md flex-col justify-center px-5 pb-20 pt-28 md:px-6 md:pt-36">
        <div className="animate-hero-rise">
          <p className="mb-3 font-[family-name:var(--font-sora)] text-xs font-semibold uppercase tracking-[0.22em] text-[var(--ts-teal)]">
            {eyebrow}
          </p>
          <h1 className="font-[family-name:var(--font-instrument)] text-4xl leading-[1.08] tracking-tight text-[var(--ts-ink)] md:text-5xl">
            {title}
          </h1>
          <p className="mt-3 font-[family-name:var(--font-sora)] text-sm leading-relaxed text-[var(--ts-muted)] md:text-base">
            {description}
          </p>

          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}

export const authInputClassName =
  "w-full rounded-xl border border-[var(--ts-ink)]/12 bg-white px-3.5 py-3 font-[family-name:var(--font-sora)] text-base text-[var(--ts-ink)] placeholder:text-[var(--ts-muted)]/65 outline-none transition focus:border-[var(--ts-teal)] focus:ring-2 focus:ring-[var(--ts-teal)]/20 md:text-sm";

export const authLabelClassName =
  "block font-[family-name:var(--font-sora)] text-sm font-medium text-[var(--ts-ink)]";

export const authPrimaryButtonClassName =
  "w-full rounded-xl bg-[var(--ts-lime)] px-5 py-3.5 font-[family-name:var(--font-sora)] text-sm font-semibold text-[var(--ts-ink)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60";

export const authSecondaryButtonClassName =
  "w-full rounded-xl border border-[var(--ts-ink)]/12 bg-white px-5 py-3 font-[family-name:var(--font-sora)] text-sm font-medium text-[var(--ts-ink)] transition hover:border-[var(--ts-teal)]/40 hover:bg-[var(--ts-mist)]";

export const authLinkClassName =
  "font-[family-name:var(--font-sora)] text-sm font-medium text-[var(--ts-teal)] transition hover:text-[var(--ts-ink)]";

export const authPanelClassName =
  "space-y-4 rounded-2xl border border-[var(--ts-ink)]/10 bg-white/90 p-6 shadow-[0_24px_60px_rgba(16,36,28,0.06)] backdrop-blur-sm";
