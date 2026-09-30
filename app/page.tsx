"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProposedAppointment, RescheduleProposal, RouteBoardDay, ScheduleStatus } from "@/lib/scheduling/types";
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

function routeSummary(appointment: ProposedAppointment) {
  const details: string[] = [];

  if (typeof appointment.routeMilesAdded === "number") {
    details.push(`Estimated +${appointment.routeMilesAdded.toFixed(1)} mi route impact`);
  }

  if (typeof appointment.driveMinutesAdded === "number") {
    details.push(`+${appointment.driveMinutesAdded} min drive`);
  }

  if (typeof appointment.crewMinutesPlanned === "number") {
    details.push(`${appointment.crewMinutesPlanned}/420 min planning budget`);
  }

  if (typeof appointment.capacityMinutesRemaining === "number") {
    details.push(`${appointment.capacityMinutesRemaining} min buffer`);
  }

  if (typeof appointment.routePosition === "number") {
    details.push(`stop #${appointment.routePosition}`);
  }

  return details.join(" · ");
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function routeBoardUtilization(day: RouteBoardDay) {
  return Math.min(100, Math.round((day.totalPlannedMinutes / 420) * 100));
}

function boardMiles(a: RouteBoardDay["stops"][number], b: RouteBoardDay["stops"][number]) {
  if (
    typeof a.latitude !== "number" ||
    typeof a.longitude !== "number" ||
    typeof b.latitude !== "number" ||
    typeof b.longitude !== "number"
  ) {
    return 0;
  }

  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const dLat = lat2 - lat1;
  const dLon = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(h));
}

function rebuildRouteDay(day: RouteBoardDay, stops: RouteBoardDay["stops"]): RouteBoardDay {
  const ordered = [...stops].sort(
    (a, b) =>
      new Date(a.start).getTime() - new Date(b.start).getTime() ||
      a.id.localeCompare(b.id)
  );

  const serviceMinutes = ordered.reduce((total, stop) => total + stop.duration, 0);
  let driveMinutes = 0;

  for (let index = 1; index < ordered.length; index += 1) {
    driveMinutes += (boardMiles(ordered[index - 1], ordered[index]) / 25) * 60;
  }

  const totalPlannedMinutes = Math.round(serviceMinutes + driveMinutes);

  return {
    ...day,
    stops: ordered,
    serviceMinutes,
    driveMinutes: driveMinutes > 0 ? Math.round(driveMinutes) : undefined,
    totalPlannedMinutes,
    capacityMinutesRemaining: Math.max(0, Math.round(420 - totalPlannedMinutes)),
  };
}

function insertionMilesFor(
  stop: RouteBoardDay["stops"][number],
  route: RouteBoardDay["stops"]
) {
  const neighbors = [...route]
    .filter((candidate) => candidate.id !== stop.id)
    .sort(
      (a, b) =>
        new Date(a.start).getTime() - new Date(b.start).getTime() ||
        a.id.localeCompare(b.id)
    );

  if (!neighbors.length) return 0;

  const index = neighbors.findIndex(
    (candidate) => new Date(candidate.start).getTime() > new Date(stop.start).getTime()
  );
  const insertIndex = index < 0 ? neighbors.length : index;
  const before = neighbors[insertIndex - 1];
  const after = neighbors[insertIndex];

  if (!before && after) return boardMiles(stop, after);
  if (before && !after) return boardMiles(before, stop);
  if (before && after) {
    return boardMiles(before, stop) + boardMiles(stop, after) - boardMiles(before, after);
  }

  return 0;
}

function moveToDateKeepTime(value: string, targetDate: string) {
  const source = new Date(value);
  const target = new Date(targetDate + "T00:00:00.000Z");

  if (Number.isNaN(source.getTime()) || Number.isNaN(target.getTime())) return value;

  target.setUTCHours(
    source.getUTCHours(),
    source.getUTCMinutes(),
    source.getUTCSeconds(),
    source.getUTCMilliseconds()
  );

  return target.toISOString();
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
  const [draggedAppointmentId, setDraggedAppointmentId] = useState<string | null>(null);
  const [dispatchMessage, setDispatchMessage] = useState("");

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

  const routeOverCapacity = useMemo(
    () => proposal?.routeBoard.some((day) => day.totalPlannedMinutes > 420) ?? false,
    [proposal]
  );

  const crewReassignmentsPending = useMemo(
    () =>
      proposal?.appointments.some(
        (item) => item.status === "MOVE" && Boolean(item.crewChangedFrom)
      ) ?? false,
    [proposal]
  );

  const dispatchLanes = useMemo(() => {
    if (!proposal) return [];

    const dates = [...new Set(proposal.routeBoard.map((day) => day.date))].sort();
    const crewEntries = [
      ...new Map(
        proposal.appointments
          .filter((item) => item.crew)
          .map((item) => [
            item.crewId ?? item.crew,
            { crew: item.crew, crewId: item.crewId },
          ])
      ).values(),
    ].sort((a, b) => a.crew.localeCompare(b.crew));

    const byKey = new Map(
      proposal.routeBoard.map((day) => [
        (day.crewId ?? day.crew) + ":" + day.date,
        day,
      ])
    );

    return crewEntries.flatMap(({ crew, crewId }) =>
      dates.map((date) =>
        byKey.get((crewId ?? crew) + ":" + date) ?? {
          date,
          label: new Intl.DateTimeFormat("en-US", {
            weekday: "short",
            timeZone: "UTC",
          }).format(new Date(date + "T12:00:00.000Z")),
          crew,
          ...(crewId ? { crewId } : {}),
          stops: [],
          serviceMinutes: 0,
          totalPlannedMinutes: 0,
          capacityMinutesRemaining: 420,
        }
      )
    );
  }, [proposal]);

  function moveAppointmentToRoute(
    appointmentId: string,
    targetCrew: string,
    targetCrewId: string | undefined,
    targetDate: string
  ) {
    setApproved(false);
    setDispatchMessage("");

    setProposal((current) => {
      if (!current) return current;

      const dragged = current.appointments.find((item) => item.id === appointmentId);
      if (!dragged || dragged.status !== "MOVE") return current;

      const newDate = moveToDateKeepTime(
        dragged.newDate || dragged.scheduledDate || current.weather.eventDate,
        targetDate
      );

      const sourceStop = current.routeBoard
        .flatMap((boardDay) => boardDay.stops)
        .find((stop) => stop.id === appointmentId);

      if (!sourceStop) return current;

      let routeBoard = current.routeBoard.map((day) =>
        rebuildRouteDay(
          day,
          day.stops.filter((stop) => stop.id !== appointmentId)
        )
      );

      const targetRouteKey = (targetCrewId ?? targetCrew) + ":" + targetDate;

      if (
        !routeBoard.some(
          (day) => (day.crewId ?? day.crew) + ":" + day.date === targetRouteKey
        )
      ) {
        routeBoard.push({
          date: targetDate,
          label: new Intl.DateTimeFormat("en-US", {
            weekday: "short",
            timeZone: "UTC",
          }).format(new Date(targetDate + "T12:00:00.000Z")),
          crew: targetCrew,
          ...(targetCrewId ? { crewId: targetCrewId } : {}),
          stops: [],
          serviceMinutes: 0,
          totalPlannedMinutes: 0,
          capacityMinutesRemaining: 420,
        });
      }

      routeBoard = routeBoard.map((day) => {
        if ((day.crewId ?? day.crew) + ":" + day.date !== targetRouteKey) return day;

        return rebuildRouteDay(day, [
          ...day.stops,
          {
            ...sourceStop,
            crew: targetCrew,
            ...(targetCrewId ? { crewId: targetCrewId } : {}),
            start: newDate,
            movedFrom: dragged.scheduledDate,
            crewChangedFrom:
              dragged.crewChangedFrom ??
              (dragged.crew !== targetCrew ? dragged.crew : undefined),
            status: "MOVE",
          },
        ]);
      });

      const targetBoard = routeBoard.find(
        (day) => (day.crewId ?? day.crew) + ":" + day.date === targetRouteKey
      );
      const updatedRouteStop = targetBoard?.stops.find(
        (stop) => stop.id === appointmentId
      );

      const addedMiles = updatedRouteStop && targetBoard
        ? insertionMilesFor(updatedRouteStop, targetBoard.stops)
        : 0;

      const driveMinutesAdded = Math.round((addedMiles / 25) * 60);
      const routePosition = updatedRouteStop && targetBoard
        ? targetBoard.stops.findIndex((stop) => stop.id === appointmentId) + 1
        : undefined;

      const returningToOriginalCrew =
        Boolean(dragged.crewChangedFromId) &&
        targetCrewId === dragged.crewChangedFromId;

      const nextCrew = returningToOriginalCrew
        ? dragged.crewChangedFrom!
        : targetCrew;

      const nextCrewId = returningToOriginalCrew
        ? dragged.crewChangedFromId
        : targetCrewId;

      const originalCrew = returningToOriginalCrew
        ? undefined
        : dragged.crewChangedFrom ??
          (dragged.crewId !== targetCrewId ? dragged.crew : undefined);

      const originalCrewId = returningToOriginalCrew
        ? undefined
        : dragged.crewChangedFromId ??
          (dragged.crewId !== targetCrewId ? dragged.crewId : undefined);

      const appointments = current.appointments.map((item) => {
        if (item.id !== appointmentId) return item;

        return {
          ...item,
          crew: nextCrew,
          crewId: nextCrewId,
          crewChangedFrom: originalCrew,
          crewChangedFromId: originalCrewId,
          newDate,
          newDay: new Intl.DateTimeFormat("en-US", {
            weekday: "short",
            timeZone: "UTC",
          }).format(new Date(newDate)),
          routeMilesAdded: Number(addedMiles.toFixed(1)),
          driveMinutesAdded,
          crewMinutesPlanned: targetBoard?.totalPlannedMinutes,
          capacityMinutesRemaining: targetBoard?.capacityMinutesRemaining,
          routePosition,
        };
      });

      const overCapacity = targetBoard && targetBoard.totalPlannedMinutes > 420;
      const message =
        targetCrew !== dragged.crew
          ? "Reassigned " +
            dragged.customer +
            " from " +
            dragged.crew +
            " to " +
            targetCrew +
            " on " +
            new Intl.DateTimeFormat("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            }).format(new Date(newDate)) +
            ". " +
            (overCapacity
              ? "That crew route is over the planning budget. Approval is blocked."
              : "Route totals recalculated. The crew change will be written to Jobber when you approve.")
          : "Moved " +
            dragged.customer +
            " to " +
            targetCrew +
            " on " +
            new Intl.DateTimeFormat("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            }).format(new Date(newDate)) +
            ". " +
            (overCapacity
              ? "That route is over the planning budget; approval is blocked until adjusted."
              : "Route totals recalculated.");

      setDispatchMessage(message);

      return {
        ...current,
        appointments,
        routeBoard,
      };
    });

    setDraggedAppointmentId(null);
  }

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
          updated.routeMilesAdded = undefined;
          updated.driveMinutesAdded = undefined;
          updated.crewMinutesPlanned = undefined;
          updated.capacityMinutesRemaining = undefined;
          updated.routePosition = undefined;
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

          {dispatchMessage && (
            <section
              style={{
                background: "#eef4ff",
                border: "1px solid #cfddf5",
                borderRadius: 14,
                padding: "12px 15px",
                marginBottom: 18,
                color: "#31598d",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {dispatchMessage}
            </section>
          )}

          <section
            style={{
              background: "white",
              border: "1px solid #dfe6ee",
              borderRadius: 18,
              padding: 22,
              marginBottom: 22,
            }}
          >
            <div style={{ marginBottom: 18 }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>Proposed route board</h2>
              <p style={{ margin: "7px 0 0", color: "#6a7787", fontSize: 14 }}>
                Replacement routes are ordered by service start time. Drag a MOVED job to another
                day for the same crew to rebuild the route totals instantly.
              </p>
            </div>

            {proposal.routeBoard.length === 0 ? (
              <div
                style={{
                  border: "1px dashed #cfd8e3",
                  borderRadius: 14,
                  padding: 20,
                  color: "#6a7787",
                }}
              >
                No replacement-day route stops are available yet.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 16 }}>
                {dispatchLanes.map((day) => (
                  <div
                    key={day.crew + ":" + day.date}
                    onDragOver={(event) => {
                      if (draggedAppointmentId) event.preventDefault();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (draggedAppointmentId) {
                        moveAppointmentToRoute(
                          draggedAppointmentId,
                          day.crew,
                          day.crewId,
                          day.date
                        );
                      }
                    }}
                    style={{
                      border: draggedAppointmentId
                        ? "1px dashed #7fa2df"
                        : "1px solid #e1e8f0",
                      borderRadius: 16,
                      overflow: "hidden",
                      background: draggedAppointmentId ? "#fbfdff" : "white",
                    }}
                  >
                    <div
                      style={{
                        padding: "16px 18px",
                        background: "#f8fafc",
                        borderBottom: "1px solid #e7edf4",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 16,
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 12, color: "#6b7888", fontWeight: 800, letterSpacing: 1 }}>
                            {day.label.toUpperCase()} · {day.date}
                          </div>
                          <div style={{ fontSize: 19, fontWeight: 800, marginTop: 4 }}>
                            {day.crew}
                          </div>
                        </div>

                        <div style={{ minWidth: 260 }}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              fontSize: 12,
                              color: "#687789",
                              marginBottom: 7,
                            }}
                          >
                            <span>
                              {day.totalPlannedMinutes} min planned
                              {typeof day.driveMinutes === "number" ? " · " + day.driveMinutes + " min drive" : ""}
                            </span>
                            <strong>{routeBoardUtilization(day)}%</strong>
                          </div>
                          <div
                            style={{
                              height: 8,
                              borderRadius: 999,
                              background: "#e8edf3",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                width: routeBoardUtilization(day) + "%",
                                height: "100%",
                                background: "#3167d8",
                                borderRadius: 999,
                              }}
                            />
                          </div>
                          <div
                            style={{
                              marginTop: 6,
                              fontSize: 12,
                              color: "#5c6b7b",
                              textAlign: "right",
                            }}
                          >
                            {day.capacityMinutesRemaining} min capacity buffer
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "grid" }}>
                      {day.stops.map((stop, index) => (
                        <div
                          key={stop.id}
                          draggable={stop.status === "MOVE"}
                          onDragStart={(event) => {
                            if (stop.status !== "MOVE") return;
                            setDraggedAppointmentId(stop.id);
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", stop.id);
                          }}
                          onDragEnd={() => setDraggedAppointmentId(null)}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "44px 90px 1fr auto",
                            gap: 12,
                            alignItems: "center",
                            padding: "14px 18px",
                            borderTop: index === 0 ? 0 : "1px solid #edf1f5",
                            cursor: stop.status === "MOVE" ? "grab" : "default",
                            opacity: draggedAppointmentId === stop.id ? 0.55 : 1,
                          }}
                        >
                          <div
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: 999,
                              display: "grid",
                              placeItems: "center",
                              background: stop.status === "MOVE" ? "#ffe8e8" : "#e9f0ff",
                              color: stop.status === "MOVE" ? "#a52a2a" : "#2c59a3",
                              fontWeight: 900,
                              fontSize: 12,
                            }}
                          >
                            {index + 1}
                          </div>

                          <div>
                            <div style={{ fontWeight: 800 }}>{formatTime(stop.start)}</div>
                            <div style={{ fontSize: 11, color: "#7a8795" }}>{stop.duration} min</div>
                          </div>

                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 750 }}>{stop.customer}</div>
                            <div style={{ fontSize: 12, color: "#768493" }}>
                              {stop.service} · {stop.address}
                            </div>
                            {stop.status === "MOVE" && (
                              <div style={{ marginTop: 5, color: "#a52a2a", fontSize: 11, fontWeight: 800 }}>
                                MOVED IN · originally {formatDateTime(stop.movedFrom)}
                                {stop.crewChangedFrom
                                  ? " · reassigned from " + stop.crewChangedFrom
                                  : ""}
                              </div>
                            )}
                          </div>

                          <div
                            style={{
                              padding: "6px 9px",
                              borderRadius: 999,
                              background: stop.status === "MOVE" ? "#ffe8e8" : "#eef3f8",
                              color: stop.status === "MOVE" ? "#a52a2a" : "#526170",
                              fontSize: 11,
                              fontWeight: 900,
                            }}
                          >
                            {stop.status === "MOVE" ? "MOVED" : "SCHEDULED"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
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
                      <td style={{ padding: 16, color: "#526170", maxWidth: 340 }}>
                        <div>{appointment.reason}</div>
                        {appointment.status === "MOVE" && routeSummary(appointment) && (
                          <div
                            style={{
                              marginTop: 8,
                              padding: "8px 10px",
                              borderRadius: 9,
                              background: "#f4f7fb",
                              color: "#40546b",
                              fontSize: 12,
                              fontWeight: 700,
                            }}
                          >
                            {routeSummary(appointment)}
                          </div>
                        )}
                        {appointment.status === "REVIEW" && (
                          <div
                            style={{
                              marginTop: 8,
                              fontSize: 12,
                              fontWeight: 700,
                              color: "#8a5a00",
                            }}
                          >
                            Route or capacity needs operator attention.
                          </div>
                        )}
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
                  ? "Resolve all REVIEW items before approval."
                  : routeOverCapacity
                    ? "One or more routes exceed the 420-minute planning budget. Drag moved jobs to another crew or day."
                    : crewReassignmentsPending
                      ? "Crew changes will be written to Jobber together with the approved schedule."
                      : counts.move > 0
                        ? "Approve to write MOVE decisions back to Jobber. KEEP decisions stay where they are."
                        : "No changes are recommended for this weather window."}
              </div>
              <button
                onClick={approve}
                disabled={
                  approved ||
                  counts.review > 0 ||
                  counts.move === 0 ||
                  routeOverCapacity
                }
                style={{
                  border: 0,
                  borderRadius: 12,
                  padding: "13px 20px",
                  fontWeight: 800,
                  cursor: approved || counts.review > 0 || routeOverCapacity ? "default" : "pointer",
                  background: approved
                    ? "#9bbba8"
                    : counts.review > 0 || routeOverCapacity
                      ? "#aeb8c5"
                      : "#3167d8",
                  color: "white",
                }}
              >
                {approved
                  ? "Approved ✓"
                  : counts.review > 0
                    ? "Resolve Reviews First"
                    : routeOverCapacity
                      ? "Adjust Route Capacity"
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
