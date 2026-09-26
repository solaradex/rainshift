import { NextResponse } from "next/server";
import { getCurrentCompany } from "@/lib/auth/company";
import { exchangeJobberCode, getJobberAccount } from "@/lib/jobber";
import { encryptToken } from "@/lib/secure-token";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/supabase/config";

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");

  return createAdminClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function classifyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("Jobber token exchange failed")) return "oauth_token_exchange";
  if (message.includes("Jobber GraphQL request failed")) return "jobber_api";
  if (message.includes("SCHEDULING_TOKEN_ENCRYPTION_KEY")) return "encryption_config";
  if (message.includes("SUPABASE_SERVICE_ROLE_KEY")) return "supabase_config";
  return "connection";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const expectedState = request.headers.get("cookie")?.match(
      /(?:^|; )rainshift_jobber_state=([^;]+)/
    )?.[1];
    const verifier = request.headers.get("cookie")?.match(
      /(?:^|; )rainshift_jobber_verifier=([^;]+)/
    )?.[1];
    const cookieCompanyId = request.headers.get("cookie")?.match(
      /(?:^|; )rainshift_jobber_company=([^;]+)/
    )?.[1];

    if (!code || !state || !expectedState || state !== expectedState || !verifier) {
      return NextResponse.json(
        { ok: false, error: "Invalid Jobber OAuth callback" },
        { status: 400 }
      );
    }

    const { userId, companyId } = await getCurrentCompany();
    if (!userId || !companyId || cookieCompanyId !== companyId) {
      return NextResponse.json(
        { ok: false, error: "Jobber connection does not match the active company" },
        { status: 403 }
      );
    }

    const redirectUri = new URL(
      "/api/integrations/jobber/callback",
      request.url
    ).toString();

    const tokens = await exchangeJobberCode(code, redirectUri, verifier);
    const account = await getJobberAccount(tokens.access_token);
    const supabase = adminClient();

    const { error: connectionError } = await supabase
      .from("scheduling_connections")
      .upsert(
        {
          company_id: companyId,
          provider: "jobber",
          external_account_id: account.account.id,
          external_account_name: account.account.name,
          encrypted_access_token: encryptToken(tokens.access_token),
          encrypted_refresh_token: encryptToken(tokens.refresh_token),
          access_token_expires_at: new Date(
            Date.now() + tokens.expires_in * 1000
          ).toISOString(),
          active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id,provider" }
      );

    if (connectionError) throw connectionError;

    const response = NextResponse.redirect(
      new URL("/?jobber=connected", request.url)
    );
    response.cookies.delete("rainshift_jobber_state");
    response.cookies.delete("rainshift_jobber_verifier");
    response.cookies.delete("rainshift_jobber_company");
    return response;
  } catch (error) {
    console.error("RainShift Jobber callback error", error);
    const reason = classifyError(error);
    const detail =
      error instanceof Error ? error.message : "Unknown Jobber connection error";
    const responseUrl = new URL("/?jobber=error", request.url);
    responseUrl.searchParams.set("reason", reason);
    responseUrl.searchParams.set("detail", detail.slice(0, 500));
    return NextResponse.redirect(responseUrl);
  }
}
