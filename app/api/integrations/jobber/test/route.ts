import { NextResponse } from "next/server";
import { getCurrentCompany } from "@/lib/auth/company";
import { getJobberAccount, jobberGraphQL } from "@/lib/jobber";
import { decryptToken, encryptToken } from "@/lib/secure-token";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/supabase/config";

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");

  return createAdminClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST() {
  try {
    const { supabase, userId, companyId } = await getCurrentCompany();

    if (!userId || !companyId) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const { data: connection, error } = await supabase
      .from("scheduling_connections")
      .select("*")
      .eq("company_id", companyId)
      .eq("provider", "jobber")
      .maybeSingle();

    if (error) throw error;
    if (!connection?.active || !connection.encrypted_access_token) {
      return NextResponse.json({ ok: false, error: "Jobber is not connected" }, { status: 404 });
    }

    try {
      const account = await getJobberAccount(decryptToken(connection.encrypted_access_token));
      return NextResponse.json({ ok: true, account: account.account });
    } catch (error) {
      if (!connection.encrypted_refresh_token) throw error;

      const clientId = process.env.JOBBER_CLIENT_ID;
      const clientSecret = process.env.JOBBER_CLIENT_SECRET;
      if (!clientId || !clientSecret) throw error;

      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: decryptToken(connection.encrypted_refresh_token),
      });

      const tokenResponse = await fetch("https://api.getjobber.com/api/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body,
        cache: "no-store",
      });

      if (!tokenResponse.ok) throw error;

      const tokens = (await tokenResponse.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
      };

      const account = await getJobberAccount(tokens.access_token);
      const admin = adminClient();
      await admin
        .from("scheduling_connections")
        .update({
          encrypted_access_token: encryptToken(tokens.access_token),
          encrypted_refresh_token: encryptToken(
            tokens.refresh_token ?? decryptToken(connection.encrypted_refresh_token)
          ),
          access_token_expires_at: new Date(
            Date.now() + tokens.expires_in * 1000
          ).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", connection.id);

      return NextResponse.json({ ok: true, account: account.account, refreshed: true });
    }
  } catch (error) {
    console.error("RainShift Jobber test error", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Jobber test failed" },
      { status: 500 }
    );
  }
}
