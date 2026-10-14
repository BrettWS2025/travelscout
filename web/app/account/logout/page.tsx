"use client";

import { useAccountSignOut } from "@/components/account/useAccountSignOut";
import { authPrimaryButtonClassName } from "@/components/auth/AuthPageFrame";

export default function AccountLogoutPage() {
  const signOut = useAccountSignOut();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-[family-name:var(--font-instrument)] text-3xl text-[var(--ts-ink)]">
          Log out
        </h2>
        <p className="mt-1 font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          Sign out of your account on this device.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--ts-ink)]/10 bg-white/90 p-6 shadow-[0_16px_40px_rgba(16,36,28,0.05)]">
        <p className="font-[family-name:var(--font-sora)] text-sm text-[var(--ts-muted)]">
          You can sign back in any time with the same email and password.
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className={`mt-5 max-w-xs ${authPrimaryButtonClassName}`}
        >
          Log out
        </button>
      </div>
    </div>
  );
}
