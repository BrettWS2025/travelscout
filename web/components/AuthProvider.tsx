"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false); // Start as false so page renders immediately

  useEffect(() => {
    let ignore = false;

    async function loadInitialSession() {
      // Only run on client side
      if (typeof window === "undefined") {
        return;
      }

      try {
        // Set a timeout to prevent infinite loading (5 seconds)
        const timeoutId = setTimeout(() => {
          if (!ignore) {
            console.warn("Auth session loading timeout - continuing without auth");
            setSession(null);
            setUser(null);
          }
        }, 5000);

        const { data, error } = await supabase.auth.getSession();
        clearTimeout(timeoutId);

        if (!ignore) {
          if (error) {
            console.error("Error loading auth session", error);
          }

          setSession(data?.session ?? null);
          setUser(data?.session?.user ?? null);
          setIsLoading(false);
        }
      } catch (err) {
        if (!ignore) {
          console.error("Error loading auth session", err);
          // Set to null session on error so page can still render
          setSession(null);
          setUser(null);
          setIsLoading(false);
        }
      }
    }

    loadInitialSession();

    let subscription: { unsubscribe: () => void } | null = null;
    
    // Only set up listener on client side
    if (typeof window !== "undefined") {
      try {
        const {
          data: { subscription: sub },
        } = supabase.auth.onAuthStateChange((_event: string, newSession: Session | null) => {
          if (!ignore) {
            setSession(newSession);
            setUser(newSession?.user ?? null);
          }
        });
        subscription = sub;
      } catch (err) {
        console.error("Error setting up auth state change listener", err);
      }
    }

    return () => {
      ignore = true;
      if (subscription) {
        try {
          subscription.unsubscribe();
        } catch (err) {
          console.error("Error unsubscribing from auth state changes", err);
        }
      }
    };
  }, []);

  const value: AuthContextValue = { user, session, isLoading };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside an AuthProvider");
  }
  return ctx;
}
