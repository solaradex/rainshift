import { NextResponse } from "next/server";
import { getCurrentCompany } from "@/lib/auth/company";
import { buildRescheduleProposal } from "@/lib/scheduling/engine";
import { createSupabaseSchedulingProvider } from "@/lib/scheduling/supabase-provider";
import type { WeatherEvent } from "@/lib/scheduling/types";

export async function POST() {
  try {
    const { supabase, userId, companyId } = await getCurrentCompany();

    if (!userId || !companyId) {
      return NextResponse.json(
        { ok: false, error: "No RainShift company is attached to this account" },
        { status: 403 }
      );
    }

    const { data: jobberAppointment, error: jobberError } = await supabase
      .from("appointments")
      .select("scheduled_date")
      .eq("company_id", companyId)
      .eq("source_provider", "jobber")
      .in("status", ["SCHEDULED", "KEEP", "MOVE", "REVIEW"])
      .order("scheduled_date", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (jobberError) throw jobberError;

    let weatherQuery = supabase
      .from("weather_events")
      .select("event_date,rain_probability,expected_inches,location")
      .eq("company_id", companyId);

    if (jobberAppointment?.scheduled_date) {
      const day = new Date(jobberAppointment.scheduled_date).toISOString().slice(0, 10);
      const nextDay = new Date(
        new Date(`${day}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000
      ).toISOString();

      weatherQuery = weatherQuery
        .gte("event_date", `${day}T00:00:00.000Z`)
        .lt("event_date", nextDay);
    }

    const { data: weatherRecord, error: weatherError } = await weatherQuery
      .order("event_date", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (weatherError) throw weatherError;

    if (!weatherRecord) {
      return NextResponse.json(
        { ok: false, error: "No weather event found for the active Jobber schedule" },
        { status: 404 }
      );
    }

    const start = weatherRecord.event_date;
    const end = new Date(
      new Date(start).getTime() + 24 * 60 * 60 * 1000
    ).toISOString();

    const provider = createSupabaseSchedulingProvider(supabase, companyId);
    const appointments = await provider.getAppointments(start, end);

    const weather: WeatherEvent = {
      location: weatherRecord.location ?? "Jacksonville",
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
      { ok: false, error: error instanceof Error ? error.message : "Could not generate proposal" },
      { status: 500 }
    );
  }
}
