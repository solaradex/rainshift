import type { DemoAppointment } from "./types";

export type AppointmentUpdate = {
  status: "KEEP" | "RESCHEDULED";
  scheduledDate?: string;
  proposedDate?: string;
  crewId?: string;
  moveReason?: string | null;
  approvedAt?: string;
};

export type UpdatedAppointment = {
  id: string;
  status: string;
  scheduledDate: string;
};

export interface SchedulingProvider {
  getAppointments(start: string, end: string): Promise<DemoAppointment[]>;
  updateAppointment(id: string, update: AppointmentUpdate): Promise<UpdatedAppointment>;
}
