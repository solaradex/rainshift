import { NextResponse } from "next/server";
import { getCurrentCompany } from "@/lib/auth/company";
import { getPayPalClientId } from "@/lib/paypal";

export async function GET() {
  const { userId, companyId } = await getCurrentCompany();

  if (!userId || !companyId) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    clientId: getPayPalClientId(),
    plans: {
      starter: process.env.PAYPAL_PLAN_STARTER ?? null,
      growth: process.env.PAYPAL_PLAN_GROWTH ?? null,
      pro: process.env.PAYPAL_PLAN_PRO ?? null,
    },
  });
}