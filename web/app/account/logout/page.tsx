"use client";

import { useEffect } from "react";
import { useAccountSignOut } from "@/components/account/useAccountSignOut";

/** Legacy /account/logout URL — sign out immediately. */
export default function AccountLogoutPage() {
  const signOut = useAccountSignOut();

  useEffect(() => {
    void signOut();
  }, [signOut]);

  return (
    <div className="py-6 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
      Logging out…
    </div>
  );
}
