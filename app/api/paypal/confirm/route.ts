import { NextResponse } from "next/server";
import { getCurrentCompany } from "@/lib/auth/company";
import { paypalRequest, type PayPalSubscription } from "@/lib/paypal";

const planEnv = {
  starter: "PAYPAL_PLAN_STARTER",
  growth: "PAYPAL_PLAN_GROWTH",
  pro: "PAYPAL_PLAN_PRO",
} as const;

export async function POST(request: Request) {
  try {
    const { supabase, userId, companyId } = await getCurrentCompany();

    if (!userId || !companyId) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      subscriptionId?: string;
      plan?: keyof typeof planEnv;
    };

    if (!body.subscriptionId || !body.plan) {
      return NextResponse.json(
        { ok: false, error: "Missing PayPal subscription details" },
        { status: 400 }
      );
    }

    const expectedPlanId = process.env[planEnv[body.plan]];
    if (!expectedPlanId) {
      return NextResponse.json(
        { ok: false, error: "PayPal plan is not configured" },
        { status: 503 }
      );
    }

    const subscription = await paypalRequest<PayPalSubscription>(
      `/v1/billing/subscriptions/${encodeURIComponent(body.subscriptionId)}`
    );

    if (subscription.plan_id !== expectedPlanId) {
      return NextResponse.json(
        { ok: false, error: "PayPal subscription plan does not match the selected RainShift plan" },
        { status: 403 }
      );
    }

    if (!["ACTIVE", "APPROVAL_PENDING"].includes(subscription.status)) {
      return NextResponse.json(
        { ok: false, error: `PayPal subscription status is ${subscription.status}` },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("billing_accounts")
      .update({
        payment_provider: "paypal",
        plan: body.plan,
        status: subscription.status === "ACTIVE" ? "ACTIVE" : "INCOMPLETE",
        paypal_payer_id: subscription.subscriber?.payer_id ?? null,
        paypal_subscription_id: subscription.id,
        trial_started_at: subscription.start_time ?? new Date().toISOString(),
        trial_ends_at: subscription.billing_info?.next_billing_time ?? null,
        current_period_end: subscription.billing_info?.next_billing_time ?? null,
      })
      .eq("company_id", companyId);

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      status: subscription.status,
      subscriptionId: subscription.id,
      trialEndsAt: subscription.billing_info?.next_billing_time ?? null,
    });
  } catch (error) {
    console.error("RainShift PayPal confirmation error", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not confirm PayPal subscription",
      },
      { status: 500 }
    );
  }
}