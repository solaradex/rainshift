import { NextResponse } from "next/server";
import { getCurrentCompany } from "@/lib/auth/company";
import { getDailyRainForecast } from "@/lib/weather/open-meteo";

export async function POST() {
  try {
    const { supabase, userId, companyId } = await getCurrentCompany();

    if (!userId || !companyId) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("service_area,service_latitude,service_longitude,timezone")
      .eq("id", companyId)
      .maybeSingle();

    if (companyError) throw companyError;
    if (!company) {
      return NextResponse.json({ ok: false, error: "Company not found" }, { status: 404 });
    }

    // When a real Jobber schedule exists, weather should be evaluated against
    // the actual upcoming service date instead of the demo weather date.
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

    let eventDate: string;

    if (jobberAppointment?.scheduled_date) {
      eventDate = new Date(jobberAppointment.scheduled_date).toISOString().slice(0, 10);
    } else {
      const { data: weatherEvent, error: eventError } = await supabase
        .from("weather_events")
        .select("event_date")
        .eq("company_id", companyId)
        .order("event_date", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (eventError) throw eventError;
      if (!weatherEvent) {
        return NextResponse.json({ ok: false, error: "No weather event found" }, { status: 404 });
      }

      eventDate = new Date(weatherEvent.event_date).toISOString().slice(0, 10);
    }

    const nextDate = new Date(
      new Date(`${eventDate}T12:00:00Z`).getTime() + 24 * 60 * 60 * 1000
    )
      .toISOString()
      .slice(0, 10);

    const forecast = await getDailyRainForecast(
      Number(company.service_latitude),
      Number(company.service_longitude),
      eventDate,
      eventDate,
      company.timezone || "America/New_York"
    );

    const day = forecast.find((item) => item.date === eventDate);
    if (!day) {
      throw new Error(`No forecast returned for ${eventDate}`);
    }

    const severity =
      day.rainProbability >= 85 || day.rainInches >= 1.75
        ? "HIGH"
        : day.rainProbability >= 70 || day.rainInches >= 0.75
          ? "MEDIUM"
          : "LOW";

    const weatherId = `${companyId}-weather-${eventDate}`;

    const { error: upsertError } = await supabase
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

    if (upsertError) throw upsertError;

    return NextResponse.json({
      ok: true,
      location: company.service_area,
      eventDate,
      rainProbability: day.rainProbability,
      expectedInches: day.rainInches,
      severity,
      checkedAt: new Date().toISOString(),
      source: "Open-Meteo",
      nextForecastDate: nextDate,
    });
  } catch (error) {
    console.error("RainShift weather sync error", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Could not sync weather",
      },
      { status: 500 }
    );
  }
}
