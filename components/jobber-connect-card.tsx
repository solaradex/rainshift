"use client";

import { useEffect, useState } from "react";

export default function JobberConnectCard() {
  const [connected, setConnected] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [checking, setChecking] = useState(true);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("");

  async function loadStatus() {
    const response = await fetch("/api/integrations/jobber/status", { cache: "no-store" });
    if (!response.ok) {
      setChecking(false);
      return;
    }

    const data = await response.json();
    setConnected(Boolean(data.connected));
    setAccountName(data.connection?.accountName ?? "");
    setChecking(false);
  }

  useEffect(() => {
    loadStatus();
    const params = new URLSearchParams(window.location.search);

    if (params.get("jobber") === "connected") {
      setMessage("Jobber connected.");
    }

    if (params.get("jobber") === "error") {
      const reason = params.get("reason");
      const messages: Record<string, string> = {
        oauth_token_exchange:
          "Jobber authorization completed, but the OAuth token exchange failed. Check the Jobber callback URL and Client Secret.",
        jobber_api:
          "Jobber authorization succeeded, but RainShift could not query the Jobber API. Check the app permissions/scopes.",
        encryption_config:
          "Jobber authorization succeeded, but RainShift is missing its token-encryption configuration in production.",
        supabase_config:
          "Jobber authorization succeeded, but RainShift is missing its Supabase server configuration in production.",
        billing:
          "Jobber connected, but RainShift reported a billing configuration problem.",
        connection:
          "Jobber authorization returned to RainShift, but the connection could not be saved.",
      };

      setMessage(messages[reason ?? ""] ?? "Jobber connection failed.");
    }
  }, []);

  async function testConnection() {
    setTesting(true);
    setMessage("");
    try {
      const response = await fetch("/api/integrations/jobber/test", { method: "POST" });
      const data = await response.json();
      setMessage(
        response.ok && data.ok
          ? `Jobber connection verified: ${data.account?.name ?? accountName}`
          : data.error ?? "Jobber test failed."
      );
    } finally {
      setTesting(false);
    }
  }

  return (
    <section
      style={{
        marginTop: 22,
        background: "white",
        border: "1px solid #dfe6ee",
        borderRadius: 18,
        padding: 22,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.5, color: "#3167d8" }}>
        SCHEDULING INTEGRATION
      </div>
      <h2 style={{ margin: "6px 0 6px", fontSize: 20 }}>Connect Jobber</h2>
      <p style={{ margin: 0, color: "#667487", lineHeight: 1.5 }}>
        Connect your Jobber account so RainShift can eventually read and update real visits.
      </p>

      <div style={{ marginTop: 14, fontWeight: 700 }}>
        {checking ? "Checking connection..." : connected ? `Connected · ${accountName}` : "Not connected"}
      </div>

      {message && (
        <div style={{ marginTop: 10, fontSize: 13, color: "#526170" }}>{message}</div>
      )}

      <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
        {!connected && (
          <a
            href="/api/integrations/jobber/connect"
            style={{
              display: "inline-block",
              padding: "11px 16px",
              borderRadius: 10,
              background: "#3167d8",
              color: "white",
              fontWeight: 800,
              textDecoration: "none",
            }}
          >
            Connect Jobber
          </a>
        )}
        {connected && (
          <button
            onClick={testConnection}
            disabled={testing}
            style={{
              border: 0,
              padding: "11px 16px",
              borderRadius: 10,
              background: "#13243a",
              color: "white",
              fontWeight: 800,
              cursor: testing ? "default" : "pointer",
            }}
          >
            {testing ? "Testing..." : "Test connection"}
          </button>
        )}
      </div>
    </section>
  );
}
