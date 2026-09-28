import { NextResponse } from "next/server";
import { getCurrentCompany } from "@/lib/auth/company";
import { getDailyRainForecast } from "@/lib/weather/open-meteo";
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
      .in("status", ["SCHEDULED", "KEEP", "MOVE", "REVIEW", "RESCHEDULED"])
      .gte("scheduled_date", new Date().toISOString())
      .order("scheduled_date", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (jobberError) throw jobberError;

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("service_area,service_latitude,service_longitude,timezone")
      .eq("id", companyId)
      .maybeSingle();

    if (companyError) throw companyError;
    if (!company) {
      return NextResponse.json(
        { ok: false, error: "Company not found" },
        { status: 404 }
      );
    }

    if (!jobberAppointment?.scheduled_date) {
      return NextResponse.json(
        { ok: false, error: "No real Jobber appointments are synced yet" },
        { status: 404 }
      );
    }

    const eventDate = new Date(jobberAppointment.scheduled_date)
      .toISOString()
      .slice(0, 10);

    // Generate the forecast directly from the real Jobber date. This keeps the
    // proposal independent of stale/demo weather rows.
    const forecast = await getDailyRainForecast(
      Number(company.service_latitude),
      Number(company.service_longitude),
      eventDate,
      eventDate,
      company.timezone || "America/New_York"
    );

    const day = forecast.find((item) => item.date === eventDate);
    if (!day) {
      throw new Error(`No forecast returned for Jobber date ${eventDate}`);
    }

    const severity =
      day.rainProbability >= 85 || day.rainInches >= 1.75
        ? "HIGH"
        : day.rainProbability >= 70 || day.rainInches >= 0.75
          ? "MEDIUM"
          : "LOW";

    const weatherId = `${companyId}-weather-${eventDate}`;

    const { error: weatherUpsertError } = await supabase
      .from("weather_events")
      .upsert(
        {
          id: weatherId,
          company_id: companyId,
          event_date: `${eventDate}T00:00:00.000Z`,
          rain_probability: day.rainProbability,
          expected_inches: day.rainInches,
          severity,
          location: company.service_area,
          weather_source: "open-meteo",
          checked_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

    if (weatherUpsertError) throw weatherUpsertError;

    // Load the affected day plus the following week so the engine can account
    // for existing crew workload before placing moved visits.
    const start = `${eventDate}T00:00:00.000Z`;
    const end = new Date(
      new Date(start).getTime() + 8 * 24 * 60 * 60 * 1000
    ).toISOString();

    const provider = createSupabaseSchedulingProvider(supabase, companyId);
    const scheduleWindow = await provider.getAppointments(start, end);
    const eventAppointments = scheduleWindow.filter(
      (appointment) => appointment.scheduledDate?.slice(0, 10) === eventDate
    );
    const futureAppointments = scheduleWindow.filter(
      (appointment) => appointment.scheduledDate?.slice(0, 10) !== eventDate
    );

    const weather: WeatherEvent = {
      location: company.service_area ?? "Jacksonville",
      eventDate: `${eventDate}T00:00:00.000Z`,
      rainProbability: day.rainProbability,
      expectedInches: day.rainInches,
    };

    const proposal = buildRescheduleProposal(
      eventAppointments,
      weather,
      futureAppointments
    );
    proposal.companyId = companyId;

    return NextResponse.json({
      ok: true,
      proposal,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("RainShift reschedule error", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not generate proposal",
      },
      { status: 500 }
    );
  }
}
