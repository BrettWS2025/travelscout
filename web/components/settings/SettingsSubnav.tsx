"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SETTINGS_NAV_ITEMS } from "@/lib/marketplace/integrations-settings-ui";

function isActive(pathname: string, href: string) {
  if (href === "/account/settings/integrations") {
    return (
      pathname === href ||
      pathname.startsWith("/account/settings/integrations/")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SettingsSubnav() {
  const pathname = usePathname();

  return (
    <div
      className="flex flex-wrap gap-1 rounded-xl border border-[var(--ts-ink)]/10 bg-white/70 p-1"
      role="tablist"
      aria-label="Settings sections"
    >
      {SETTINGS_NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        if (!item.live) {
          return (
            <span
              key={item.href}
              role="tab"
              aria-disabled="true"
              title="Coming soon"
              className="cursor-not-allowed rounded-lg px-3 py-2 font-[family-name:var(--font-sora)] text-sm font-medium text-[var(--ts-muted)]/60"
            >
              {item.label}
            </span>
          );
        }
        return (
          <Link
            key={item.href}
            href={item.href}
            role="tab"
            aria-selected={active}
            className={`rounded-lg px-3 py-2 font-[family-name:var(--font-sora)] text-sm transition ${
              active
                ? "bg-[var(--ts-mist)] font-semibold text-[var(--ts-ink)]"
                : "font-medium text-[var(--ts-muted)] hover:text-[var(--ts-ink)]"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
