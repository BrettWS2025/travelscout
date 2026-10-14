"use client";

import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

export function useAccountSignOut() {
  const router = useRouter();

  return async () => {
    try {
      await supabase.auth.signOut();
      router.push("/auth/login");
    } catch (err) {
      console.error("Error signing out", err);
      alert("Something went wrong signing out. Please try again.");
    }
  };
}
