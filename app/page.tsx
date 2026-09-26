"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProposedAppointment, RescheduleProposal, ScheduleStatus } from "@/lib/scheduling/types";

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

export default function Home() {
  const [proposal, setProposal] = useState<RescheduleProposal | null>(null);
  const [approved, setApproved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadProposal() {
      try {
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

        if (status === "MOVE" && !updated.newDay) {
          updated.newDay = "Thu";
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

  async function approve() {
    if (!proposal) return;

    setApproved(false);
    const response = await fetch("/api/reschedule/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposal }),
    });

    if (!response.ok) {
      setError("Approval failed");
      return;
    }

    setApproved(true);
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
            background: approved ? "#e8f8ee" : "#fff4df",
            color: approved ? "#1f7a43" : "#8b5b00",
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          {approved ? "RESCHEDULE APPROVED" : "ACTION REQUIRED"}
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
            <div style={{ fontSize: 12, letterSpacing: 1.5, fontWeight: 800, opacity: 0.7 }}>
              WEATHER EVENT DETECTED
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
                  {proposal.weather.location} • {proposal.weather.date}
                </h2>
                <div style={{ color: "#c5d3e4" }}>
                  {proposal.weather.rainProbability}% rain probability ·{" "}
                  {proposal.weather.expectedInches}" expected · 47 appointments in event window
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
                    {["Customer", "Crew", "Service", "RainShift", "Reason", "New Day"].map(
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
                          {appointment.duration} min · {appointment.distance} mi
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
                        {appointment.newDay ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

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
                Approval is currently a simulated write. Database and customer SMS come next.
              </div>
              <button
                onClick={approve}
                disabled={approved}
                style={{
                  border: 0,
                  borderRadius: 12,
                  padding: "13px 20px",
                  fontWeight: 800,
                  cursor: approved ? "default" : "pointer",
                  background: approved ? "#9bbba8" : "#3167d8",
                  color: "white",
                }}
              >
                {approved ? "Approved ✓" : "Approve Reschedule"}
              </button>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
