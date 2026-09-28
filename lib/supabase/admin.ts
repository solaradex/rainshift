import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

export function createAdminClient() {
  const key = process.env.SUPABASE_ADMIN_KEY;
  if (!key) throw new Error("SUPABASE_ADMIN_KEY is not configured");

  return createClient(SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
