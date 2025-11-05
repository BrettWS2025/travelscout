"use client";
import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
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
  description?: string;
  icon?: React.ElementType;
};

type MenuSection = {
  key: string;
  label: string;
  href?: string;
  icon?: React.ElementType;
  items?: MenuItem[];
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
    ],
  },
  {
    key: "destinations",
    label: "Destinations",
    href: "/destinations",
    icon: Compass,
    items: [
      { label: "Popular", href: "/destinations#popular" },
      { label: "Deals", href: "/destinations#deals" },
      { label: "Inspiration", href: "/destinations#inspiration" },
    ],
  },
  {
    key: "deals",
    label: "Deals",
    href: "/deals",
    icon: Percent,
    items: [
      { label: "Flights", href: "/deals#flights" },
      { label: "Packages", href: "/deals#packages" },
      { label: "Flash Sales", href: "/deals#flash" },
    ],
  },
  {
    key: "insights",
    label: "Insights",
    href: "/insights",
    icon: Lightbulb,
    items: [
      { label: "Guides", href: "/insights#guides" },
      { label: "Tips", href: "/insights#tips" },
      { label: "News", href: "/insights#news" },
    ],
  },
];

const VISIBLE_MENU = MENU;

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
        href={section.href || "#"}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-white/5 transition"
        style={{ color: "var(--text)" }}
      >
        {Icon && <Icon className="w-4 h-4" aria-hidden />}
        <span className="text-sm font-medium">{section.label}</span>
        <ChevronDown
          className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </Link>

      {open && section.items && section.items.length > 0 && (
        <div
          className="absolute left-0 mt-2 min-w-[220px] rounded-xl p-2 shadow-lg ring-1 ring-black/5 backdrop-blur"
          style={{
            background:
              "linear-gradient(180deg, rgba(22,22,26,0.9), rgba(22,22,26,0.85))",
            color: "var(--text)",
          }}
        >
          <ul className="space-y-1">
            {section.items.map((item) => (
              <li key={item.label}>
                <Link
                  href={item.href || "#"}
                  className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-white/5 transition"
                  style={{ color: "var(--text)" }}
                >
                  {item.icon && <item.icon className="w-4 h-4" aria-hidden />}
                  <span className="text-sm">{item.label}</span>
                  <ChevronRight className="w-4 h-4 ml-auto opacity-50" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header
      className="sticky top-0 z-50"
      style={{
        background:
          "linear-gradient(180deg, rgba(22,22,26,0.65), rgba(22,22,26,0.35))",
        backdropFilter: "saturate(180%) blur(12px)", // glass effect
        WebkitBackdropFilter: "saturate(180%) blur(12px)", // glass effect
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        color: "var(--text)",
        isolation: "isolate", // its own stacking context
      }}
    >
      <div className="container flex items-center justify-between py-4">
        {/* Logo 1.5× bigger */}
        <Link
          href="/"
          className="flex items-center gap-2"
          style={{ color: "var(--text)" }}
        >
          <Image
            src="/Logo_BGRemove.png"
            alt="TravelScout logo"
            width={706}
            height={313}
            priority
            className="h-9 w-auto"
          />
          <span className="sr-only">TravelScout</span>
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
          aria-expanded={mobileOpen}
          aria-controls="mobile-menu"
          style={{ color: "var(--text)" }}
        >
          <span className="sr-only">Open main menu</span>
          <svg
            className="w-6 h-6"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <path
              d="M4 6h16M4 12h16M4 18h16"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div
          id="mobile-menu"
          className="md:hidden border-t border-white/10"
          style={{
            background:
              "linear-gradient(180deg, rgba(22,22,26,0.9), rgba(22,22,26,0.95))",
          }}
        >
          <div className="container py-4">
            {VISIBLE_MENU.map((section) => {
              const Icon = section.icon;
              return (
                <div key={section.key} className="py-2">
                  <Link
                    href={section.href || "#"}
                    className="flex items-center gap-2 text-base font-medium mb-2"
                    style={{ color: "var(--text)" }}
                  >
                    {Icon && <Icon className="w-5 h-5" aria-hidden />}
                    <span>{section.label}</span>
                  </Link>

                  {section.items && section.items.length > 0 && (
                    <ul className="pl-7 space-y-1">
                      {section.items.map((item) => (
                        <li key={item.label}>
                          <Link
                            href={item.href || "#"}
                            className="block rounded-md px-2 py-2 text-sm hover:bg-white/5"
                            style={{ color: "var(--text)" }}
                          >
                            {item.label}
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
