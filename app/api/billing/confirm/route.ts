import { NextResponse } from "next/server";
import { getCurrentCompany } from "@/lib/auth/company";
import { getStripe } from "@/lib/stripe";

function billingStatus(status: string) {
  switch (status) {
    case "trialing":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "past_due":
      return "PAST_DUE";
    case "canceled":
      return "CANCELED";
    case "unpaid":
      return "UNPAID";
    default:
      return "INCOMPLETE";
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, userId, companyId } = await getCurrentCompany();

    if (!userId || !companyId) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      sessionId?: string;
    };

    if (!body.sessionId) {
      return NextResponse.json(
        { ok: false, error: "Missing checkout session" },
        { status: 400 }
      );
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(body.sessionId);

    if (
      session.metadata?.rainshift_company_id !== companyId ||
      session.metadata?.rainshift_user_id !== userId
    ) {
      return NextResponse.json(
        { ok: false, error: "Checkout session does not belong to this account" },
        { status: 403 }
      );
    }

    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id;

    if (!subscriptionId) {
      throw new Error("Stripe subscription was not created yet");
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const currentPeriodEnd = subscription.items.data[0]?.current_period_end ?? null;

    const { error } = await supabase
      .from("billing_accounts")
      .update({
        plan: session.metadata?.rainshift_plan ?? "starter",
        status: billingStatus(subscription.status),
        stripe_customer_id:
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id,
        stripe_subscription_id: subscription.id,
        trial_started_at: subscription.trial_start
          ? new Date(subscription.trial_start * 1000).toISOString()
          : null,
        trial_ends_at: subscription.trial_end
          ? new Date(subscription.trial_end * 1000).toISOString()
          : null,
        current_period_end: currentPeriodEnd
          ? new Date(currentPeriodEnd * 1000).toISOString()
          : null,
        cancel_at_period_end: subscription.cancel_at_period_end,
      })
      .eq("company_id", companyId);

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      status: billingStatus(subscription.status),
      trialEndsAt: subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
    });
  } catch (error) {
    console.error("RainShift billing confirmation error", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not confirm billing",
      },
      { status: 500 }
    );
  }
}
