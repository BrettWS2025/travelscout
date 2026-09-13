"use client";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import type React from "react";
import { usePathname } from "next/navigation";
import {
  PanelsTopLeft,
  Compass,
  Percent,
  ChevronDown,
  ChevronRight,
  Briefcase,
  LogOut,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";

type MenuItem = {
  label: string;
  href?: string;
  items?: MenuItem[]; // nested submenu
};

type MenuSection = {
  key: string;
  label: string;
  href: string; // main page for the section
  icon: React.ComponentType<{ className?: string }>;
  items: MenuItem[];
};

const MENU: MenuSection[] = [
  {
    key: "compare",
    label: "Compare",
    href: "/compare",
    icon: PanelsTopLeft,
    items: [
      {
        label: "Travel Agencies, OTAs and Direct Bookings",
        href: "/compare/travel-agencies-otas-and-direct",
      },
      { label: "Best Time to Book", href: "/compare/best-time-to-book" },
      { label: "Cruises", href: "/compare/cruise" },
      { label: "Travel Insurance", href: "/compare/travel-insurance" },
    ],
  },
  {
    key: "guides",
    label: "Guides",
    href: "/guides",
    icon: Compass,
    items: [
      { label: "Airport Guides", href: "/(marketing)/guides#airports" },
      { label: "Loyalty & Airpoints", href: "/(marketing)/guides#loyalty" },
      {
        label: "Destinations",
        href: "/guides/destinations",
        items: [{ label: "Kaitaia", href: "/guides/destinations/kaitaia" }],
      },
    ],
  },
  {
    key: "deals",
    label: "Deals",
    href: "/top-deals",
    icon: Percent,
    items: [{ label: "Top Deals", href: "/top-deals/topdeals" }],
  },
  {
    key: "trip-planner",
    label: "Trip Planner",
    href: "/trip-planner",
    icon: Compass,
    items: [{ label: "Plan Your Trip", href: "/trip-planner" }],
  },
  {
    key: "find-deals",
    label: "Find Deals",
    href: "/find-deals",
    icon: Percent,
    items: [],
  },
];

const HIDE_KEYS = new Set<string>(["guides", "compare", "deals", "trip-planner"]);
const VISIBLE_MENU = MENU.filter((s) => !HIDE_KEYS.has(s.key));
const SIMPLE_LINK_KEYS = new Set<string>(["find-deals", "trip-planner"]);

function SubmenuItem({ item }: { item: MenuItem }) {
  const [open, setOpen] = useState(false);
  return (
    <li
      className="relative pb-2"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div className="flex items-center justify-between px-2 py-1 rounded">
        <Link
          href={item.href ?? "#"}
          className="flex-1 transition-colors hover:text-indigo-600 font-medium"
          style={{ color: "var(--text)" }}
        >
          {item.label}
        </Link>
        {item.items && <ChevronRight className="w-4 h-4 opacity-70" />}
      </div>

      {item.items && open && (
        <div
          className="absolute left-full top-0 -ml-px w-64 card p-3 z-50"
          role="menu"
          aria-label={item.label}
          style={{ color: "var(--text)" }}
        >
          <ul className="space-y-1">
            {item.items.map((child) => (
              <li key={child.label}>
                <Link
                  href={child.href ?? "#"}
                  className="block px-2 py-1 rounded transition-colors hover:bg-indigo-50 hover:text-indigo-600"
                  style={{ color: "var(--text)" }}
                >
                  {child.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

function NavDropdown({ section }: { section: MenuSection }) {
  const [open, setOpen] = useState(false);
  const Icon = section.icon;

  return (
    <div
      className="relative pb-2"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Link
        href={section.href}
        className="group flex items-center gap-2 transition-colors hover:text-indigo-600 font-medium"
        aria-haspopup="menu"
        aria-expanded={open}
        style={{ color: "var(--text)" }}
      >
        <Icon className="w-4 h-4" />
        {section.label}
        <ChevronDown
          className={`w-4 h-4 transition ${open ? "rotate-180" : ""}`}
        />
      </Link>

      {open && (
        <div
          className="absolute left-0 top-full -mt-px w-72 card p-3 z-50"
          role="menu"
          aria-label={section.label}
          style={{ color: "var(--text)" }}
        >
          <ul className="space-y-1">
            {section.items.map((it) =>
              it.items ? (
                <SubmenuItem key={it.label} item={it} />
              ) : (
                <li key={it.label}>
                  <Link
                    className="block px-2 py-1 rounded transition-colors hover:bg-indigo-50 hover:text-indigo-600"
                    href={it.href ?? "#"}
                    style={{ color: "var(--text)" }}
                  >
                    {it.label}
                  </Link>
                </li>
              )
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function ProfileMenu({
  isLoggedIn,
  onSignOut,
}: {
  isLoggedIn: boolean;
  onSignOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div 
      className="relative" 
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {!isLoggedIn ? (
        <Link
          href="/auth/login"
          className="flex items-center gap-2 transition-colors hover:text-indigo-600 font-medium"
          style={{ color: "var(--text)" }}
        >
          <Briefcase className="w-4 h-4" />
          <span>Sign in</span>
        </Link>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 transition-colors hover:text-indigo-600 font-medium"
            style={{ color: "var(--text)" }}
            aria-haspopup="menu"
            aria-expanded={open}
          >
            <Briefcase className="w-4 h-4" />
            <span>Account</span>
            <ChevronDown
              className={`w-4 h-4 transition ${open ? "rotate-180" : ""}`}
            />
          </button>

          {open && (
            <div
              className="absolute right-0 top-full pt-1 w-48 z-[9999]"
              role="menu"
              aria-label="Account menu"
              onMouseEnter={() => setOpen(true)}
              onMouseLeave={() => setOpen(false)}
            >
              <div className="card p-2" style={{ color: "#1e293b" }}>
                <ul className="space-y-1 text-sm">
                <li>
                  <Link
                    href="/account/profile"
                    className="flex items-center gap-2 rounded px-2 py-1 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                  >
                    <span>Account details</span>
                  </Link>
                </li>
                <li>
                  <Link
                    href="/account/itineraries"
                    className="flex items-center gap-2 rounded px-2 py-1 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                  >
                    <span>Itineraries</span>
                  </Link>
                </li>
                <li className="border-t border-slate-200 mt-1 pt-1">
                  <button
                    type="button"
                    onClick={async () => {
                      setOpen(false);
                      await onSignOut();
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-red-50 hover:text-red-600 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign out</span>
                  </button>
                </li>
                </ul>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [expandedNested, setExpandedNested] = useState<Record<string, boolean>>(
    {}
  );
  const pathname = usePathname();
  const isTripPlanner = pathname?.includes("/trip-planner");
  const isOverlayNav = pathname === "/";
  const navTextColor = isOverlayNav ? "#ffffff" : "var(--ts-ink, var(--text))";

  const { user } = useAuth();
  const isLoggedIn = !!user;

  const signOutUser = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Error signing out", err);
      alert("Something went wrong signing out. Please try again.");
    }
  };

  const closeMobileMenu = () => {
    setMobileOpen(false);
    setExpanded({});
    setExpandedNested({});
  };

  return (
    <header
      className={`${isOverlayNav ? "absolute inset-x-0 top-0" : "relative"} z-[1000] overflow-visible py-2 md:py-3`}
      style={{
        ["--text" as any]: navTextColor,
        background: isOverlayNav ? "transparent" : "rgba(243, 246, 244, 0.82)",
        WebkitBackdropFilter: isOverlayNav ? "none" : "saturate(160%) blur(18px)",
        backdropFilter: isOverlayNav ? "none" : "saturate(160%) blur(18px)",
        borderBottom:
          isTripPlanner || isOverlayNav ? "none" : "1px solid rgba(16, 36, 28, 0.08)",
        color: navTextColor,
        boxShadow: isTripPlanner || isOverlayNav ? "none" : "0 1px 3px rgba(16, 36, 28, 0.04)",
      }}
    >
      <div className="container navbar-responsive flex items-center justify-between overflow-visible">
        <Link
          href="/"
          className="relative flex items-center min-w-0 shrink py-0"
          style={{ color: navTextColor }}
        >
          <Image
            src="/TravelscoutLogo2Cropped.png"
            alt="TravelScout"
            width={200}
            height={60}
            priority
            className={`pointer-events-none h-[54px] w-auto select-none md:h-[80px] ${isOverlayNav ? "brightness-0 invert" : ""}`}
            sizes="(max-width: 768px) calc(100vw - 72px), 200px"
          />
          <span className="sr-only">TravelScout</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 overflow-visible">
          {VISIBLE_MENU.map((section) => {
            if (SIMPLE_LINK_KEYS.has(section.key)) {
              const Icon = section.icon;
              return (
                <Link
                  key={section.key}
                  href={section.href}
                  className={`group flex items-center gap-2 font-medium transition-colors ${
                    isOverlayNav ? "hover:text-[var(--ts-lime)]" : "hover:text-[var(--ts-teal)]"
                  }`}
                  style={{ color: navTextColor }}
                >
                  <Icon className="h-4 w-4" />
                  {section.label}
                </Link>
              );
            }
            return <NavDropdown key={section.key} section={section} />;
          })}
          <ProfileMenu isLoggedIn={isLoggedIn} onSignOut={signOutUser} />
        </nav>

        <button
          className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-lg transition-colors font-bold text-xl"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
          style={{
            color: navTextColor,
            background: isOverlayNav ? "rgba(16, 36, 28, 0.28)" : "transparent",
          }}
        >
          ☰
        </button>
      </div>

      {mobileOpen && (
        <div className="absolute inset-x-0 top-full z-[1001] md:hidden">
          <div className="container pb-4 pt-2">
            <div className="card p-2" style={{ color: "#10241c" }}>
            {VISIBLE_MENU.map((section) => {
              const Icon = section.icon;
              if (SIMPLE_LINK_KEYS.has(section.key)) {
                return (
                  <div
                    key={section.key}
                    className="border-b border-slate-200 last:border-none"
                  >
                    <Link
                      href={section.href}
                      className="flex items-center gap-2 px-3 py-3 font-medium transition-colors hover:bg-[var(--ts-mist)] hover:text-[var(--ts-teal)]"
                      style={{ color: "#10241c" }}
                      onClick={closeMobileMenu}
                    >
                      <Icon className="h-4 w-4" />
                      {section.label}
                    </Link>
                  </div>
                );
              }
              const isOpen = !!expanded[section.key];
              return (
                <div
                  key={section.key}
                  className="border-b last:border-none border-slate-200"
                >
                  <button
                    className="w-full flex items-center justify-between px-3 py-3 hover:bg-indigo-50 transition-colors font-medium"
                    onClick={() =>
                      setExpanded((prev) => ({
                        ...prev,
                        [section.key]: !prev[section.key],
                      }))
                    }
                    aria-expanded={isOpen}
                    style={{ color: "#111827" }}
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="w-4 h-4" /> {section.label}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 transition ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {isOpen && (
                    <ul className="px-3 pb-3 space-y-2">
                      <li>
                        <Link className="link" href={section.href} onClick={closeMobileMenu}>
                          Overview
                        </Link>
                      </li>

                      {section.items.map((it) => {
                        const key = `${section.key}:${it.label}`;
                        const hasChildren = !!it.items?.length;
                        const open = !!expandedNested[key];

                        if (!hasChildren) {
                          return (
                            <li key={key}>
                              <Link
                                className="block"
                                href={it.href ?? "#"}
                                style={{ color: "#111827" }}
                                onClick={closeMobileMenu}
                              >
                                {it.label}
                              </Link>
                            </li>
                          );
                        }

                        return (
                          <li
                            key={key}
                            className="border-l pl-3 border-slate-200"
                          >
                            <button
                              className="w-full flex items-center justify-between py-2 hover:text-indigo-600 transition-colors"
                              onClick={() =>
                                setExpandedNested((prev) => ({
                                  ...prev,
                                  [key]: !prev[key],
                                }))
                              }
                              aria-expanded={open}
                              style={{ color: "#111827" }}
                            >
                              <span>{it.label}</span>
                              <ChevronDown
                                className={`w-4 h-4 transition ${
                                  open ? "rotate-180" : ""
                                }`}
                              />
                            </button>
                            {open && (
                              <ul className="pl-3 space-y-2">
                                {it.items!.map((child) => (
                                  <li key={child.label}>
                                    <Link
                                      className="block hover:text-indigo-600 transition-colors"
                                      href={child.href ?? "#"}
                                      style={{ color: "#111827" }}
                                      onClick={closeMobileMenu}
                                    >
                                      {child.label}
                                    </Link>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}

            <div className="mt-2 border-t pt-2 border-slate-200">
              {!isLoggedIn ? (
                <Link
                  href="/auth/login"
                  className="flex items-center gap-2 rounded px-3 py-2 text-sm font-medium hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                  onClick={closeMobileMenu}
                >
                  <Briefcase className="w-4 h-4" />
                  <span>Sign in</span>
                </Link>
              ) : (
                <div className="space-y-1 text-sm">
                  <Link
                    href="/account/profile"
                    className="flex items-center gap-2 rounded px-3 py-2 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                    onClick={closeMobileMenu}
                  >
                    <Briefcase className="w-4 h-4" />
                    <span>Account details</span>
                  </Link>
                  <Link
                    href="/account/itineraries"
                    className="flex items-center gap-2 rounded px-3 py-2 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                    onClick={closeMobileMenu}
                  >
                    <span>Itineraries</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      closeMobileMenu();
                      signOutUser();
                    }}
                    className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-red-50 hover:text-red-600 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
          </div>
        </div>
      )}
    </header>
  );
}
