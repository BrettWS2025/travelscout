"use client";
import Link from "next/link";
import { useState } from "react";
import {
  Plane,
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
      { label: "Attractions", href: "/(product)/compare#lounges" },
      { label: "Travel Insurance", href: "/compare/travel-insurance" },
      { label: "Travel Agencies, OTAs and Direct Bookings", href: "/compare/travel-agencies-otas-and-direct" },
    ],
  },
  {
    key: "guides",
    label: "Guides",
    href: "/guides",
    icon: Compass,
    items: [
      // regular links
      { label: "Airport Guides", href: "/(marketing)/guides#airports" },
      { label: "Loyalty & Airpoints", href: "/(marketing)/guides#loyalty" },
      // nested submenu: Guides > Destinations > Kaitaia
      {
        label: "Destinations",
        href: "/guides/destinations",
        items: [
          { label: "Kaitaia", href: "/guides/destinations/kaitaia" },
          // add more destinations later
        ],
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

/** 
 * TEMPORARY HIDES:
 * Add keys here to hide sections from the navbar
 * without deleting their configuration.
 */
const HIDE_KEYS = new Set<string>(["guides", "tips"]);

// Derived visible menu (desktop + mobile)
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
    // pb-2 extends hover area; remove vertical gap between trigger and menu
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
        <ChevronDown className={`w-4 h-4 transition ${open ? "rotate-180" : ""}`} />
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

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [expandedNested, setExpandedNested] = useState<Record<string, boolean>>({});

  return (
    <header
      className="sticky top-0 z-[1000]"
      style={{
        background: "rgba(22,34,58,0.55)",             // translucent over your --bg (#16223A)
        WebkitBackdropFilter: "saturate(160%) blur(12px)",
        backdropFilter: "saturate(160%) blur(12px)",    // glass effect
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        color: "var(--text)",
        isolation: "isolate",                           // its own stacking context
      }}
    >
      <div className="container flex items-center justify-between py-4">
        {/* Logo 1.5× bigger */}
        <Link href="/" className="flex items-center gap-2" style={{ color: "var(--text)" }}>
          <Plane className="w-9 h-9" />
          <span className="font-semibold tracking-wide text-xl">TravelScout</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          {VISIBLE_MENU.map((section) => (
            <NavDropdown key={section.key} section={section} />
          ))}
        </nav>

        {/* Mobile burger */}
        <button
          className="md:hidden"
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
