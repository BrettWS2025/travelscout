"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

export default function OperatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.push(`/auth/login?returnTo=${encodeURIComponent(pathname || "/operator")}`);
    }
  }, [user, isLoading, router, pathname]);

  if (isLoading) {
    return (
      <div className="container py-10">
        <p className="text-slate-500">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container py-10">
        <p className="text-slate-500">Redirecting to sign in…</p>
      </div>
    );
  }

  return (
    <div className="container py-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-indigo-600">Operator</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Last-minute deals
          </h1>
          <p className="mt-1 text-slate-600">
            Publish unsold activity inventory for departure within 3 days.
          </p>
        </div>
        <nav className="flex flex-wrap gap-2 text-sm">
          <Link
            href="/operator"
            className="rounded-lg px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50"
          >
            Dashboard
          </Link>
          <Link
            href="/operator/organizations/new"
            className="rounded-lg px-3 py-2 text-white"
            style={{
              background: "linear-gradient(to right, #3b82f6, #6366f1)",
            }}
          >
            New organization
          </Link>
        </nav>
      </div>
      {children}
    </div>
  );
}
