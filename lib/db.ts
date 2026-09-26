import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://wdogyzxegggywxcekvqr.supabase.co";
const supabasePublishableKey = "sb_publishable_ddBDu3ajFkTPNW8HRbQHtA_rysIdvW9";

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);
