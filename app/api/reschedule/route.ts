import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildRescheduleProposal } from "@/lib/scheduling/engine";
import type { DemoAppointment, WeatherEvent } from "@/lib/scheduling/types";

const DEMO_COMPANY_ID = process.env.RAINSHIFT_COMPANY_ID ?? "demo-company";

export async function POST() {
  try {
    const weatherRecord = await prisma.weatherEvent.findFirst({
      where: { companyId: DEMO_COMPANY_ID },
      orderBy: { eventDate: "asc" },
    });

    if (!weatherRecord) {
      return NextResponse.json(
        { ok: false, error: "No weather event found for this company" },
        { status: 404 }
      );
    }

    const nextDay = new Date(weatherRecord.eventDate.getTime() + 24 * 60 * 60 * 1000);

    const records = await prisma.appointment.findMany({
      where: {
        companyId: DEMO_COMPANY_ID,
        scheduledDate: {
          gte: weatherRecord.eventDate,
          lt: nextDay,
        },
        status: {
          in: ["SCHEDULED", "KEEP", "MOVE", "REVIEW"],
        },
      },
      include: {
        customer: true,
        crew: true,
      },
      orderBy: [
        { crewId: "asc" },
        { scheduledDate: "asc" },
      ],
    });

    const weather: WeatherEvent = {
      location: "Jacksonville",
      eventDate: weatherRecord.eventDate.toISOString(),
      rainProbability: weatherRecord.rainProbability,
      expectedInches: weatherRecord.expectedInches,
    };

    const appointments: DemoAppointment[] = records.map((record) => ({
      id: record.id,
      customer: record.customer.name,
      address: record.customer.address,
      crew: record.crew.name,
      service: record.service,
      duration: record.durationMinutes,
      distance: 0,
      preferredDay: record.customer.preferredDays[0]?.slice(0, 3) ?? "Thu",
    }));

    const proposal = buildRescheduleProposal(appointments, weather);
    proposal.companyId = DEMO_COMPANY_ID;

    return NextResponse.json({
      ok: true,
      proposal,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("RainShift reschedule error", error);
    return NextResponse.json(
      { ok: false, error: "Database unavailable or misconfigured" },
      { status: 500 }
    );
  }
}
