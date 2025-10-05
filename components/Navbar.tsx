"use client";
import Link from "next/link";
import { Plane, Compass, Percent, PanelsTopLeft } from "lucide-react";
import { useState } from "react";
export function Navbar() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 backdrop-blur bg-black/50 border-b border-white/10">
      <div className="container flex items-center justify-between py-4">
        <Link href="/" className="flex items-center gap-2">
          <Plane className="w-6 h-6" />
          <span className="font-semibold tracking-wide">TravelScout</span>
        </Link>
        <nav className="hidden md:flex items-center gap-6">
          <Link href="/(product)/compare" className="hover:text-[color:var(--accent)] flex items-center gap-2"><PanelsTopLeft className="w-4 h-4" />Compare</Link>
          <Link href="/(marketing)/guides" className="hover:text-[color:var(--accent)] flex items-center gap-2"><Compass className="w-4 h-4" />Guides</Link>
          <Link href="/(marketing)/deals" className="hover:text-[color:var(--accent)] flex items-center gap-2"><Percent className="w-4 h-4" />Deals</Link>
        </nav>
        <button className="md:hidden" onClick={()=>setOpen(!open)} aria-label="Toggle menu">☰</button>
      </div>
      {open && (
        <div className="md:hidden container pb-4">
          <div className="card p-4 flex flex-col gap-3">
            <Link href="/(product)/compare">Compare</Link>
            <Link href="/(marketing)/guides">Guides</Link>
            <Link href="/(marketing)/deals">Deals</Link>
          </div>
        </div>
      )}
    </header>
  );
}
