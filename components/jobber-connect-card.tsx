"use client";

import { useEffect, useState } from "react";
import type { RescheduleProposal } from "@/lib/scheduling/types";

type Props = {
  onProposal?: (proposal: RescheduleProposal) => void;
};

export default function JobberConnectCard({ onProposal }: Props) {
  const [connected, setConnected] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [checking, setChecking] = useState(true);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [smsTesting, setSmsTesting] = useState(false);
  const [notificationPhone, setNotificationPhone] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
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

  async function loadNotificationPhone() {
    const response = await fetch("/api/settings/notifications", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    setNotificationPhone(data.notificationPhone ?? "");
  }

  async function saveNotificationPhone() {
    setSavingPhone(true);
    setMessage("");
    try {
      const response = await fetch("/api/settings/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationPhone }),
      });
      const data = await response.json();
      setMessage(response.ok && data.ok ? data.message : data.error ?? "Could not save alert phone.");
    } finally {
      setSavingPhone(false);
    }
  }

  useEffect(() => {
    loadStatus();
    loadNotificationPhone();
    const params = new URLSearchParams(window.location.search);

    if (params.get("jobber") === "connected") {
      setMessage("Jobber connected.");
    }

    if (params.get("jobber") === "error") {
      const reason = params.get("reason");
      const detail = params.get("detail");
      const messages: Record<string, string> = {
        oauth_token_exchange: "Jobber authorization completed, but the OAuth token exchange failed.",
        jobber_api: "Jobber authorization succeeded, but the Jobber API rejected RainShift's request.",
        encryption_config: "Jobber authorization succeeded, but RainShift is missing its token-encryption configuration in production.",
        supabase_config: "Jobber authorization succeeded, but RainShift is missing its Supabase server configuration in production.",
        connection: "Jobber authorization returned to RainShift, but the connection could not be saved.",
      };

      const base = messages[reason ?? ""] ?? "Jobber connection failed.";
      setMessage(detail ? `${base} Details: ${detail}` : base);
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

  async function testSms() {
    setSmsTesting(true);
    setMessage("");
    try {
      const response = await fetch("/api/integrations/sms/test", {
        method: "POST",
      });
      const data = await response.json();
      setMessage(
        response.ok && data.ok
          ? "Test SMS sent successfully."
          : data.error ?? "SMS test failed."
      );
    } finally {
      setSmsTesting(false);
    }
  }

  async function syncJobber() {
    setSyncing(true);
    setMessage("");
    try {
      const response = await fetch("/api/integrations/jobber/sync", { method: "POST" });
      const data = await response.json();

      if (data.reconnect) {
        window.location.href = "/api/integrations/jobber/connect";
        return;
      }

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Jobber sync failed.");
      }

      const proposalResponse = await fetch("/api/reschedule", { method: "POST" });
      const proposalData = await proposalResponse.json();

      if (!proposalResponse.ok || !proposalData.ok) {
        throw new Error(proposalData.error ?? "Jobber synced, but RainShift could not build the proposal.");
      }

      onProposal?.(proposalData.proposal as RescheduleProposal);

      setMessage(
        `Synced ${data.appointments} visits from ${data.jobs} Jobber jobs and rebuilt the RainShift proposal.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Jobber sync failed.";
      if (message.includes("Reconnect Jobber")) {
        setConnected(false);
        setAccountName("");
        setMessage("Jobber authorization expired. Click Connect Jobber to authorize the account again.");
      } else {
        setMessage(message);
      }
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section style={{ marginTop: 22, background: "white", border: "1px solid #dfe6ee", borderRadius: 18, padding: 22 }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.5, color: "#3167d8" }}>
        SCHEDULING INTEGRATION
      </div>
      <h2 style={{ margin: "6px 0 6px", fontSize: 20 }}>Connect Jobber</h2>
      <p style={{ margin: 0, color: "#667487", lineHeight: 1.5 }}>
        Connect your Jobber account. RainShift will pull the schedule, check the weather, and prepare any needed changes.
      </p>

      <div
        style={{
          marginTop: 16,
          padding: 14,
          borderRadius: 12,
          background: "#f7f9fc",
          border: "1px solid #e1e7ef",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>
          Weather alert phone
        </div>
        <div style={{ fontSize: 12, color: "#6b7787", marginBottom: 9 }}>
          RainShift will text this number when a weather event needs review.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            value={notificationPhone}
            onChange={(event) => setNotificationPhone(event.target.value)}
            placeholder="+1 555 555 5555"
            inputMode="tel"
            style={{
              flex: "1 1 240px",
              border: "1px solid #ccd5df",
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 14,
            }}
          />
          <button
            onClick={saveNotificationPhone}
            disabled={savingPhone}
            style={{
              border: 0,
              padding: "10px 14px",
              borderRadius: 10,
              background: "#13243a",
              color: "white",
              fontWeight: 800,
              cursor: savingPhone ? "default" : "pointer",
            }}
          >
            {savingPhone ? "Saving..." : "Save alert phone"}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 14, fontWeight: 700 }}>
        {checking ? "Checking connection..." : connected ? `Connected · ${accountName}` : "Not connected"}
      </div>

      {message && (
        <div style={{ marginTop: 10, fontSize: 13, color: "#526170", lineHeight: 1.5 }}>
          {message}
        </div>
      )}

      <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
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
          <>
            <button
              onClick={testConnection}
              disabled={testing || syncing || smsTesting}
              style={{
                border: 0,
                padding: "11px 16px",
                borderRadius: 10,
                background: "#13243a",
                color: "white",
                fontWeight: 800,
                cursor: testing || syncing ? "default" : "pointer",
              }}
            >
              {testing ? "Testing..." : "Test connection"}
            </button>
            <button
              onClick={syncJobber}
              disabled={testing || syncing || smsTesting}
              style={{
                border: 0,
                padding: "11px 16px",
                borderRadius: 10,
                background: "#1f8f5f",
                color: "white",
                fontWeight: 800,
                cursor: testing || syncing ? "default" : "pointer",
              }}
            >
              {syncing ? "Analyzing Schedule..." : "Sync & Analyze Schedule"}
            </button>
            <button
              onClick={testSms}
              disabled={testing || syncing || smsTesting}
              style={{
                border: "1px solid #ccd5df",
                padding: "11px 16px",
                borderRadius: 10,
                background: "white",
                color: "#13243a",
                fontWeight: 800,
                cursor: testing || syncing || smsTesting ? "default" : "pointer",
              }}
            >
              {smsTesting ? "Sending Test SMS..." : "Test SMS"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
