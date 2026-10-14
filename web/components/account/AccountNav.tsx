"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, LogOut, Package, Settings, User } from "lucide-react";
import { useIsOperatorProfile } from "@/components/account/useIsOperatorProfile";

const travelerNavItems = [
  {
    href: "/account/details",
    label: "Account details",
    icon: User,
  },
  {
    href: "/account/logout",
    label: "Log out",
    icon: LogOut,
  },
] as const;

const operatorNavItems = [
  {
    href: "/account/details",
    label: "Account details",
    icon: User,
  },
  {
    href: "/account/inventory",
    label: "Inventory",
    icon: Package,
  },
  {
    href: "/account/settings",
    label: "Settings",
    icon: Settings,
  },
  {
    href: "/account/logout",
    label: "Log out",
    icon: LogOut,
  },
] as const;

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AccountNav() {
  const pathname = usePathname();
  const { isOperatorProfile } = useIsOperatorProfile();
  // Inventory/settings only for operator profiles; travelers stay on details + log out.
  const navItems = isOperatorProfile ? operatorNavItems : travelerNavItems;
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeItem =
    navItems.find((item) => isActivePath(pathname, item.href)) ?? navItems[0];

  return (
    <nav aria-label="Account">
      <div className="md:hidden">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--ts-ink)]/10 bg-white/90 px-4 py-3 font-[family-name:var(--font-sora)] text-sm font-medium text-[var(--ts-ink)] shadow-[0_12px_30px_rgba(16,36,28,0.05)] backdrop-blur-sm"
          onClick={() => setMobileOpen((open) => !open)}
          aria-expanded={mobileOpen}
          aria-controls="account-mobile-nav"
        >
          <span className="inline-flex items-center gap-2.5">
            <activeItem.icon className="h-4 w-4 text-[var(--ts-teal)]" />
            {activeItem.label}
          </span>
          <ChevronDown
            className={`h-4 w-4 text-[var(--ts-muted)] transition ${
              mobileOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {mobileOpen && (
          <div
            id="account-mobile-nav"
            className="mt-2 overflow-hidden rounded-xl border border-[var(--ts-ink)]/10 bg-white/95 p-1.5 shadow-[0_16px_40px_rgba(16,36,28,0.08)]"
          >
            {navItems.map((item) => (
              <AccountNavLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isActivePath(pathname, item.href)}
                onNavigate={() => setMobileOpen(false)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="hidden md:block">
        <p className="mb-3 font-[family-name:var(--font-sora)] text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--ts-teal)]">
          Account
        </p>
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.href}>
              <AccountNavLink
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isActivePath(pathname, item.href)}
              />
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

type AccountNavLinkProps = {
  href: string;
  label: string;
  icon: typeof User;
  active: boolean;
  onNavigate?: () => void;
};

function AccountNavLink({
  href,
  label,
  icon: Icon,
  active,
  onNavigate,
}: AccountNavLinkProps) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 font-[family-name:var(--font-sora)] text-sm transition ${
        active
          ? "bg-[var(--ts-mist)] font-semibold text-[var(--ts-ink)]"
          : "font-medium text-[var(--ts-muted)] hover:bg-white/70 hover:text-[var(--ts-ink)]"
      }`}
      aria-current={active ? "page" : undefined}
    >
      <Icon
        className={`h-4 w-4 shrink-0 ${
          active ? "text-[var(--ts-teal)]" : "text-[var(--ts-muted)]"
        }`}
      />
      {label}
    </Link>
  );
}
