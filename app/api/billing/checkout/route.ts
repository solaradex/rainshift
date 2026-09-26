import { NextResponse } from "next/server";
import { getCurrentCompany } from "@/lib/auth/company";
import { BILLING_PLANS, FREE_TRIAL_DAYS, type BillingPlan } from "@/lib/billing/constants";
import { getStripe } from "@/lib/stripe";

const PRICE_ENV: Record<BillingPlan, string> = {
  starter: "STRIPE_PRICE_STARTER",
  growth: "STRIPE_PRICE_GROWTH",
  pro: "STRIPE_PRICE_PRO",
};

export async function POST(request: Request) {
  try {
    const { supabase, userId, companyId } = await getCurrentCompany();

    if (!userId || !companyId) {
      return NextResponse.json(
        { ok: false, error: "Complete account setup first" },
        { status: 401 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      plan?: BillingPlan;
    };

    const plan = body.plan;
    if (!plan || !(plan in BILLING_PLANS)) {
      return NextResponse.json(
        { ok: false, error: "Invalid billing plan" },
        { status: 400 }
      );
    }

    const priceId = process.env[PRICE_ENV[plan]];
    if (!priceId) {
      return NextResponse.json(
        {
          ok: false,
          error: "Stripe price IDs are not configured yet",
        },
        { status: 503 }
      );
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      request.headers.get("origin") ||
      "http://localhost:3000";

    const [
      { data: company, error: companyError },
      { data: authUser, error: userError },
      { data: billing, error: existingBillingError },
    ] = await Promise.all([
      supabase.from("companies").select("id,name").eq("id", companyId).maybeSingle(),
      supabase.auth.getUser(),
      supabase
        .from("billing_accounts")
        .select("stripe_customer_id")
        .eq("company_id", companyId)
        .maybeSingle(),
    ]);

    if (companyError) throw companyError;
    if (userError) throw userError;
    if (existingBillingError) throw existingBillingError;
    if (!company) throw new Error("Company not found");

    const stripe = getStripe();

    const customer = billing?.stripe_customer_id
      ? await stripe.customers.retrieve(billing.stripe_customer_id)
      : await stripe.customers.create({
          email: authUser.user.email ?? undefined,
          name: company.name,
          metadata: {
            rainshift_company_id: companyId,
            rainshift_user_id: userId,
          },
        });

    if (customer.deleted) {
      throw new Error("Saved Stripe customer is no longer available");
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customer.id,
      line_items: [{ price: priceId, quantity: 1 }],
      payment_method_collection: "always",
      subscription_data: {
        trial_period_days: FREE_TRIAL_DAYS,
        trial_settings: {
          end_behavior: {
            missing_payment_method: "cancel",
          },
        },
        metadata: {
          rainshift_company_id: companyId,
          rainshift_user_id: userId,
          rainshift_plan: plan,
        },
      },
      metadata: {
        rainshift_company_id: companyId,
        rainshift_user_id: userId,
        rainshift_plan: plan,
      },
      success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/billing?canceled=1`,
    });

    const { error: updateBillingError } = await supabase
      .from("billing_accounts")
      .update({
        plan,
        stripe_customer_id: customer.id,
      })
      .eq("company_id", companyId);

    if (updateBillingError) throw updateBillingError;

    return NextResponse.json({
      ok: true,
      url: session.url,
    });
  } catch (error) {
    console.error("RainShift checkout error", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not start checkout",
      },
      { status: 500 }
    );
  }
}
