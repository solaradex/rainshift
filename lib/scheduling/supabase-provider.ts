import type { SupabaseClient } from "@supabase/supabase-js";
import type { DemoAppointment } from "./types";
import type { AppointmentUpdate, SchedulingProvider, UpdatedAppointment } from "./provider";

export function createSupabaseSchedulingProvider(
  supabase: SupabaseClient,
  companyId: string
): SchedulingProvider {
  return {
    async getAppointments(start, end) {
      const { data: records, error: appointmentError } = await supabase
        .from("appointments")
        .select("id,customer_id,crew_id,service,duration_minutes,scheduled_date,status")
        .eq("company_id", companyId)
        .gte("scheduled_date", start)
        .lt("scheduled_date", end)
        .in("status", ["SCHEDULED", "KEEP", "MOVE", "REVIEW"])
        .order("crew_id", { ascending: true })
        .order("scheduled_date", { ascending: true });

      if (appointmentError) throw appointmentError;

      const customerIds = [...new Set((records ?? []).map((record) => record.customer_id))];
      const crewIds = [...new Set((records ?? []).map((record) => record.crew_id))];

      const [{ data: customers, error: customerError }, { data: crews, error: crewError }] =
        await Promise.all([
          supabase
            .from("customers")
            .select("id,name,address,preferred_days")
            .eq("company_id", companyId)
            .in("id", customerIds),
          supabase
            .from("crews")
            .select("id,name")
            .eq("company_id", companyId)
            .in("id", crewIds),
        ]);

      if (customerError) throw customerError;
      if (crewError) throw crewError;

      const customerMap = new Map((customers ?? []).map((customer) => [customer.id, customer]));
      const crewMap = new Map((crews ?? []).map((crew) => [crew.id, crew]));

      return (records ?? []).map((record) => {
        const customer = customerMap.get(record.customer_id);
        const crew = crewMap.get(record.crew_id);

        if (!customer || !crew) {
          throw new Error("Appointment references missing customer or crew: " + record.id);
        }

        return {
          id: record.id,
          customer: customer.name,
          address: customer.address,
          crew: crew.name,
          service: record.service,
          duration: record.duration_minutes,
          distance: 0,
          preferredDay: customer.preferred_days[0] ?? "Thu",
        } satisfies DemoAppointment;
      });
    },

    async updateAppointment(id, update) {
      const payload: Record<string, string | null> = {
        status: update.status,
        approved_at: update.approvedAt ?? new Date().toISOString(),
      };

      if (update.scheduledDate) payload.scheduled_date = update.scheduledDate;
      if (update.proposedDate) payload.proposed_date = update.proposedDate;
      if (update.moveReason !== undefined) payload.move_reason = update.moveReason;

      const { data, error } = await supabase
        .from("appointments")
        .update(payload)
        .eq("id", id)
        .eq("company_id", companyId)
        .select("id,status,scheduled_date")
        .single();

      if (error) throw error;

      return {
        id: data.id,
        status: data.status,
        scheduledDate: data.scheduled_date,
      } satisfies UpdatedAppointment;
    },
  };
}
