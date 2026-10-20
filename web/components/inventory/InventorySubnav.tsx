"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/account/inventory", label: "Deals", exact: true },
  { href: "/account/inventory/templates", label: "Templates", exact: false },
] as const;

function isActive(pathname: string, href: string, exact: boolean) {
  if (exact) {
    return pathname === href || pathname.startsWith("/account/inventory/deals");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function InventorySubnav() {
  const pathname = usePathname();

  return (
    <div
      className="flex flex-wrap gap-1 rounded-xl border border-[var(--ts-ink)]/10 bg-white/70 p-1"
      role="tablist"
      aria-label="Inventory sections"
    >
      {ITEMS.map((item) => {
        const active = isActive(pathname, item.href, item.exact);
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
