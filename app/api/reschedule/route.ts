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

    const { data: weatherRecord, error: weatherError } = await supabase
      .from("weather_events")
      .select("event_date,rain_probability,expected_inches,location")
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
      { ok: false, error: "Supabase database request failed" },
      { status: 500 }
    );
  }
}
