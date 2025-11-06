"use client";

import Link from "next/link";
import Image from "next/image";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  PanelsTopLeft,
  Compass,
  Percent,
  Lightbulb,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

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
      { label: "Airlines", href: "/(product)/compare#airpoints" },
      { label: "Hotels", href: "/(product)/compare#cards" },
      { label: "Rental Cars", href: "/(product)/compare#lounges" },
      { label: "Cruising", href: "/(product)/compare#lounges" },
      { label: "Tours", href: "/(product)/compare#lounges" },
      { label: "Travel Insurance", href: "/compare/travel-insurance" },
      {
        label: "Travel Agencies, OTAs and Direct Bookings",
        href: "/compare/travel-agencies-otas-and-direct",
      },
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
    items: [
      { label: "Top Deals", href: "/(marketing)/top-deals" },
      { label: "Weekly Sales", href: "/(marketing)/top-deals#weekly" },
      { label: "Error Fares", href: "/(marketing)/top-deals#error-fares" },
    ],
  },
  {
    key: "tips",
    label: "Tips",
    href: "/tips",
    icon: Lightbulb,
    items: [
      { label: "Packing", href: "/(marketing)/tips#packing" },
      { label: "Family Travel", href: "/(marketing)/tips#family" },
      { label: "Beat Jet Lag", href: "/(marketing)/tips#jetlag" },
      { label: "Save on FX", href: "/(marketing)/tips#fx" },
    ],
  },
];

/** TEMPORARY HIDES */
const HIDE_KEYS = new Set<string>(["guides", "tips"]);
const VISIBLE_MENU = MENU.filter((s) => !HIDE_KEYS.has(s.key));

/* --------------------------------- */
/*            MENU PORTAL            */
/* --------------------------------- */

function useIsomorphicLayoutEffect(cb: React.EffectCallback, deps: React.DependencyList) {
  // SSR-safe layout effect
  const isBrowser = typeof window !== "undefined";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return (isBrowser ? useLayoutEffect : useEffect)(cb, deps);
}

type MenuPortalProps = {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement>;
  onClose: () => void;
  render: () => React.ReactNode;
  widthPx?: number; // desired width (tailwind w-72 ≈ 288px)
};

function MenuPortal({ open, anchorRef, onClose, render, widthPx = 288 }: MenuPortalProps) {
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [portalEl, setPortalEl] = useState<Element | null>(null);

  useEffect(() => {
    if (typeof document !== "undefined") setPortalEl(document.body);
  }, []);

  // Position panel under anchor (viewport coords)
  useIsomorphicLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();

    // Clamp so the panel does not overflow the right edge
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - widthPx - 8));
    const top = rect.bottom; // directly under the trigger
    setPos({ top, left });
  }, [open, anchorRef, widthPx]);

  // Close when mouse leaves the panel area (typical hover dropdown behavior)
  useEffect(() => {
    if (!open) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open || !portalEl) return null;

  const panel = (
    <div
      ref={panelRef}
      className="fixed z-[9999]"
      style={{ top: pos.top, left: pos.left, width: widthPx }}
      onMouseLeave={onClose}
      onMouseEnter={() => {/* keep open */}}
    >
      <div
        className="
          p-3 rounded-md border border-white/10 shadow-xl
          bg-[rgba(22,34,58,0.98)] backdrop-blur
        "
        style={{ color: "var(--text)" }}
      >
        {render()}
      </div>
    </div>
  );

  return createPortal(panel, portalEl);
}

/* --------------------------------- */
/*            SUBMENUS               */
/* --------------------------------- */

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

      {/* Nested submenu (still within the portal panel, so no navbar scrolling) */}
      {item.items && open && (
        <div
          className="
            absolute left-full top-0 -ml-px w-64 p-3 z-[1000]
            rounded-md border border-white/10 shadow-xl
            bg-[rgba(22,34,58,0.98)] backdrop-blur
          "
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
  const anchorRef = useRef<HTMLSpanElement>(null);

  return (
    <div
      className="relative pb-2"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {/* Anchor span to measure position reliably (Link refs can be tricky) */}
      <span ref={anchorRef}>
        <Link
          href={section.href}
          className="group flex items-center gap-2 transition-colors hover:text-[var(--accent)]"
          aria-haspopup="menu"
          aria-expanded={open}
          style={{ color: "var(--text)" }}
        >
          <Icon className="w-4 h-4" />
          {section.label}
          <ChevronDown className={`w-4 h-4 transition ${open ? "rotate-180" : ""}`} />
        </Link>
      </span>

      {/* Render the dropdown in a portal so it never scrolls the navbar */}
      <MenuPortal
        open={open}
        anchorRef={anchorRef}
        onClose={() => setOpen(false)}
        widthPx={288} // Tailwind w-72
        render={() => (
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
        )}
      />
    </div>
  );
}

/* --------------------------------- */
/*               NAV                 */
/* --------------------------------- */

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [expandedNested, setExpandedNested] = useState<Record<string, boolean>>({});

  return (
    <header
      className="sticky top-0 z-[100] overflow-x-hidden"
      style={{
        background: "rgba(22,34,58,0.55)",            // translucent over your --bg (#16223A)
        WebkitBackdropFilter: "saturate(160%) blur(12px)",
        backdropFilter: "saturate(160%) blur(12px)",   // glass effect
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        color: "var(--text)",
        isolation: "isolate",
      }}
    >
      <div className="container flex items-center justify-between gap-2 py-4 overflow-visible">
        {/* Large logo, fully centered, clamped on mobile so it never pushes burger off-screen */}
        <Link href="/" className="relative flex items-center min-w-0 shrink-0" style={{ color: "var(--text)" }}>
          <span
            className="
              relative block h-10
              w-[min(420px,calc(100vw-72px))] md:w-[541px]
              overflow-visible
              [--logo-shift:10px] sm:[--logo-shift:12px] md:[--logo-shift:14px] lg:[--logo-shift:16px]
            "
          >
            <Image
              src="/TravelScout-Main.png"
              alt="TravelScout"
              width={706}
              height={313}
              priority
              className="
                absolute left-0 top-1/2
                translate-y-[calc(-50%+var(--logo-shift))]
                h-[148px] sm:h-[168px] md:h-[220px] lg:h-[240px]
                w-auto select-none pointer-events-none
              "
              sizes="(max-width: 480px) calc(100vw - 72px), (max-width: 768px) calc(100vw - 72px), 541px"
            />
          </span>
          <span className="sr-only">TravelScout</span>
        </Link>

        {/* Desktop nav (hover to open; portals handle the dropdown panels) */}
        <nav className="hidden md:flex items-center gap-6 overflow-visible">
          {VISIBLE_MENU.map((section) => (
            <NavDropdown key={section.key} section={section} />
          ))}
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

      {/* Mobile drawer (unchanged) */}
      {mobileOpen && (
        <div className="md:hidden container pb-4">
          <div
            className="
              p-2
              rounded-md border border-white/10 shadow-lg
              bg-[rgba(22,34,58,0.9)] backdrop-blur
            "
            style={{ color: "var(--text)" }}
          >
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
                      setExpanded((prev) => ({ ...prev, [section.key]: !prev[section.key] }))
                    }
                    aria-expanded={isOpen}
                    style={{ color: "var(--text)" }}
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="w-4 h-4" /> {section.label}
                    </span>
                    <ChevronDown className={`w-4 h-4 transition ${isOpen ? "rotate-180" : ""}`} />
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
                              <Link className="block" href={it.href ?? "#"} style={{ color: "var(--text)" }}>
                                {it.label}
                              </Link>
                            </li>
                          );
                        }

                        return (
                          <li key={key} className="border-l pl-3" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
                            <button
                              className="w-full flex items-center justify-between py-2"
                              onClick={() =>
                                setExpandedNested((prev) => ({ ...prev, [key]: !prev[key] }))
                              }
                              aria-expanded={open}
                              style={{ color: "var(--text)" }}
                            >
                              <span>{it.label}</span>
                              <ChevronDown className={`w-4 h-4 transition ${open ? "rotate-180" : ""}`} />
                            </button>
                            {open && (
                              <ul className="pl-3 space-y-2">
                                {it.items!.map((child) => (
                                  <li key={child.label}>
                                    <Link className="block" href={child.href ?? "#"} style={{ color: "var(--text)" }}>
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
          </div>
        </div>
      )}
    </header>
  );
}
