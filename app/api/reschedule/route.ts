import { NextResponse } from "next/server";
import { demoAppointments, demoWeather } from "@/lib/demo-data";
import { buildRescheduleProposal } from "@/lib/scheduling/engine";

export async function POST() {
  const proposal = buildRescheduleProposal(demoAppointments, demoWeather);

  return NextResponse.json({
    ok: true,
    proposal,
    generatedAt: new Date().toISOString(),
  });
}
