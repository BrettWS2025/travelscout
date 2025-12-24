"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/AuthProvider";

type ProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
};

export default function ProfilePage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.push("/auth/login");
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!user) return;

    (async () => {
      setLoading(true);
      setError(null);
      setSaved(false);

      const { data, error } = await supabase
        .from("profiles")
        .select("id,email,display_name")
        .eq("id", user.id)
        .single();

      if (error) {
        setError(error.message);
        setProfile(null);
        setLoading(false);
        return;
      }

      const p = data as ProfileRow;
      setProfile(p);
      setDisplayName(p.display_name ?? "");
      setLoading(false);
    })();
  }, [user]);

  async function handleSave() {
    if (!user) return;

    setLoading(true);
    setError(null);
    setSaved(false);

    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName.trim() || null })
      .eq("id", user.id);

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSaved(true);
    setLoading(false);
  }

  return (
    <main className="container max-w-xl py-10">
      <h1 className="text-3xl font-semibold">Profile</h1>
      <p className="mt-2 text-sm text-white/70">
        Set a display name for your account.
      </p>

      <div className="mt-6 card p-6 space-y-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium">Email</label>
          <div className="rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80">
            {profile?.email ?? user?.email ?? "—"}
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="displayName">
            Display name
          </label>
          <input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Brett"
            className="w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {saved && <p className="text-sm text-emerald-300">Saved.</p>}

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push("/account/itineraries")}
            className="rounded px-4 py-2 text-sm hover:bg-white/10"
            disabled={loading}
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading || isLoading}
            className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
          >
            {loading ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </main>
  );
}
