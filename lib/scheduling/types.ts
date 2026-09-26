export type ScheduleStatus = "KEEP" | "MOVE" | "REVIEW";

export type DemoAppointment = {
  id: string;
  customer: string;
  address: string;
  crew: string;
  service: string;
  duration: number;
  distance: number;
  preferredDay: string;
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
};

export type RescheduleProposal = {
  companyId?: string;
  weather: WeatherEvent;
  appointments: ProposedAppointment[];
  counts: {
    move: number;
    keep: number;
    review: number;
  };
};
