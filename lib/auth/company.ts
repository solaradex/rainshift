import { createClient } from "@/lib/supabase/server";

export async function getCurrentCompany() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    return { supabase, userId: null, companyId: null };
  }

  const userId = String(data.claims.sub);

  const { data: membership, error: membershipError } = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership) {
    return { supabase, userId, companyId: null };
  }

  return { supabase, userId, companyId: membership.company_id as string };
}
