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
} from "lucide-react";

type MenuItem = { label: string; href: string };
type MenuSection = {
  key: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  items: MenuItem[];
};

const MENU: MenuSection[] = [
  {
    key: "compare",
    label: "Compare",
    href: "/(product)/compare",
    icon: PanelsTopLeft,
    items: [
      { label: "Travel Cards", href: "/(product)/compare#cards" },
      { label: "Travel Insurance", href: "/(product)/compare#insurance" },
      { label: "Airport Lounges", href: "/(product)/compare#lounges" },
      { label: "Airpoints Cards", href: "/(product)/compare#airpoints" },
    ],
  },
  {
    key: "guides",
    label: "Guides",
    href: "/(marketing)/guides",
    icon: Compass,
    items: [
      { label: "Airport Guides", href: "/(marketing)/guides#airports" },
      { label: "Loyalty & Airpoints", href: "/(marketing)/guides#loyalty" },
      { label: "Destination Guides", href: "/(marketing)/guides#destinations" },
    ],
  },
  {
    key: "deals",
    label: "Deals",
    href: "/(marketing)/top-deals",
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
    href: "/(marketing)/tips",
    icon: Lightbulb,
    items: [
      { label: "Packing", href: "/(marketing)/tips#packing" },
      { label: "Family Travel", href: "/(marketing)/tips#family" },
      { label: "Beat Jet Lag", href: "/(marketing)/tips#jetlag" },
      { label: "Save on FX", href: "/(marketing)/tips#fx" },
    ],
  },
];

function NavDropdown({ section }: { section: MenuSection }) {
  const [open, setOpen] = useState(false);
  const Icon = section.icon;
  return (
    // pb-2 extends the hover box down; no more “falling through the gap”
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
          // Removed mt-2, add -mt-px for 1px overlap (no dead space)
          className="absolute left-0 top-full -mt-px w-64 card p-3"
          role="menu"
          aria-label={section.label}
          style={{ color: "var(--text)" }}
        >
          <ul className="space-y-1">
            {section.items.map((it) => (
              <li key={it.href}>
                <Link
                  className="block px-2 py-1 rounded transition-colors hover:bg-white/10"
                  href={it.href}
                  style={{ color: "var(--text)" }}
                >
                  {it.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <header
      className="sticky top-0 z-50 backdrop-blur border-b"
      style={{
        // matches your palette: --bg = #16223A
        background: "rgba(22, 34, 58, 0.85)",
        borderColor: "rgba(255,255,255,0.08)",
        color: "var(--text)",
      }}
    >
      <div className="container flex items-center justify-between py-4">
        {/* Logo 1.5× bigger */}
        <Link href="/" className="flex items-center gap-2" style={{ color: "var(--text)" }}>
          <Plane className="w-9 h-9" />
          <span className="font-semibold tracking-wide text-xl">TravelScout</span>
        </Link>

        {/* Desktop */}
        <nav className="hidden md:flex items-center gap-6">
          {MENU.map((section) => (
            <NavDropdown key={section.key} section={section} />
          ))}
        </nav>

        {/* Mobile toggle */}
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
            {MENU.map((section) => {
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
                      {section.items.map((it) => (
                        <li key={it.href}>
                          <Link className="block" href={it.href} style={{ color: "var(--text)" }}>
                            {it.label}
                          </Link>
                        </li>
                      ))}
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
