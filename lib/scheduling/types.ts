export type ScheduleStatus = "KEEP" | "MOVE" | "REVIEW";

export type DemoAppointment = {
  id: string;
  customer: string;
  address: string;
  crew: string;
  service: string;
  duration: number;
  distance: number;
  latitude?: number | null;
  longitude?: number | null;
  preferredDay: string;
  scheduledDate?: string;
};

export type WeatherEvent = {
  location: string;
  eventDate: string;
  rainProbability: number;
  expectedInches: number;
};

export type ProposedAppointment = DemoAppointment & {
  status: ScheduleStatus;
  reason: string;
  newDay?: string;
  newDate?: string;
  routeMilesAdded?: number;
  driveMinutesAdded?: number;
  crewMinutesPlanned?: number;
  capacityMinutesRemaining?: number;
  routePosition?: number;
  crewChangedFrom?: string;
};

export type RouteBoardStop = {
  id: string;
  customer: string;
  address: string;
  service: string;
  crew: string;
  start: string;
  duration: number;
  status: "SCHEDULED" | "MOVE";
  movedFrom?: string;
  crewChangedFrom?: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type RouteBoardDay = {
  date: string;
  label: string;
  crew: string;
  stops: RouteBoardStop[];
  serviceMinutes: number;
  driveMinutes?: number;
  totalPlannedMinutes: number;
  capacityMinutesRemaining: number;
};

export type RescheduleProposal = {
  companyId?: string;
  weather: WeatherEvent;
  appointments: ProposedAppointment[];
  routeBoard: RouteBoardDay[];
  counts: {
    move: number;
    keep: number;
    review: number;
  };
};