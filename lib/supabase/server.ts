import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Create a Supabase client for server-side operations (API routes, server components)
 * This client can read the user's session from cookies
 */
export function createServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables. " +
        "Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment."
    );
  }

  // Extract project ref from URL for cookie names
  const projectRef = supabaseUrl.replace("https://", "").replace(".supabase.co", "").split(".")[0];

  // Create client with cookie-based auth
  // Supabase stores session in cookies with pattern: sb-<project-ref>-auth-token
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: {
        getItem: (key: string) => {
          try {
            const cookieStore = cookies();
            // Supabase uses specific cookie names
            // Try both the key and the auth token cookie name
            const cookieName = key.startsWith("sb-") ? key : `sb-${projectRef}-auth-token`;
            return cookieStore.get(cookieName)?.value ?? null;
          } catch {
            return null;
          }
        },
        setItem: () => {
          // No-op for server-side
        },
        removeItem: () => {
          // No-op for server-side
        },
      },
    },
  });
}

/**
 * Get the current user from the request
 * Returns null if not authenticated
 * 
 * For API routes, you can also pass the Authorization header:
 * const authHeader = req.headers.get('authorization');
 */
export async function getServerUser(authToken?: string) {
  try {
    // If auth token is provided (from Authorization header), use it directly
    if (authToken) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseAnonKey) {
        return null;
      }

      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const token = authToken.replace("Bearer ", "").trim();
      
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(token);

      if (error || !user) {
        return null;
      }

      return user;
    }

    // Otherwise, try to get user from session (cookies)
    const supabase = createServerClient();
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session?.user) {
      return null;
    }

    return session.user;
  } catch (error) {
    console.error("Error getting server user:", error);
    return null;
  }
}
