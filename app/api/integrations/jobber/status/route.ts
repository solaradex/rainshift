import { NextResponse } from "next/server";
import { getCurrentCompany } from "@/lib/auth/company";

export async function GET() {
  const { supabase, userId, companyId } = await getCurrentCompany();

  if (!userId || !companyId) {
    return NextResponse.json({ ok: false, connected: false }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("scheduling_connections")
    .select("provider,external_account_id,external_account_name,active,access_token_expires_at")
    .eq("company_id", companyId)
    .eq("provider", "jobber")
    .maybeSingle();

  if (error) throw error;

  return NextResponse.json({
    ok: true,
    connected: Boolean(data?.active),
    connection: data
      ? {
          accountName: data.external_account_name,
          accountId: data.external_account_id,
          tokenExpiresAt: data.access_token_expires_at,
        }
      : null,
  });
}
