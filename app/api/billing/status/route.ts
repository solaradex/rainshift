import { NextResponse } from "next/server";
import { getCurrentCompany } from "@/lib/auth/company";

export async function GET() {
  const { supabase, userId, companyId } = await getCurrentCompany();

  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "Not authenticated" },
      { status: 401 }
    );
  }

  if (!companyId) {
    return NextResponse.json({
      ok: true,
      hasCompany: false,
      needsOnboarding: true,
      needsCheckout: false,
    });
  }

  const [{ data: company, error: companyError }, { data: billing, error: billingError }] =
    await Promise.all([
      supabase.from("companies").select("id,name").eq("id", companyId).maybeSingle(),
      supabase
        .from("billing_accounts")
        .select(
          "plan,status,trial_ends_at,current_period_end,cancel_at_period_end"
        )
        .eq("company_id", companyId)
        .maybeSingle(),
    ]);

  if (companyError) throw companyError;
  if (billingError) throw billingError;

  const needsCheckout =
    !billing || billing.status === "INCOMPLETE";

  return NextResponse.json({
    ok: true,
    hasCompany: true,
    needsOnboarding: false,
    needsCheckout,
    company: company
      ? { id: company.id, name: company.name }
      : null,
    billing: billing ?? null,
  });
}
