"use client";

import { useEffect, useState } from "react";
import { BILLING_PLANS, type BillingPlan } from "@/lib/billing/constants";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

const planOrder: BillingPlan[] = ["starter", "growth", "pro"];

type StatusResponse = {
  ok: boolean;
  hasCompany: boolean;
  needsOnboarding: boolean;
  needsCheckout: boolean;
  company?: { id: string; name: string } | null;
  billing?: {
    plan: BillingPlan;
    status: string;
    trial_ends_at?: string | null;
  } | null;
  error?: string;
};

export default function BillingPage() {
  const [selected, setSelected] = useState<BillingPlan>("starter");
  const [companyName, setCompanyName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [canceled, setCanceled] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCanceled(params.get("canceled") === "1");

    async function prepare() {
      try {
        const statusResponse = await fetch("/api/billing/status", { cache: "no-store" });
        if (!statusResponse.ok) {
          if (statusResponse.status === 401) {
            window.location.href = "/login";
            return;
          }
          throw new Error("Could not load billing status");
        }

        let status = (await statusResponse.json()) as StatusResponse;

        if (status.needsOnboarding) {
          const onboardingResponse = await fetch("/api/onboarding", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });

          if (!onboardingResponse.ok) {
            throw new Error("Could not create your workspace");
          }

          const refreshed = await fetch("/api/billing/status", { cache: "no-store" });
          if (!refreshed.ok) throw new Error("Could not load your workspace");
          status = (await refreshed.json()) as StatusResponse;
        }

        setCompanyName(status.company?.name ?? "");

        if (
          status.billing?.plan &&
          status.billing.status !== "INCOMPLETE"
        ) {
          setSelected(status.billing.plan);
        }

        if (!status.needsCheckout) {
          window.location.href = "/";
          return;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load billing");
      } finally {
        setLoading(false);
      }
    }

    prepare();
  }, []);

  async function startCheckout() {
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selected }),
      });

      const data = (await response.json()) as {
        ok: boolean;
        url?: string;
        error?: string;
      };

      if (!response.ok || !data.ok || !data.url) {
        throw new Error(data.error ?? "Could not start checkout");
      }

      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout");
      setBusy(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f4f7fb" }}>
        <div style={{ color: "#5d6b7b" }}>Preparing your workspace...</div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "50px 24px",
        background: "#f4f7fb",
      }}
    >
      <section style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2, color: "#3167d8" }}>
              RAINSHIFT
            </div>
            <h1 style={{ margin: "8px 0 6px", fontSize: 36 }}>
              Choose your plan
            </h1>
            <p style={{ margin: 0, color: "#667487" }}>
              {companyName || "Your landscape company"} · 7 days free · card required
            </p>
          </div>

          <button
            onClick={signOut}
            style={{
              border: "1px solid #d6deea",
              background: "white",
              borderRadius: 10,
              padding: "9px 12px",
              fontWeight: 700,
              color: "#314257",
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </div>

        {canceled && (
          <div style={{ marginTop: 22, padding: 14, background: "#fff4df", border: "1px solid #f0d8a5", borderRadius: 12, color: "#7a5700" }}>
            Checkout was canceled. Your trial has not started.
          </div>
        )}

        {error && (
          <div style={{ marginTop: 22, padding: 14, background: "#fff1f1", border: "1px solid #f2caca", borderRadius: 12, color: "#8f2929" }}>
            {error}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))",
            gap: 18,
            marginTop: 28,
          }}
        >
          {planOrder.map((plan) => {
            const item = BILLING_PLANS[plan];
            const active = selected === plan;

            return (
              <button
                key={plan}
                onClick={() => setSelected(plan)}
                style={{
                  textAlign: "left",
                  padding: 24,
                  borderRadius: 18,
                  border: active ? "2px solid #3167d8" : "1px solid #dfe6ee",
                  background: "white",
                  boxShadow: active ? "0 12px 30px rgba(49,103,216,.12)" : "0 8px 24px rgba(20,40,70,.05)",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 800, color: "#3167d8", letterSpacing: 1 }}>
                  {item.name.toUpperCase()}
                </div>
                <div style={{ marginTop: 10, display: "flex", alignItems: "baseline", gap: 5 }}>
                  <span style={{ fontSize: 38, fontWeight: 850, color: "#13243a" }}>
                    ${item.monthlyPrice}
                  </span>
                  <span style={{ color: "#778494" }}>/month</span>
                </div>
                <div style={{ marginTop: 18, color: "#526170", fontSize: 14, lineHeight: 1.7 }}>
                  <div>{item.crews}</div>
                  <div>{item.properties}</div>
                </div>
                <div style={{ marginTop: 18, fontWeight: 800, color: active ? "#3167d8" : "#667487" }}>
                  {active ? "Selected ✓" : "Select plan"}
                </div>
              </button>
            );
          })}
        </div>

        <section
          style={{
            marginTop: 22,
            background: "#13243a",
            color: "white",
            borderRadius: 18,
            padding: 24,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 800 }}>
            Start your 7-day free trial
          </div>
          <div style={{ marginTop: 8, color: "#c5d3e4", lineHeight: 1.6 }}>
            You will enter your payment method securely on the next screen. You will not be charged today. After 7 days, your selected plan will renew at its listed monthly price unless you cancel before the trial ends.
          </div>
          <button
            onClick={startCheckout}
            disabled={busy}
            style={{
              width: "100%",
              marginTop: 18,
              border: 0,
              borderRadius: 12,
              padding: "14px 18px",
              background: busy ? "#7c91b2" : "#3167d8",
              color: "white",
              fontWeight: 800,
              fontSize: 16,
              cursor: busy ? "default" : "pointer",
            }}
          >
            {busy ? "Opening secure checkout..." : `Continue to secure checkout · ${BILLING_PLANS[selected].name}`}
          </button>
        </section>
      </section>
    </main>
  );
}
