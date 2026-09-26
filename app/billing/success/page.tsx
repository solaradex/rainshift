"use client";

import { useEffect, useState } from "react";

export default function BillingSuccessPage() {
  const [message, setMessage] = useState("Confirming your subscription...");

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get("session_id");

    async function confirm() {
      if (!sessionId) {
        setMessage("Subscription completed. Returning to RainShift...");
        window.setTimeout(() => {
          window.location.href = "/";
        }, 1200);
        return;
      }

      try {
        const response = await fetch("/api/billing/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });

        if (!response.ok) {
          throw new Error("Confirmation delayed");
        }

        setMessage("Your 7-day trial is active. Loading RainShift...");
      } catch {
        setMessage("Your payment details were received. Loading RainShift...");
      } finally {
        window.setTimeout(() => {
          window.location.href = "/";
        }, 1400);
      }
    }

    confirm();
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "#f4f7fb",
      }}
    >
      <section
        style={{
          maxWidth: 520,
          width: "100%",
          background: "white",
          border: "1px solid #dfe6ee",
          borderRadius: 20,
          padding: 32,
          textAlign: "center",
          boxShadow: "0 18px 50px rgba(20,40,70,.08)",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2, color: "#3167d8" }}>
          RAINSHIFT
        </div>
        <h1 style={{ margin: "12px 0 8px", fontSize: 30 }}>
          Welcome aboard
        </h1>
        <p style={{ margin: 0, color: "#667487", lineHeight: 1.6 }}>
          {message}
        </p>
      </section>
    </main>
  );
}
