import { NextResponse } from "next/server";
import { buildRescheduleProposal } from "@/lib/scheduling/engine";
import type { DemoAppointment, WeatherEvent } from "@/lib/scheduling/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDailyRainForecast } from "@/lib/weather/open-meteo";
import { sendSms } from "@/lib/sms";

function dateInZone(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function severity(probability: number, inches: number) {
  if (probability >= 85 || inches >= 1.75) return "HIGH" as const;
  if (probability >= 70 || inches >= 0.75) return "MEDIUM" as const;
  return "LOW" as const;
}

function buildOperatorAlert(
  location: string,
  eventDate: string,
  probability: number,
  inches: number,
  move: number,
  review: number
) {
  return [
    `RainShift weather alert: ${location}`,
    `${eventDate} • ${probability}% rain • ${inches}" expected`,
    `${move} MOVE • ${review} REVIEW`,
    `Open RainShift to review and approve changes.`,
  ].join(" ");
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
    let alerts = 0;
    const errors: Array<{ companyId: string; error: string }> = [];

    for (const link of links ?? []) {
      try {
        const syncUrl = new URL("/api/integrations/jobber/sync", request.url);
        syncUrl.searchParams.set("companyId", link.company_id);

        const syncResponse = await fetch(syncUrl, {
          method: "POST",
          headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
          cache: "no-store",
        });

        if (!syncResponse.ok) {
          throw new Error(`Jobber sync failed with HTTP ${syncResponse.status}`);
        }

        const { data: company, error: companyError } = await db
          .from("companies")
          .select("name,notification_phone,service_area,service_latitude,service_longitude,timezone")
          .eq("id", link.company_id)
          .maybeSingle();

        if (companyError) throw companyError;
        if (company?.service_latitude == null || company.service_longitude == null) continue;

        const timezone = company.timezone || "America/New_York";
        const { data: rows, error: appointmentError } = await db
          .from("appointments")
          .select("id,service,duration_minutes,scheduled_date,customer_id,crew_id,customers(name,address,preferred_days),crews(name)")
          .eq("company_id", link.company_id)
          .eq("source_provider", "jobber")
          .in("status", ["SCHEDULED", "KEEP", "MOVE", "REVIEW"])
          .order("scheduled_date", { ascending: true })
          .limit(100);

        if (appointmentError) throw appointmentError;

        const dates = [
          ...new Set((rows ?? []).map((row) => dateInZone(row.scheduled_date, timezone))),
        ].slice(0, 3);

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

          const level = severity(day.rainProbability, day.rainInches);
          const dayRows = (rows ?? []).filter(
            (row) => dateInZone(row.scheduled_date, timezone) === eventDate
          );

          const appointments: DemoAppointment[] = dayRows.map((row) => {
            const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
            const crew = Array.isArray(row.crews) ? row.crews[0] : row.crews;

            return {
              id: row.id,
              customer: customer?.name || "Customer",
              address: customer?.address || "Jobber property",
              crew: crew?.name || "Jobber Unassigned",
              service: row.service,
              duration: row.duration_minutes,
              distance: 0,
              preferredDay: customer?.preferred_days?.[0] || "Thu",
            };
          });

          const weather: WeatherEvent = {
            location: company.service_area || "Service area",
            eventDate: `${eventDate}T00:00:00.000Z`,
            rainProbability: day.rainProbability,
            expectedInches: day.rainInches,
          };

          const proposal = buildRescheduleProposal(appointments, weather);
          const needsAttention = level !== "LOW" && (proposal.counts.move > 0 || proposal.counts.review > 0);
          const signature = `${level}:${day.rainProbability}:${day.rainInches}:${proposal.counts.move}:${proposal.counts.review}`;

          const { data: existing, error: existingError } = await db
            .from("weather_events")
            .select("weather_alert_signature")
            .eq("id", `${link.company_id}-weather-${eventDate}`)
            .maybeSingle();

          if (existingError) throw existingError;

          const { error: upsertError } = await db
            .from("weather_events")
            .upsert(
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
                weather_alert_signature: needsAttention
                  ? existing?.weather_alert_signature || null
                  : null,
              },
              { onConflict: "id" }
            );

          if (upsertError) throw upsertError;
          updated += 1;

          if (needsAttention && existing?.weather_alert_signature !== signature) {
            const phone =
              company.notification_phone ||
              process.env.TEXTBEE_ALERT_TO_NUMBER ||
              process.env.TEXTBEE_TEST_TO_NUMBER;

            if (phone) {
              await sendSms({
                to: phone,
                body: buildOperatorAlert(
                  company.service_area || company.name || "your service area",
                  eventDate,
                  day.rainProbability,
                  day.rainInches,
                  proposal.counts.move,
                  proposal.counts.review
                ),
              });

              await db
                .from("weather_events")
.update({
                  weather_alert_sent_at: new Date().toISOString(),
                  weather_alert_signature: signature,
                })
                .eq("id", `${link.company_id}-weather-${eventDate}`);

              alerts += 1;
            } else {
              console.warn("RainShift weather alert skipped: no operator phone", {
                companyId: link.company_id,
                eventDate,
              });
            }
          }
        }

        checked += 1;
      } catch (error) {
        errors.push({
          companyId: link.company_id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      companiesChecked: checked,
      weatherEventsUpdated: updated,
      alertsSent: alerts,
      errors,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("RainShift cron error", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Cron failed" },
      { status: 500 }
    );
  }
}
