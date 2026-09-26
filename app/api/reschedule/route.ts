import { NextResponse } from "next/server";
import { getCurrentCompany } from "@/lib/auth/company";
import { buildRescheduleProposal } from "@/lib/scheduling/engine";
import type { DemoAppointment, WeatherEvent } from "@/lib/scheduling/types";

export async function POST() {
  try {
    const { supabase, userId, companyId } = await getCurrentCompany();

    if (!userId || !companyId) {
      return NextResponse.json(
        { ok: false, error: "No RainShift company is attached to this account" },
        { status: 403 }
      );
    }

    const { data: weatherRecord, error: weatherError } = await supabase
      .from("weather_events")
      .select("event_date,rain_probability,expected_inches")
      .eq("company_id", companyId)
      .order("event_date", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (weatherError) throw weatherError;

    if (!weatherRecord) {
      return NextResponse.json(
        { ok: false, error: "No weather event found for this company" },
        { status: 404 }
      );
    }

    const start = weatherRecord.event_date;
    const end = new Date(
      new Date(start).getTime() + 24 * 60 * 60 * 1000
    ).toISOString();

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

    const customerIds = [
      ...new Set((records ?? []).map((record) => record.customer_id)),
    ];
    const crewIds = [
      ...new Set((records ?? []).map((record) => record.crew_id)),
    ];

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

    const customerMap = new Map(
      (customers ?? []).map((customer) => [customer.id, customer])
    );
    const crewMap = new Map(
      (crews ?? []).map((crew) => [crew.id, crew])
    );

    const appointments: DemoAppointment[] = (records ?? []).map((record) => {
      const customer = customerMap.get(record.customer_id);
      const crew = crewMap.get(record.crew_id);

      if (!customer || !crew) {
        throw new Error(
          "Appointment references missing customer or crew: " + record.id
        );
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
      };
    });

    const weather: WeatherEvent = {
      location: "Jacksonville",
      eventDate: weatherRecord.event_date,
      rainProbability: weatherRecord.rain_probability,
      expectedInches: weatherRecord.expected_inches,
    };

    const proposal = buildRescheduleProposal(appointments, weather);
    proposal.companyId = companyId;

    return NextResponse.json({
      ok: true,
      proposal,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("RainShift reschedule error", error);

    return NextResponse.json(
      { ok: false, error: "Supabase database request failed" },
      { status: 500 }
    );
  }
}
