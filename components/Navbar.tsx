"use client";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import type React from "react";
import {
  PanelsTopLeft,
  Compass,
  Percent,
  Lightbulb,
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
    icon: Lightbulb,
    items: [{ label: "Plan Your Trip", href: "/trip-planner" }],
  },
];

/**
 * TEMPORARY HIDES:
 * Add keys here to hide sections from the navbar
 * without deleting their configuration.
 */
const HIDE_KEYS = new Set<string>(["guides"]);
const VISIBLE_MENU = MENU.filter((s) => !HIDE_KEYS.has(s.key));

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
          className="flex-1 transition-colors hover:text-[var(--accent)]"
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
                  className="block px-2 py-1 rounded transition-colors hover:bg-white/10"
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
        className="group flex items-center gap-2 transition-colors hover:text-[var(--accent)]"
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
                    className="block px-2 py-1 rounded transition-colors hover:bg-white/10"
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

/**
 * Desktop profile / account menu.
 */
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
      className="relative pb-2"
      onMouseLeave={() => setOpen(false)}
    >
      {!isLoggedIn ? (
        <Link
          href="/auth/login"
          className="flex items-center gap-2 transition-colors hover:text-[var(--accent)]"
          style={{ color: "var(--text)" }}
        >
          <Briefcase className="w-4 h-4" />
          <span>Sign in</span>
        </Link>
      ) : (
        <>
          <button
            type="button"
            onMouseEnter={() => setOpen(true)}
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 transition-colors hover:text-[var(--accent)]"
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
              className="absolute right-0 top-full -mt-px w-48 card p-2 z-50"
              role="menu"
              aria-label="Account menu"
              style={{ color: "var(--text)" }}
            >
              <ul className="space-y-1 text-sm">
                <li>
                  <Link
                    href="/account/details"
                    className="flex items-center gap-2 rounded px-2 py-1 hover:bg-white/10"
                  >
                    <span>Account details</span>
                  </Link>
                </li>
                <li>
                  <Link
                    href="/account/itineraries"
                    className="flex items-center gap-2 rounded px-2 py-1 hover:bg-white/10"
                  >
                    <span>Itineraries</span>
                  </Link>
                </li>
                <li className="border-t border-white/10 mt-1 pt-1">
                  <button
                    type="button"
                    onClick={async () => {
                      setOpen(false);
                      await onSignOut();
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-white/10"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign out</span>
                  </button>
                </li>
              </ul>
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
  const [expandedNested, setExpandedNested] = useState<
    Record<string, boolean>
  >({});

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

  return (
    <header
      className="sticky top-0 z-[1000]"
      style={{
        background: "rgba(22,34,58,0.55)", // translucent over --bg
        WebkitBackdropFilter: "saturate(160%) blur(12px)",
        backdropFilter: "saturate(160%) blur(12px)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        color: "var(--text)",
        isolation: "isolate",
      }}
    >
      <div className="container flex items-center justify-between py-4">
        {/* LOGO + HOME LINK (restored) */}
        <Link
          href="/"
          className="relative flex items-center min-w-0 shrink"
          style={{ color: "var(--text)" }}
        >
          <span
            className="
              relative block h-10
              w-[433px] max-w-[calc(100vw-72px)]
              md:w-[541px] md:max-w-none
              overflow-visible
            "
          >
            <Image
              src="/TravelScout-Main.png"
              alt="TravelScout"
              width={706}
              height={313}
              priority
              className="absolute left-0 top-1/2 translate-y-[calc(-50%+32px)] h-[192px] md:h-[240px] w-auto select-none pointer-events-none"
              sizes="(max-width: 768px) calc(100vw - 72px), 541px"
            />
          </span>
          <span className="sr-only">TravelScout</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          {VISIBLE_MENU.map((section) => (
            <NavDropdown key={section.key} section={section} />
          ))}
          <ProfileMenu isLoggedIn={isLoggedIn} onSignOut={signOutUser} />
        </nav>

        {/* Mobile burger */}
        <button
          className="md:hidden inline-flex h-10 w-10 items-center justify-center"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
          style={{ color: "var(--text)" }}
        >
          ☰
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden container pb-4">
          <div className="card p-2" style={{ color: "var(--text)" }}>
            {VISIBLE_MENU.map((section) => {
              const Icon = section.icon;
              const isOpen = !!expanded[section.key];
              return (
                <div
                  key={section.key}
                  className="border-b last:border-none"
                  style={{ borderColor: "rgba(255,255,255,0.08)" }}
                >
                  <button
                    className="w-full flex items-center justify-between px-3 py-3"
                    onClick={() =>
                      setExpanded((prev) => ({
                        ...prev,
                        [section.key]: !prev[section.key],
                      }))
                    }
                    aria-expanded={isOpen}
                    style={{ color: "var(--text)" }}
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
                        <Link className="link" href={section.href}>
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
                                style={{ color: "var(--text)" }}
                              >
                                {it.label}
                              </Link>
                            </li>
                          );
                        }

                        return (
                          <li
                            key={key}
                            className="border-l pl-3"
                            style={{
                              borderColor: "rgba(255,255,255,0.12)",
                            }}
                          >
                            <button
                              className="w-full flex items-center justify-between py-2"
                              onClick={() =>
                                setExpandedNested((prev) => ({
                                  ...prev,
                                  [key]: !prev[key],
                                }))
                              }
                              aria-expanded={open}
                              style={{ color: "var(--text)" }}
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
                                      className="block"
                                      href={child.href ?? "#"}
                                      style={{ color: "var(--text)" }}
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

            {/* Mobile account / sign-in block at bottom */}
            <div className="mt-2 border-t pt-2 border-white/10">
              {!isLoggedIn ? (
                <Link
                  href="/auth/login"
                  className="flex items-center gap-2 rounded px-3 py-2 text-sm font-medium hover:bg-white/10"
                >
                  <Briefcase className="w-4 h-4" />
                  <span>Sign in</span>
                </Link>
              ) : (
                <div className="space-y-1 text-sm">
                  <Link
                    href="/account/details"
                    className="flex items-center gap-2 rounded px-3 py-2 hover:bg-white/10"
                  >
                    <Briefcase className="w-4 h-4" />
                    <span>Account details</span>
                  </Link>
                  <Link
                    href="/account/itineraries"
                    className="flex items-center gap-2 rounded px-3 py-2 hover:bg-white/10"
                  >
                    <span>Itineraries</span>
                  </Link>
                  <button
                    type="button"
                    onClick={signOutUser}
                    className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-white/10"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
