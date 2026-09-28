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

// Leave a 60-minute operating buffer for breaks, traffic, delays, and overruns.
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

function dateKey(isoDate: string) {
  return isoDate.slice(0, 10);
}

function getWeekday(isoDate: string) {
  return new Date(isoDate).toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
}

function getReplacementDays(eventDate: string) {
  const days: Array<{ label: string; offset: number; date: string }> = [];

  for (let offset = 1; days.length < 3; offset += 1) {
    const date = addDays(eventDate, offset);
    const label = getWeekday(date);

    // Sunday is not treated as a normal replacement day.
    if (label === "Sun") continue;

    days.push({ label, offset, date });
  }

  return days;
}

function buildExistingLoad(
  existingAppointments: DemoAppointment[],
  replacementDays: Array<{ label: string; date: string }>
) {
  const load: CrewLoad = {};

  for (const appointment of existingAppointments) {
    if (!appointment.scheduledDate) continue;

    const scheduled = dateKey(appointment.scheduledDate);
    const replacement = replacementDays.find((day) => day.date.slice(0, 10) === scheduled);
    if (!replacement) continue;

    const key = appointment.crew + ":" + replacement.date.slice(0, 10);
    load[key] = (load[key] ?? 0) + appointment.duration;
  }

  return load;
}

function chooseReplacementDay(
  appointment: DemoAppointment,
  crewLoad: CrewLoad,
  replacementDays: Array<{ label: string; offset: number; date: string }>
): { label: string; offset: number; date: string } | null {
  const preferredIndex = replacementDays.findIndex(
    (day) => day.label === appointment.preferredDay
  );

  return (
    replacementDays
      .map((day, index) => ({
        ...day,
        preferenceDistance:
          preferredIndex < 0 ? index : Math.abs(index - preferredIndex),
        load:
          crewLoad[appointment.crew + ":" + day.date.slice(0, 10)] ?? 0,
      }))
      .sort((a, b) =>
        a.preferenceDistance - b.preferenceDistance ||
        a.load - b.load ||
        a.offset - b.offset
      )
      .find(
        (candidate) =>
          candidate.load + appointment.duration <= CREW_MOVE_CAPACITY_MINUTES
      ) ?? null
  );
}

export function buildRescheduleProposal(
  appointments: DemoAppointment[],
  weather: WeatherEvent,
  existingAppointments: DemoAppointment[] = []
): RescheduleProposal {
  const replacementDays = getReplacementDays(weather.eventDate);
  const crewLoad = buildExistingLoad(existingAppointments, replacementDays);
  const proposed: ProposedAppointment[] = [];

  // Keep the same crew order used by the provider, then place longer jobs first
  // so the hardest-to-fit work gets capacity before short visits.
  const orderedAppointments = [...appointments].sort(
    (a, b) =>
      b.duration - a.duration ||
      a.crew.localeCompare(b.crew) ||
      a.id.localeCompare(b.id)
  );

  for (const appointment of orderedAppointments) {
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
        replacementDays
      );

      if (!replacement) {
        next.status = "REVIEW";
        next.reason =
          "No replacement day has enough crew capacity without overloading the route";
      } else {
        next.newDay = replacement.label;
        next.newDate = replacement.date;

        const key = appointment.crew + ":" + replacement.date.slice(0, 10);
        crewLoad[key] = (crewLoad[key] ?? 0) + appointment.duration;
      }
    }

    proposed.push(next);
  }

  proposed.sort((a, b) => {
    const aTime = a.scheduledDate ? new Date(a.scheduledDate).getTime() : 0;
    const bTime = b.scheduledDate ? new Date(b.scheduledDate).getTime() : 0;
    return aTime - bTime || a.customer.localeCompare(b.customer);
  });

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
