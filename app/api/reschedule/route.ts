import { NextResponse } from "next/server";
import { getCurrentCompany } from "@/lib/auth/company";
import { getDailyRainForecast } from "@/lib/weather/open-meteo";
import { buildRescheduleProposal } from "@/lib/scheduling/engine";
import { createSupabaseSchedulingProvider } from "@/lib/scheduling/supabase-provider";
import type { WeatherEvent } from "@/lib/scheduling/types";

function dateKeyInTimezone(value: string | Date, timeZone: string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day ? year + "-" + month + "-" + day : "";
}

export async function POST() {
  try {
    const { supabase, userId, companyId } = await getCurrentCompany();

    if (!userId || !companyId) {
      return NextResponse.json(
        { ok: false, error: "No RainShift company is attached to this account" },
        { status: 403 }
      );
    }

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

    const timeZone = company.timezone || "America/New_York";
    const todayKey = dateKeyInTimezone(new Date(), timeZone);

    // Look back far enough to include appointments that already started today.
    // UTC midnight can already be tomorrow in the company local timezone late in the evening.
    const scheduleLookupStart = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
    const scheduleLookupEnd = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000).toISOString();

    const { data: jobberAppointments, error: jobberError } = await supabase
      .from("appointments")
      .select("scheduled_date")
      .eq("company_id", companyId)
      .eq("source_provider", "jobber")
      .in("status", ["SCHEDULED", "KEEP", "MOVE", "REVIEW", "RESCHEDULED"])
      .gte("scheduled_date", scheduleLookupStart)
      .lt("scheduled_date", scheduleLookupEnd)
      .order("scheduled_date", { ascending: true });

    if (jobberError) throw jobberError;

    const todayAppointment = (jobberAppointments ?? []).find(
      (appointment) =>
        appointment.scheduled_date &&
        dateKeyInTimezone(appointment.scheduled_date, timeZone) === todayKey
    );

    const nextFutureAppointment = (jobberAppointments ?? []).find(
      (appointment) =>
        appointment.scheduled_date &&
        dateKeyInTimezone(appointment.scheduled_date, timeZone) > todayKey
    );

    const eventDate = todayAppointment?.scheduled_date
      ? dateKeyInTimezone(todayAppointment.scheduled_date, timeZone)
      : nextFutureAppointment?.scheduled_date
        ? dateKeyInTimezone(nextFutureAppointment.scheduled_date, timeZone)
        : "";

    if (!eventDate) {
      return NextResponse.json(
        { ok: false, error: "No real Jobber appointments are synced yet" },
        { status: 404 }
      );
    }

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
      (appointment) =>
        appointment.scheduledDate &&
        dateKeyInTimezone(appointment.scheduledDate, timeZone) === eventDate
    );
    const futureAppointments = scheduleWindow.filter(
      (appointment) =>
        appointment.scheduledDate &&
        dateKeyInTimezone(appointment.scheduledDate, timeZone) > eventDate
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
