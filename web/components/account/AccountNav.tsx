"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, LogOut, Package, Settings, User } from "lucide-react";
import { useAccountSignOut } from "@/components/account/useAccountSignOut";
import { useIsOperatorProfile } from "@/components/account/useIsOperatorProfile";

const travelerNavItems = [
  {
    href: "/account/details",
    label: "Account Details",
    icon: User,
  },
] as const;

const operatorNavItems = [
  {
    href: "/account/details",
    label: "Account Details",
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
] as const;

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AccountNav() {
  const pathname = usePathname();
  const { isOperatorProfile } = useIsOperatorProfile();
  const signOut = useAccountSignOut();
  const navItems = isOperatorProfile ? operatorNavItems : travelerNavItems;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const activeItem =
    navItems.find((item) => isActivePath(pathname, item.href)) ?? navItems[0];

  async function handleLogOut() {
    if (signingOut) return;
    setSigningOut(true);
    setMobileOpen(false);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

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
            <AccountLogOutButton
              onClick={() => void handleLogOut()}
              disabled={signingOut}
            />
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
          <li>
            <AccountLogOutButton
              onClick={() => void handleLogOut()}
              disabled={signingOut}
            />
          </li>
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

function AccountLogOutButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 font-[family-name:var(--font-sora)] text-sm font-medium text-[var(--ts-muted)] transition hover:bg-white/70 hover:text-[var(--ts-ink)] disabled:opacity-60"
    >
      <LogOut className="h-4 w-4 shrink-0 text-[var(--ts-muted)]" />
      {disabled ? "Logging out…" : "Log out"}
    </button>
  );
}
