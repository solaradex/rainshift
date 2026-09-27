import type {
  DemoAppointment,
  ProposedAppointment,
  RescheduleProposal,
  WeatherEvent,
} from "./types";

type CrewLoad = Record<string, number>;

const AUTO_MOVE_RAIN_PROBABILITY = 85;
const AUTO_MOVE_RAIN_INCHES = 1.75;
const REVIEW_RAIN_PROBABILITY = 70;
const REVIEW_RAIN_INCHES = 0.75;
const CREW_MOVE_CAPACITY_MINUTES = 420;

function classifyAppointment(
  appointment: DemoAppointment,
  weather: WeatherEvent
): { status: ProposedAppointment["status"]; reason: string } {
  const highRisk =
    weather.rainProbability >= AUTO_MOVE_RAIN_PROBABILITY ||
    weather.expectedInches >= AUTO_MOVE_RAIN_INCHES;

  const mediumRisk =
    weather.rainProbability >= REVIEW_RAIN_PROBABILITY ||
    weather.expectedInches >= REVIEW_RAIN_INCHES;

  if (highRisk) {
    return {
      status: "MOVE",
      reason: "Expected rainfall exceeds the automatic move threshold",
    };
  }

  if (mediumRisk) {
    if (appointment.service === "Landscape Bed" || appointment.service === "Cleanup") {
      return {
        status: "REVIEW",
        reason: "Weather risk depends on surface conditions and timing",
      };
    }

    return {
      status: "MOVE",
      reason: "Rain overlaps enough of the service window to justify a move",
    };
  }

  return {
    status: "KEEP",
    reason: "Rain risk stays below the automatic move threshold",
  };
}

function addDays(isoDate: string, offset: number) {
  const source = new Date(isoDate);
  const next = new Date(
    Date.UTC(
      source.getUTCFullYear(),
      source.getUTCMonth(),
      source.getUTCDate() + offset
    )
  );
  return next.toISOString();
}

function getWeekday(isoDate: string) {
  return new Date(isoDate).toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
}

function getReplacementDays(eventDate: string) {
  const days: Array<{ label: string; offset: number }> = [];

  for (let offset = 1; days.length < 3; offset += 1) {
    const date = addDays(eventDate, offset);
    const label = getWeekday(date);

    if (label === "Sun") continue;

    days.push({ label, offset });
  }

  return days;
}

function chooseReplacementDay(
  appointment: DemoAppointment,
  crewLoad: CrewLoad,
  eventDate: string
): { label: string; offset: number } {
  const replacementDays = getReplacementDays(eventDate);
  const preferredIndex = replacementDays.findIndex(
    (day) => day.label === appointment.preferredDay
  );

  const ordered = replacementDays
    .map((day, index) => ({
      ...day,
      distance:
        preferredIndex < 0
          ? index
          : Math.abs(index - preferredIndex),
    }))
    .sort((a, b) => a.distance - b.distance);

  const chosen = ordered.find((candidate) => {
    const key = appointment.crew + ":" + candidate.label;
    return (
      (crewLoad[key] ?? 0) + appointment.duration <=
      CREW_MOVE_CAPACITY_MINUTES
    );
  });

  return chosen ?? ordered[0];
}

export function buildRescheduleProposal(
  appointments: DemoAppointment[],
  weather: WeatherEvent
): RescheduleProposal {
  const crewLoad: CrewLoad = {};
  const proposed: ProposedAppointment[] = [];

  for (const appointment of appointments) {
    const decision = classifyAppointment(appointment, weather);
    const next: ProposedAppointment = {
      ...appointment,
      status: decision.status,
      reason: decision.reason,
    };

    if (decision.status === "MOVE") {
      const replacement = chooseReplacementDay(
        appointment,
        crewLoad,
        weather.eventDate
      );

      next.newDay = replacement.label;
      next.newDate = addDays(weather.eventDate, replacement.offset);

      const key = appointment.crew + ":" + replacement.label;
      crewLoad[key] = (crewLoad[key] ?? 0) + appointment.duration;
    }

    proposed.push(next);
  }

  return {
    weather,
    appointments: proposed,
    counts: {
      move: proposed.filter((item) => item.status === "MOVE").length,
      keep: proposed.filter((item) => item.status === "KEEP").length,
      review: proposed.filter((item) => item.status === "REVIEW").length,
    },
  };
}
