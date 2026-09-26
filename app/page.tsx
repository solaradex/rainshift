"use client";

import { useMemo, useState } from "react";

type Status = "KEEP" | "MOVE" | "REVIEW";

type Appointment = {
  id: string;
  customer: string;
  address: string;
  crew: string;
  service: string;
  duration: number;
  distance: number;
  preferredDay: string;
  status: Status;
  reason: string;
  newDay?: string;
};

const initialAppointments: Appointment[] = [
  {
    id: "A-101",
    customer: "Mason Family",
    address: "128 River Oak Dr",
    crew: "Crew A",
    service: "Weekly Mow",
    duration: 45,
    distance: 2.1,
    preferredDay: "Wed",
    status: "MOVE",
    reason: "Heavy rain overlaps service window",
    newDay: "Thu",
  },
  {
    id: "A-102",
    customer: "Harper Residence",
    address: "214 Pine Ridge Ln",
    crew: "Crew A",
    service: "Mow + Edge",
    duration: 60,
    distance: 3.4,
    preferredDay: "Thu",
    status: "KEEP",
    reason: "Morning window stays below rain threshold",
  },
  {
    id: "A-103",
    customer: "Oak & Co.",
    address: "44 Oak St",
    crew: "Crew B",
    service: "Landscape Bed",
    duration: 90,
    distance: 5.2,
    preferredDay: "Wed",
    status: "REVIEW",
    reason: "Rain timing is uncertain",
  },
  {
    id: "A-104",
    customer: "Bennett Home",
    address: "901 Magnolia Ave",
    crew: "Crew B",
    service: "Weekly Mow",
    duration: 45,
    distance: 1.8,
    preferredDay: "Wed",
    status: "MOVE",
    reason: "Expected rainfall exceeds threshold",
    newDay: "Fri",
  },
  {
    id: "A-105",
    customer: "Northside Rentals",
    address: "63 Westside Blvd",
    crew: "Crew C",
    service: "Cleanup",
    duration: 120,
    distance: 6.1,
    preferredDay: "Wed",
    status: "MOVE",
    reason: "Surface conditions likely unsafe",
    newDay: "Thu",
  },
];

export default function Home() {
  const [appointments, setAppointments] =
    useState<Appointment[]>(initialAppointments);
  const [approved, setApproved] = useState(false);

  const counts = useMemo(
    () => ({
      move: appointments.filter((a) => a.status === "MOVE").length,
      keep: appointments.filter((a) => a.status === "KEEP").length,
      review: appointments.filter((a) => a.status === "REVIEW").length,
    }),
    [appointments]
  );

  function cycleStatus(id: string) {
    setApproved(false);
    setAppointments((current) =>
      current.map((a) => {
        if (a.id !== id) return a;
        const next: Record<Status, Status> = {
          KEEP: "MOVE",
          MOVE: "REVIEW",
          REVIEW: "KEEP",
        };
        return { ...a, status: next[a.status] };
      })
    );
  }

  function approve() {
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
          <h1 style={{ fontSize: 34, margin: "6px 0 4px" }}>
            Rain-Day Rescheduler
          </h1>
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
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: "8px 0", fontSize: 28 }}>Jacksonville • Monday, Sept 28</h2>
            <div style={{ color: "#c5d3e4" }}>
              82% rain probability · 1.4" expected · 47 appointments in event window
            </div>
          </div>
          <div style={{ minWidth: 220 }}>
            <div style={{ fontSize: 13, opacity: 0.7 }}>RainShift proposal</div>
            <div style={{ display: "flex", gap: 18, marginTop: 10 }}>
              <div><strong style={{ fontSize: 24 }}>{counts.move}</strong><div style={{ fontSize: 12 }}>MOVE</div></div>
              <div><strong style={{ fontSize: 24 }}>{counts.keep}</strong><div style={{ fontSize: 12 }}>KEEP</div></div>
              <div><strong style={{ fontSize: 24 }}>{counts.review}</strong><div style={{ fontSize: 12 }}>REVIEW</div></div>
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
            Click a status to review the engine&apos;s decision before approval.
          </p>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr style={{ background: "#f8fafc", textAlign: "left" }}>
                {["Customer", "Crew", "Service", "RainShift", "Reason", "New Day"].map((label) => (
                  <th key={label} style={{ padding: "13px 16px", fontSize: 12, color: "#667487" }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {appointments.map((a) => (
                <tr key={a.id} style={{ borderTop: "1px solid #edf1f5" }}>
                  <td style={{ padding: 16 }}>
                    <div style={{ fontWeight: 700 }}>{a.customer}</div>
                    <div style={{ fontSize: 12, color: "#788595" }}>{a.address}</div>
                  </td>
                  <td style={{ padding: 16 }}>{a.crew}</td>
                  <td style={{ padding: 16 }}>
                    <div>{a.service}</div>
                    <div style={{ fontSize: 12, color: "#788595" }}>{a.duration} min · {a.distance} mi</div>
                  </td>
                  <td style={{ padding: 16 }}>
                    <button
                      onClick={() => cycleStatus(a.id)}
                      style={{
                        border: "0",
                        borderRadius: 999,
                        padding: "7px 11px",
                        fontWeight: 800,
                        fontSize: 12,
                        cursor: "pointer",
                        background:
                          a.status === "MOVE"
                            ? "#ffe8e8"
                            : a.status === "KEEP"
                              ? "#e8f7ef"
                              : "#fff3d9",
                        color:
                          a.status === "MOVE"
                            ? "#a52a2a"
                            : a.status === "KEEP"
                              ? "#23754a"
                              : "#8a5a00",
                      }}
                    >
                      {a.status}
                    </button>
                  </td>
                  <td style={{ padding: 16, color: "#526170", maxWidth: 280 }}>{a.reason}</td>
                  <td style={{ padding: 16, fontWeight: 700 }}>{a.newDay ?? "—"}</td>
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
            Approval will eventually update appointments and trigger customer SMS.
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
    </main>
  );
}
