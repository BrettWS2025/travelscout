"use client";

import { useAuth } from "@/components/AuthProvider";
import { OperatorLanding } from "@/components/operator/OperatorLanding";
import { OperatorDashboard } from "@/components/operator/OperatorDashboard";

export default function OperatorDashboardPage() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="container py-10">
        <p className="text-slate-500">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <OperatorLanding />;
  }

  return <OperatorDashboard />;
}
