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
  href: string; // main page
  icon: React.ComponentType<{ className?: string }>;
  items: MenuItem[]; // dropdown links
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
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Link
        href={section.href}
        className="flex items-center gap-2 hover:text-[color:var(--accent)]"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Icon className="w-4 h-4" />
        {section.label}
        <ChevronDown className={`w-4 h-4 transition ${open ? "rotate-180" : ""}`} />
      </Link>

      {open && (
        <div
          className="absolute left-0 top-full mt-2 w-64 card p-3"
          role="menu"
          aria-label={section.label}
        >
          <ul className="space-y-1">
            {section.items.map((it) => (
              <li key={it.href}>
                <Link className="block px-2 py-1 rounded hover:bg-black/5" href={it.href}>
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
      className="sticky top-0 z-50 backdrop-blur bg-white/70 border-b"
      style={{ borderColor: "rgba(0,0,0,0.08)" }}
    >
      <div className="container flex items-center justify-between py-4">
        {/* Logo 1.5x bigger */}
        <Link href="/" className="flex items-center gap-2">
          <Plane className="w-9 h-9" />
          <span className="font-semibold tracking-wide text-xl">TravelScout</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          {MENU.map((section) => (
            <NavDropdown key={section.key} section={section} />
          ))}
        </nav>

        {/* Mobile burger */}
        <button
          className="md:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
        >
          ☰
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden container pb-4">
          <div className="card p-2">
            {MENU.map((section) => {
              const Icon = section.icon;
              const isOpen = !!expanded[section.key];
              return (
                <div key={section.key} className="border-b last:border-none" style={{borderColor:"rgba(0,0,0,0.08)"}}>
                  <button
                    className="w-full flex items-center justify-between px-3 py-3"
                    onClick={() =>
                      setExpanded((prev) => ({ ...prev, [section.key]: !prev[section.key] }))
                    }
                    aria-expanded={isOpen}
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="w-4 h-4" /> {section.label}
                    </span>
                    <ChevronDown className={`w-4 h-4 transition ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  {isOpen && (
                    <ul className="px-3 pb-3 space-y-2">
                      {/* Top-level link */}
                      <li>
                        <Link className="link" href={section.href}>Overview</Link>
                      </li>
                      {section.items.map((it) => (
                        <li key={it.href}>
                          <Link className="block" href={it.href}>{it.label}</Link>
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
