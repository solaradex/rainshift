import { NextResponse } from "next/server";
import { getCurrentCompany } from "@/lib/auth/company";

export async function POST(request: Request) {
  try {
    const { supabase, userId, companyId: existingCompanyId } =
      await getCurrentCompany();

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    if (existingCompanyId) {
      return NextResponse.json({
        ok: true,
        companyId: existingCompanyId,
        created: false,
      });
    }

    const body = (await request.json().catch(() => ({}))) as {
      companyName?: string;
    };

    const { data: authUser } = await supabase.auth.getUser();
    const companyId = "company-" + userId;

    const companyName =
      body.companyName?.trim() ||
      authUser.user?.user_metadata?.company_name ||
      "My Landscape Company";

    const { error: companyError } = await supabase
      .from("companies")
      .insert({
        id: companyId,
        name: companyName,
        timezone: "America/New_York",
        owner_user_id: userId,
      });

    if (companyError && companyError.code !== "23505") {
      throw companyError;
    }

    const { error: memberError } = await supabase
      .from("company_members")
      .upsert(
        {
          company_id: companyId,
          user_id: userId,
          role: "owner",
        },
        { onConflict: "company_id,user_id" }
      );

    if (memberError) throw memberError;

    const crewIds = ["a", "b", "c"].map(
      (key) => companyId + "-crew-" + key
    );

    const customerIds = ["101", "102", "103", "104", "105"].map(
      (id) => companyId + "-customer-" + id
    );

    const { error: crewError } = await supabase
      .from("crews")
      .upsert(
        [
          {
            id: crewIds[0],
            company_id: companyId,
            name: "Crew A",
            daily_capacity: 480,
          },
          {
            id: crewIds[1],
            company_id: companyId,
            name: "Crew B",
            daily_capacity: 480,
          },
          {
            id: crewIds[2],
            company_id: companyId,
            name: "Crew C",
            daily_capacity: 480,
          },
        ],
        { onConflict: "id" }
      );

    if (crewError) throw crewError;

    const customers = [
      ["101", "Mason Family", "128 River Oak Dr", ["Thu", "Fri"]],
      ["102", "Harper Residence", "214 Pine Ridge Ln", ["Thu"]],
      ["103", "Oak & Co.", "44 Oak St", ["Fri", "Sat"]],
      ["104", "Bennett Home", "901 Magnolia Ave", ["Fri"]],
      ["105", "Northside Rentals", "63 Westside Blvd", ["Thu", "Sat"]],
    ].map(([id, name, address, preferred]) => ({
      id: companyId + "-customer-" + id,
      company_id: companyId,
      name: name as string,
      address: address as string,
      preferred_days: preferred as string[],
    }));

    const { error: customerError } = await supabase
      .from("customers")
      .upsert(customers, { onConflict: "id" });

    if (customerError) throw customerError;

    const eventDate = new Date("2026-09-28T00:00:00.000Z");

    const { error: weatherError } = await supabase
      .from("weather_events")
      .upsert(
        {
          id: companyId + "-weather-2026-09-28",
          company_id: companyId,
          event_date: eventDate.toISOString(),
          rain_probability: 82,
          expected_inches: 1.4,
          location: "Jacksonville, FL",
          severity: "HIGH",
          weather_source: "open-meteo",
        },
        { onConflict: "id" }
      );

    if (weatherError) throw weatherError;

    const appointments = [
      ["101", "a", "Weekly Mow", 45],
      ["102", "a", "Mow + Edge", 60],
      ["103", "b", "Landscape Bed", 90],
      ["104", "b", "Weekly Mow", 45],
      ["105", "c", "Cleanup", 120],
    ].map(([id, crew, service, duration]) => ({
      id: companyId + "-A-" + id,
      company_id: companyId,
      customer_id: companyId + "-customer-" + id,
      crew_id: companyId + "-crew-" + crew,
      service: service as string,
      scheduled_date: eventDate.toISOString(),
      duration_minutes: duration as number,
      status: "SCHEDULED",
    }));

    const { error: appointmentError } = await supabase
      .from("appointments")
      .upsert(appointments, { onConflict: "id" });

    if (appointmentError) throw appointmentError;

    const { data: existingBilling, error: billingLookupError } = await supabase
      .from("billing_accounts")
      .select("id")
      .eq("company_id", companyId)
      .maybeSingle();

    if (billingLookupError) throw billingLookupError;

    if (!existingBilling) {
      const { error: billingError } = await supabase
        .from("billing_accounts")
        .insert({
          id: companyId + "-billing",
          company_id: companyId,
          plan: "starter",
          status: "INCOMPLETE",
        });

      if (billingError && billingError.code !== "23505") {
        throw billingError;
      }
    }

    return NextResponse.json({
      ok: true,
      companyId,
      created: true,
      trialEndsAt: null,
    });
  } catch (error) {
    console.error("RainShift onboarding error", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Could not create your RainShift workspace",
      },
      { status: 500 }
    );
  }
}
