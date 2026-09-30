import type {
  DemoAppointment,
  ProposedAppointment,
  RescheduleProposal,
  RouteBoardDay,
  RouteBoardStop,
  WeatherEvent,
} from "./types";

type CrewLoad = Record<string, number>;

type RoutePoint = { latitude: number; longitude: number };

type RouteStop = {
  id: string;
  point: RoutePoint;
  startMinutes: number;
  duration: number;
};

type CrewRoutes = Record<string, RouteStop[]>;

type CrewDriveMinutes = Record<string, number>;

const AUTO_MOVE_RAIN_PROBABILITY = 85;
const AUTO_MOVE_RAIN_INCHES = 1.75;
const REVIEW_RAIN_PROBABILITY = 70;
const REVIEW_RAIN_INCHES = 0.75;

// Leave a 60-minute operating buffer for breaks, traffic, delays, and overruns.
const CREW_MOVE_CAPACITY_MINUTES = 420;
const AVERAGE_ROUTE_SPEED_MPH = 25;

// Approximate driving distance is deliberately local and dependency-free.
// A paid routing API can replace this later without changing the scheduler contract.
function haversineMiles(a: RoutePoint, b: RoutePoint) {
  const earthRadiusMiles = 3958.8;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(h));
}

function pointFor(appointment: DemoAppointment): RoutePoint | null {
  if (
    typeof appointment.latitude !== "number" ||
    typeof appointment.longitude !== "number"
  ) {
    return null;
  }

  return {
    latitude: appointment.latitude,
    longitude: appointment.longitude,
  };
}

function milesToMinutes(miles: number) {
  return (miles / AVERAGE_ROUTE_SPEED_MPH) * 60;
}

function startMinutesFor(appointment: DemoAppointment) {
  if (!appointment.scheduledDate) return null;
  const date = new Date(appointment.scheduledDate);
  if (Number.isNaN(date.getTime())) return null;
  return (
    date.getUTCHours() * 60 +
    date.getUTCMinutes() +
    date.getUTCSeconds() / 60
  );
}

function routeStopFor(appointment: DemoAppointment): RouteStop | null {
  const point = pointFor(appointment);
  const startMinutes = startMinutesFor(appointment);

  if (!point || startMinutes === null) return null;

  return {
    id: appointment.id,
    point,
    startMinutes,
    duration: appointment.duration,
  };
}

function sortRoute(route: RouteStop[]) {
  route.sort(
    (a, b) => a.startMinutes - b.startMinutes || a.id.localeCompare(b.id)
  );
}

function routeMiles(route: RouteStop[]) {
  let miles = 0;

  for (let index = 1; index < route.length; index += 1) {
    miles += haversineMiles(route[index - 1].point, route[index].point);
  }

  return miles;
}

function routeBoardStopFor(
  appointment: DemoAppointment | ProposedAppointment,
  start: string,
  status: RouteBoardStop["status"]
): RouteBoardStop {
  return {
    id: appointment.id,
    customer: appointment.customer,
    address: appointment.address,
    service: appointment.service,
    crew: appointment.crew,
    ...(appointment.crewId ? { crewId: appointment.crewId } : {}),
    start,
    duration: appointment.duration,
    status,
    ...(appointment.latitude !== undefined ? { latitude: appointment.latitude } : {}),
    ...(appointment.longitude !== undefined ? { longitude: appointment.longitude } : {}),
  };
}

function buildRouteBoard(
  existingAppointments: DemoAppointment[],
  proposedAppointments: ProposedAppointment[],
  replacementDays: Array<{ label: string; offset: number; date: string }>
): RouteBoardDay[] {
  const grouped = new Map<string, RouteBoardStop[]>();

  for (const appointment of existingAppointments) {
    if (!appointment.scheduledDate) continue;

    const replacement = replacementDays.find(
      (day) => day.date.slice(0, 10) === dateKey(appointment.scheduledDate!)
    );
    if (!replacement) continue;

    const key = (appointment.crewId ?? appointment.crew) + ":" + replacement.date.slice(0, 10);
    const stops = grouped.get(key) ?? [];
    stops.push(routeBoardStopFor(appointment, appointment.scheduledDate, "SCHEDULED"));
    grouped.set(key, stops);
  }

  for (const appointment of proposedAppointments) {
    if (appointment.status !== "MOVE" || !appointment.newDate) continue;

    const replacement = replacementDays.find(
      (day) => day.date.slice(0, 10) === dateKey(appointment.newDate!)
    );
    if (!replacement) continue;

    const key = (appointment.crewId ?? appointment.crew) + ":" + replacement.date.slice(0, 10);
    const stops = grouped.get(key) ?? [];
    stops.push(
      routeBoardStopFor(
        appointment,
        appointment.newDate,
        "MOVE"
      )
    );
    stops[stops.length - 1].movedFrom = appointment.scheduledDate;
    grouped.set(key, stops);
  }

  const boards: RouteBoardDay[] = [];

  for (const [key, stops] of grouped.entries()) {
    stops.sort(
      (a, b) =>
        new Date(a.start).getTime() - new Date(b.start).getTime() ||
        a.id.localeCompare(b.id)
    );

    let driveMinutes = 0;
    let serviceMinutes = 0;

    for (let index = 0; index < stops.length; index += 1) {
      serviceMinutes += stops[index].duration;

      if (index > 0) {
        const before = stops[index - 1];
        const after = stops[index];

        if (
          typeof before.latitude === "number" &&
          typeof before.longitude === "number" &&
          typeof after.latitude === "number" &&
          typeof after.longitude === "number"
        ) {
          driveMinutes += milesToMinutes(
            haversineMiles(
              { latitude: before.latitude, longitude: before.longitude },
              { latitude: after.latitude, longitude: after.longitude }
            )
          );
        }
      }
    }

    const [crewKey, date] = key.split(":");
    const crewStop = stops.find((stop) => stop.crewId === crewKey);
    const crew = crewStop?.crew ?? crewKey;
    const crewId = crewStop?.crewId;
    const label =
      replacementDays.find((day) => day.date.slice(0, 10) === date)?.label ??
      getWeekday(date + "T00:00:00.000Z");
    const totalPlannedMinutes = Math.round(serviceMinutes + driveMinutes);

    boards.push({
      date,
      label,
      crew,
      ...(crewId ? { crewId } : {}),
      stops,
      serviceMinutes,
      driveMinutes:
        driveMinutes > 0 ? Math.round(driveMinutes) : undefined,
      totalPlannedMinutes,
      capacityMinutesRemaining: Math.max(
        0,
        Math.round(CREW_MOVE_CAPACITY_MINUTES - totalPlannedMinutes)
      ),
    });
  }

  return boards.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.crew.localeCompare(b.crew)
  );
}

function insertionRouteCostMiles(
  appointment: DemoAppointment,
  route: RouteStop[]
) {
  const point = pointFor(appointment);
  const startMinutes = startMinutesFor(appointment);

  if (!point || startMinutes === null) {
    return appointment.distance;
  }

  if (route.length === 0) {
    return 0;
  }

  const insertionIndex = route.findIndex(
    (stop) => stop.startMinutes > startMinutes
  );
  const index = insertionIndex < 0 ? route.length : insertionIndex;
  const before = route[index - 1];
  const after = route[index];

  if (!before && after) return haversineMiles(point, after.point);
  if (before && !after) return haversineMiles(before.point, point);
  if (before && after) {
    return (
      haversineMiles(before.point, point) +
      haversineMiles(point, after.point) -
      haversineMiles(before.point, after.point)
    );
  }

  return 0;
}

function routePosition(
  appointment: DemoAppointment,
  route: RouteStop[]
) {
  const candidate = routeStopFor(appointment);
  if (!candidate) return null;

  const nextRoute = [...route, candidate];
  sortRoute(nextRoute);
  const index = nextRoute.findIndex((stop) => stop.id === appointment.id);
  return index < 0 ? null : index + 1;
}

function hasCompatibleTimeWindow(
  appointment: DemoAppointment,
  route: RouteStop[]
) {
  const candidate = routeStopFor(appointment);
  if (!candidate) return true;

  const nextRoute = [...route, candidate];
  sortRoute(nextRoute);

  for (let index = 1; index < nextRoute.length; index += 1) {
    const before = nextRoute[index - 1];
    const after = nextRoute[index];
    const travelMinutes = milesToMinutes(
      haversineMiles(before.point, after.point)
    );

    if (after.startMinutes < before.startMinutes + before.duration + travelMinutes) {
      return false;
    }
  }

  return true;
}

function replacementDateWithTime(
  appointment: DemoAppointment,
  replacementDate: string
) {
  if (!appointment.scheduledDate) return replacementDate;

  const source = new Date(appointment.scheduledDate);
  const target = new Date(replacementDate);

  if (Number.isNaN(source.getTime()) || Number.isNaN(target.getTime())) {
    return replacementDate;
  }

  target.setUTCHours(
    source.getUTCHours(),
    source.getUTCMinutes(),
    source.getUTCSeconds(),
    source.getUTCMilliseconds()
  );

  return target.toISOString();
}

function buildExistingRoutes(
  existingAppointments: DemoAppointment[],
  replacementDays: Array<{ label: string; date: string }>
) {
  const routes: CrewRoutes = {};
  const driveMinutes: CrewDriveMinutes = {};

  for (const appointment of existingAppointments) {
    const stop = routeStopFor(appointment);
    if (!stop || !appointment.scheduledDate) continue;

    const scheduled = dateKey(appointment.scheduledDate);
    const replacement = replacementDays.find(
      (day) => day.date.slice(0, 10) === scheduled
    );
    if (!replacement) continue;

    const key = appointment.crew + ":" + replacement.date.slice(0, 10);
    (routes[key] ??= []).push(stop);
  }

  for (const [key, route] of Object.entries(routes)) {
    sortRoute(route);
    driveMinutes[key] = milesToMinutes(routeMiles(route));
  }

  return { routes, driveMinutes };
}

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

    const key = (appointment.crewId ?? appointment.crew) + ":" + replacement.date.slice(0, 10);
    load[key] = (load[key] ?? 0) + appointment.duration;
  }

  return load;
}

function chooseReplacementDay(
  appointment: DemoAppointment,
  crewLoad: CrewLoad,
  crewRoutes: CrewRoutes,
  crewDriveMinutes: CrewDriveMinutes,
  replacementDays: Array<{ label: string; offset: number; date: string }>
): {
  label: string;
  offset: number;
  date: string;
  routeCost: number;
  driveMinutes: number;
  load: number;
  timeFeasible: boolean;
} | null {
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
          crewLoad[(appointment.crewId ?? appointment.crew) + ":" + day.date.slice(0, 10)] ?? 0,
        routeCost:
          insertionRouteCostMiles(
            appointment,
            crewRoutes[(appointment.crewId ?? appointment.crew) + ":" + day.date.slice(0, 10)] ?? []
          ),
        driveMinutes:
          crewDriveMinutes[(appointment.crewId ?? appointment.crew) + ":" + day.date.slice(0, 10)] ?? 0,
        timeFeasible: hasCompatibleTimeWindow(
          appointment,
          crewRoutes[(appointment.crewId ?? appointment.crew) + ":" + day.date.slice(0, 10)] ?? []
        ),
      }))
      .sort((a, b) =>
        a.routeCost - b.routeCost ||
        a.preferenceDistance - b.preferenceDistance ||
        a.load - b.load ||
        a.offset - b.offset
      )
      .find(
        (candidate) =>
          candidate.timeFeasible &&
          candidate.load +
            candidate.driveMinutes +
            appointment.duration +
            milesToMinutes(candidate.routeCost) <=
          CREW_MOVE_CAPACITY_MINUTES
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
  const existingRoutes = buildExistingRoutes(existingAppointments, replacementDays);
  const crewRoutes = existingRoutes.routes;
  const crewDriveMinutes = existingRoutes.driveMinutes;
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
        crewRoutes,
        crewDriveMinutes,
        replacementDays
      );

      if (!replacement) {
        next.status = "REVIEW";
        next.reason =
          "No replacement day has enough crew capacity or a compatible route time window";
      } else {
        next.newDay = replacement.label;
        next.newDate = replacementDateWithTime(appointment, replacement.date);

        const key = appointment.crew + ":" + replacement.date.slice(0, 10);
        const plannedMinutes =
          replacement.load +
          replacement.driveMinutes +
          appointment.duration +
          milesToMinutes(replacement.routeCost);

        next.routeMilesAdded = Number(replacement.routeCost.toFixed(1));
        next.driveMinutesAdded = Math.round(milesToMinutes(replacement.routeCost));
        next.crewMinutesPlanned = Math.round(plannedMinutes);
        next.capacityMinutesRemaining = Math.max(
          0,
          Math.round(CREW_MOVE_CAPACITY_MINUTES - plannedMinutes)
        );
        next.routePosition =
          routePosition(
            appointment,
            crewRoutes[key] ?? []
          ) ?? undefined;

        crewLoad[key] = (crewLoad[key] ?? 0) + appointment.duration;
        const stop = routeStopFor(appointment);
        if (stop) {
          (crewRoutes[key] ??= []).push({
            ...stop,
          });
          sortRoute(crewRoutes[key]);
          crewDriveMinutes[key] = milesToMinutes(routeMiles(crewRoutes[key]));
        }
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
    routeBoard: buildRouteBoard(
      existingAppointments,
      proposed,
      replacementDays
    ),
    counts: {
      move: proposed.filter((item) => item.status === "MOVE").length,
      keep: proposed.filter((item) => item.status === "KEEP").length,
      review: proposed.filter((item) => item.status === "REVIEW").length,
    },
  };
}
