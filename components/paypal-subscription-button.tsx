"use client";

import { useEffect, useRef, useState } from "react";

type Plan = "starter" | "growth" | "pro";

type PayPalButtonOptions = {
  style?: {
    layout?: "vertical" | "horizontal";
    color?: string;
    shape?: string;
    label?: string;
  };
  createSubscription: (_data: unknown, actions: {
    subscription: {
      create: (options: { plan_id: string }) => Promise<string>;
    };
  }) => Promise<string>;
  onApprove: (data: { subscriptionID: string }) => void;
  onError?: (error: unknown) => void;
};

type PayPalNamespace = {
  Buttons: (options: PayPalButtonOptions) => {
    render: (selector: string) => Promise<void>;
    close?: () => void;
  };
};

declare global {
  interface Window {
    paypal?: PayPalNamespace;
  }
}

export default function PayPalSubscriptionButton({
  plan,
  onApproved,
}: {
  plan: Plan;
  onApproved: (subscriptionId: string) => Promise<void>;
}) {
  const containerId = `paypal-button-${plan}`;
  const buttonsRef = useRef<{ close?: () => void } | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const configResponse = await fetch("/api/paypal/config", { cache: "no-store" });
        if (!configResponse.ok) throw new Error("Could not load PayPal configuration");

        const config = (await configResponse.json()) as {
          clientId: string;
          plans: Record<Plan, string | null>;
        };

        const planId = config.plans[plan];
        if (!planId) throw new Error(`PayPal ${plan} plan is not configured`);

        if (!window.paypal) {
          await new Promise<void>((resolve, reject) => {
            const existing = document.querySelector('script[data-rainshift-paypal="1"]');

            if (existing) {
              existing.addEventListener("load", () => resolve(), { once: true });
              existing.addEventListener("error", () => reject(new Error("PayPal SDK failed to load")), { once: true });
              return;
            }

            const script = document.createElement("script");
            script.src =
              `https://www.sandbox.paypal.com/sdk/js?client-id=${encodeURIComponent(config.clientId)}&components=buttons&vault=true&intent=subscription`;
            script.async = true;
            script.dataset.rainshiftPaypal = "1";
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("PayPal SDK failed to load"));
            document.body.appendChild(script);
          });
        }

        if (cancelled || !window.paypal) return;

        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = "";

        const buttons = window.paypal.Buttons({
          style: {
            layout: "vertical",
            color: "gold",
            shape: "rect",
            label: "subscribe",
          },
          createSubscription(_data, actions) {
            return actions.subscription.create({ plan_id: planId });
          },
          async onApprove(data) {
            await onApproved(data.subscriptionID);
          },
          onError(error) {
            console.error("PayPal button error", error);
            setError("PayPal checkout could not be completed.");
          },
        });

        buttonsRef.current = buttons;
        await buttons.render(`#${containerId}`);
        if (!cancelled) setReady(true);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load PayPal checkout");
        }
      }
    }

    load();

    return () => {
      cancelled = true;
      buttonsRef.current?.close?.();
      buttonsRef.current = null;
    };
  }, [containerId, onApproved, plan]);

  return (
    <div>
      {!ready && !error && (
        <div style={{ fontSize: 13, color: "#667487", padding: "10px 0" }}>
          Loading PayPal checkout...
        </div>
      )}
      <div id={containerId} />
      {error && (
        <div style={{ color: "#8f2929", fontSize: 13, marginTop: 10 }}>
          {error}
        </div>
      )}
    </div>
  );
}