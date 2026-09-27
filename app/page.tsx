"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProposedAppointment, RescheduleProposal, ScheduleStatus } from "@/lib/scheduling/types";
import { createClient } from "@/lib/supabase/client";
import JobberConnectCard from "@/components/jobber-connect-card";

const supabase = createClient();

type ApiResponse = {
  ok: boolean;
  proposal: RescheduleProposal;
  generatedAt: string;
};

function statusBackground(status: ScheduleStatus) {
  if (status === "MOVE") return "#ffe8e8";
  if (status === "KEEP") return "#e8f7ef";
  return "#fff3d9";
}

function statusColor(status: ScheduleStatus) {
  if (status === "MOVE") return "#a52a2a";
  if (status === "KEEP") return "#23754a";
  return "#8a5a00";
}

function formatEventDate(eventDate: string) {
  const dateOnly = eventDate.slice(0, 10);
  const date = new Date(dateOnly + "T12:00:00");
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatDateTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function nextBusinessDate(eventDate: string) {
  const date = new Date(eventDate.slice(0, 10) + "T12:00:00Z");
  for (let i = 0; i < 7; i += 1) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (date.getUTCDay() !== 0) return date.toISOString();
  }
  return date.toISOString();
}

export default function Home() {
  const [proposal, setProposal] = useState<RescheduleProposal | null>(null);
  const [approved, setApproved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [billingLabel, setBillingLabel] = useState("ACTIVE");
  const [approvalMessage, setApprovalMessage] = useState("");

  useEffect(() => {
    async function loadProposal() {
      try {
        const billingResponse = await fetch("/api/billing/status", {
          cache: "no-store",
        });

        if (!billingResponse.ok) {
          if (billingResponse.status === 401) {
            window.location.href = "/login";
            return;
          }
          throw new Error("Could not load account status");
        }

        const billingStatus = (await billingResponse.json()) as {
          needsOnboarding: boolean;
          needsCheckout: boolean;
          billing?: {
            status?: string;
            trial_ends_at?: string | null;
          } | null;
        };

        const isTrial =
          billingStatus.billing?.status === "TRIALING" ||
          Boolean(billingStatus.billing?.trial_ends_at);
        setBillingLabel(isTrial ? "TRIAL ACTIVE" : "ACTIVE");

        if (billingStatus.needsOnboarding || billingStatus.needsCheckout) {
          window.location.href = "/billing";
          return;
        }

        // When Jobber is connected, refresh real jobs before building the proposal.
        // This makes the dashboard self-healing instead of depending on a manual sync.
        const jobberStatusResponse = await fetch("/api/integrations/jobber/status", {
          cache: "no-store",
        });

        if (jobberStatusResponse.ok) {
          const jobberStatus = (await jobberStatusResponse.json()) as {
            connected?: boolean;
          };

          if (jobberStatus.connected) {
            const jobberSyncResponse = await fetch("/api/integrations/jobber/sync", {
              method: "POST",
            });

            if (!jobberSyncResponse.ok) {
              const syncData = await jobberSyncResponse.json().catch(() => ({}));
              console.warn("Live Jobber sync failed:", syncData.error);
            }
          }
        }

        const response = await fetch("/api/reschedule", { method: "POST" });
        if (!response.ok) throw new Error("Could not generate proposal");

        const data = (await response.json()) as ApiResponse;
        setProposal(data.proposal);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }

    loadProposal();
  }, []);

  const counts = useMemo(
    () => proposal?.counts ?? { move: 0, keep: 0, review: 0 },
    [proposal]
  );

  function cycleStatus(id: string) {
    setApproved(false);
    setProposal((current) => {
      if (!current) return current;

      const next: Record<ScheduleStatus, ScheduleStatus> = {
        KEEP: "MOVE",
        MOVE: "REVIEW",
        REVIEW: "KEEP",
      };

      const appointments = current.appointments.map((appointment) => {
        if (appointment.id !== id) return appointment;

        const status = next[appointment.status];
        const updated: ProposedAppointment = { ...appointment, status };

        if (status === "MOVE") {
          const replacement = nextBusinessDate(current.weather.eventDate);
          updated.newDate = replacement;
          updated.newDay = new Intl.DateTimeFormat("en-US", {
            weekday: "short",
            timeZone: "UTC",
          }).format(new Date(replacement));
          updated.reason =
            updated.reason ||
            "Manual operator override: move to the next business day";
        }

        if (status !== "MOVE") {
          updated.newDate = undefined;
          updated.newDay = undefined;
        }

        return updated;
      });

      return {
        ...current,
        appointments,
        counts: {
          move: appointments.filter((item) => item.status === "MOVE").length,
          keep: appointments.filter((item) => item.status === "KEEP").length,
          review: appointments.filter((item) => item.status === "REVIEW").length,
        },
      };
    });
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function approve() {
    if (!proposal || proposal.counts.review > 0) return;

    setApproved(false);
    setApprovalMessage("");
    const response = await fetch("/api/reschedule/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposal }),
    });

    const data = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      message?: string;
      error?: string;
    };

    if (!response.ok || !data.ok) {
      setError(data.error || "Approval failed");
      return;
    }

    setApproved(true);
    setApprovalMessage(data.message || "Reschedule approved.");
  }

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: 32 }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 28,
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2, color: "#3167d8" }}>
            RAINSHIFT
          </div>
          <h1 style={{ fontSize: 34, margin: "6px 0 4px" }}>Rain-Day Rescheduler</h1>
          <p style={{ margin: 0, color: "#5d6b7b" }}>
            Stop rebuilding rainy-day routes by hand.
          </p>
        </div>

        <div
          style={{
            padding: "10px 14px",
            borderRadius: 999,
            background: approved ? "#e8f8ee" : "#e8f1ff",
            color: approved ? "#1f7a43" : "#2855a5",
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          <button
            onClick={signOut}
            style={{
              marginLeft: 10,
              border: "1px solid rgba(255,255,255,.35)",
              borderRadius: 10,
              padding: "7px 10px",
              background: "transparent",
              color: "#13243a",
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
          {approved ? "RESCHEDULE APPROVED" : billingLabel}
        </div>
      </header>

      {loading && (
        <section
          style={{
            background: "white",
            border: "1px solid #dfe6ee",
            borderRadius: 18,
            padding: 28,
            marginBottom: 22,
          }}
        >
          Generating RainShift proposal...
        </section>
      )}

      {error && (
        <section
          style={{
            background: "#fff1f1",
            border: "1px solid #f2caca",
            borderRadius: 18,
            padding: 18,
            marginBottom: 22,
            color: "#8f2929",
          }}
        >
          {error}
        </section>
      )}

      <JobberConnectCard
        onProposal={(nextProposal) => {
          setApproved(false);
          setProposal(nextProposal);
          setError("");
        }}
      />

      {proposal && (
        <>
          <section
            style={{
              background: "#13243a",
              color: "white",
              borderRadius: 20,
              padding: 26,
              marginBottom: 22,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, letterSpacing: 1.5, fontWeight: 800, opacity: 0.7 }}>
                WEATHER EVENT DETECTED
              </div>
              <div style={{ fontSize: 11, letterSpacing: 1.2, fontWeight: 900, padding: "6px 9px", borderRadius: 999, background: "#1f8f5f" }}>
                LIVE JOBBER SCHEDULE
              </div>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 20,
                flexWrap: "wrap",
              }}
            >
              <div>
                <h2 style={{ margin: "8px 0", fontSize: 28 }}>
                  {proposal.weather.location} • {formatEventDate(proposal.weather.eventDate)}
                </h2>
                <div style={{ color: "#c5d3e4" }}>
                  {proposal.weather.rainProbability}% rain probability ·{" "}
                  {proposal.weather.expectedInches}" expected · {proposal.appointments.length} Jobber appointment{proposal.appointments.length === 1 ? "" : "s"}
                </div>
                <div style={{ marginTop: 10, fontWeight: 800 }}>
                  {counts.move > 0
                    ? `${counts.move} appointment${counts.move === 1 ? "" : "s"} scheduled to move`
                    : counts.review > 0
                      ? `${counts.review} appointment${counts.review === 1 ? "" : "s"} need review`
                      : "No schedule changes recommended"}
                </div>
              </div>

              <div style={{ minWidth: 220 }}>
                <div style={{ fontSize: 13, opacity: 0.7 }}>RainShift proposal</div>
                <div style={{ display: "flex", gap: 18, marginTop: 10 }}>
                  <div>
                    <strong style={{ fontSize: 24 }}>{counts.move}</strong>
                    <div style={{ fontSize: 12 }}>MOVE</div>
                  </div>
                  <div>
                    <strong style={{ fontSize: 24 }}>{counts.keep}</strong>
                    <div style={{ fontSize: 12 }}>KEEP</div>
                  </div>
                  <div>
                    <strong style={{ fontSize: 24 }}>{counts.review}</strong>
                    <div style={{ fontSize: 12 }}>REVIEW</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section
            style={{
              background: "white",
              border: "1px solid #dfe6ee",
              borderRadius: 18,
              overflow: "hidden",
            }}
          >
            <div style={{ padding: 22, borderBottom: "1px solid #e7edf4" }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>Proposed schedule</h2>
              <p style={{ margin: "7px 0 0", color: "#6a7787", fontSize: 14 }}>
                The deterministic scheduling engine made the first pass. Operators can review
                exceptions before approval.
              </p>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", textAlign: "left" }}>
                    {["Customer", "Crew", "Service", "Decision", "Why", "Move to"].map(
                      (label) => (
                        <th
                          key={label}
                          style={{ padding: "13px 16px", fontSize: 12, color: "#667487" }}
                        >
                          {label}
                        </th>
                      )
                    )}
                  </tr>
                </thead>

                <tbody>
                  {proposal.appointments.map((appointment) => (
                    <tr key={appointment.id} style={{ borderTop: "1px solid #edf1f5" }}>
                      <td style={{ padding: 16 }}>
                        <div style={{ fontWeight: 700 }}>{appointment.customer}</div>
                        <div style={{ fontSize: 12, color: "#788595" }}>
                          {appointment.address}
                        </div>
                      </td>
                      <td style={{ padding: 16 }}>{appointment.crew}</td>
                      <td style={{ padding: 16 }}>
                        <div>{appointment.service}</div>
                        <div style={{ fontSize: 12, color: "#788595" }}>
                          {appointment.duration} min ·{" "}
                          {appointment.distance > 0 ? `${appointment.distance} mi` : "Route distance pending"}
                        </div>
                      </td>
                      <td style={{ padding: 16 }}>
                        <button
                          onClick={() => cycleStatus(appointment.id)}
                          style={{
                            border: 0,
                            borderRadius: 999,
                            padding: "7px 11px",
                            fontWeight: 800,
                            fontSize: 12,
                            cursor: "pointer",
                            background: statusBackground(appointment.status),
                            color: statusColor(appointment.status),
                          }}
                        >
                          {appointment.status}
                        </button>
                      </td>
                      <td style={{ padding: 16, color: "#526170", maxWidth: 280 }}>
                        {appointment.reason}
                      </td>
                      <td style={{ padding: 16, fontWeight: 700 }}>
                        {appointment.status === "MOVE" ? formatDateTime(appointment.newDate) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {approvalMessage && (
              <div
                style={{
                  margin: "0 22px",
                  padding: "14px 16px",
                  borderRadius: 12,
                  background: "#eef8f2",
                  color: "#24633f",
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                {approvalMessage}
              </div>
            )}

            {approvalMessage && (
              <div
                style={{
                  margin: "0 22px",
                  padding: "14px 16px",
                  borderRadius: 12,
                  background: "#eef8f2",
                  color: "#24633f",
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                {approvalMessage}
              </div>
            )}

            <div
              style={{
                padding: 22,
                display: "flex",
                justifyContent: "space-between",
                gap: 16,
                alignItems: "center",
                borderTop: "1px solid #e7edf4",
                flexWrap: "wrap",
              }}
            >
              <div style={{ color: "#5f6c7b", fontSize: 14 }}>
                {proposal.counts.review > 0
                  ? "Click a decision to cycle KEEP → MOVE → REVIEW. MOVE shows the exact replacement date before approval."
                  : proposal.counts.move > 0
                    ? "Approve to write MOVE decisions back to Jobber. KEEP decisions stay where they are."
                    : "No changes are recommended for this weather window."}
              </div>
              <button
                onClick={approve}
                disabled={approved || counts.review > 0 || counts.move === 0}
                style={{
                  border: 0,
                  borderRadius: 12,
                  padding: "13px 20px",
                  fontWeight: 800,
                  cursor: approved || counts.review > 0 ? "default" : "pointer",
                  background: approved ? "#9bbba8" : counts.review > 0 ? "#aeb8c5" : "#3167d8",
                  color: "white",
                }}
              >
                {approved
                  ? "Approved ✓"
                  : counts.review > 0
                    ? "Resolve Reviews First"
                    : counts.move > 0
                      ? `Approve ${counts.move} Jobber change${counts.move === 1 ? "" : "s"}`
                      : "No Changes to Approve"}
              </button>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
