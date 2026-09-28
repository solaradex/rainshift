import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDailyRainForecast } from "@/lib/weather/open-meteo";

function dateInZone(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = createAdminClient();
    const { data: links, error: linkError } = await db
      .from("scheduling_connections")
      .select("company_id")
      .eq("provider", "jobber")
      .eq("active", true);

    if (linkError) throw linkError;

    let checked = 0;
    let updated = 0;

    for (const link of links ?? []) {
      const { data: company, error: companyError } = await db
        .from("companies")
        .select("service_area,service_latitude,service_longitude,timezone")
        .eq("id", link.company_id)
        .maybeSingle();

      if (companyError) throw companyError;
      if (!company?.service_latitude || !company?.service_longitude) continue;

      const timezone = company.timezone || "America/New_York";
      const { data: appointments, error: appointmentError } = await db
        .from("appointments")
        .select("scheduled_date")
        .eq("company_id", link.company_id)
        .eq("source_provider", "jobber")
        .in("status", ["SCHEDULED", "KEEP", "MOVE", "REVIEW"])
        .order("scheduled_date", { ascending: true })
        .limit(50);

      if (appointmentError) throw appointmentError;

      const dates = [...new Set((appointments ?? []).map((a) => dateInZone(a.scheduled_date, timezone)))].slice(0, 3);

      for (const eventDate of dates) {
        const forecast = await getDailyRainForecast(
          Number(company.service_latitude),
          Number(company.service_longitude),
          eventDate,
          eventDate,
          timezone
        );
        const day = forecast.find((item) => item.date === eventDate);
        if (!day) continue;

        const level =
          day.rainProbability >= 85 || day.rainInches >= 1.75
            ? "HIGH"
            : day.rainProbability >= 70 || day.rainInches >= 0.75
              ? "MEDIUM"
              : "LOW";

        const { error } = await db.from("weather_events").upsert(
          {
            id: `${link.company_id}-weather-${eventDate}`,
            company_id: link.company_id,
            event_date: `${eventDate}T00:00:00.000Z`,
            rain_probability: day.rainProbability,
            expected_inches: day.rainInches,
            severity: level,
            location: company.service_area,
            weather_source: "open-meteo",
            checked_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );
        if (error) throw error;
        updated += 1;
      }

      checked += 1;
    }

    return NextResponse.json({ ok: true, companiesChecked: checked, weatherEventsUpdated: updated });
  } catch (error) {
    console.error("RainShift cron error", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Cron failed" },
      { status: 500 }
    );
  }
}
