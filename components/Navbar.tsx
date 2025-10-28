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

fun
