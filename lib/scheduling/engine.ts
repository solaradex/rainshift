import type {
  DemoAppointment,
  ProposedAppointment,
  RescheduleProposal,
  WeatherEvent,
} from "./types";

type CrewLoad = Record<string, number>;

const replacementDays = [
  { label: "Thu", offset: 3 },
  { label: "Fri", offset: 4 },
  { label: "Sat", offset: 5 },
];
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
    Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate() + offset)
  );
  return next.toISOString();
}

function chooseReplacementDay(
  appointment: DemoAppointment,
  crewLoad: CrewLoad
): { label: string; offset: number } {
  const preferred = replacementDays.findIndex((day) => day.label === appointment.preferredDay);
  const ordered = replacementDays
    .map((day, index) => ({
      ...day,
      distance: preferred < 0 ? index : Math.abs(index - preferred),
    }))
    .sort((a, b) => a.distance - b.distance);

  const chosen = ordered.find((candidate) => {
    const key = appointment.crew + ":" + candidate.label;
    return (crewLoad[key] ?? 0) + appointment.duration <= CREW_MOVE_CAPACITY_MINUTES;
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
      const replacement = chooseReplacementDay(appointment, crewLoad);
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
