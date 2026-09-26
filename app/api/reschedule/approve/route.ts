import { NextResponse } from "next/server";
import type { RescheduleProposal } from "@/lib/scheduling/types";

type ApprovalPayload = {
  proposal?: RescheduleProposal;
};

export async function POST(request: Request) {
  const body = (await request.json()) as ApprovalPayload;

  if (!body.proposal || !Array.isArray(body.proposal.appointments)) {
    return NextResponse.json(
      { ok: false, error: "A valid reschedule proposal is required" },
      { status: 400 }
    );
  }

  const moves = body.proposal.appointments.filter((item) => item.status === "MOVE");

  return NextResponse.json({
    ok: true,
    simulated: true,
    updatedAppointments: moves.map((item) => ({
      id: item.id,
      newDay: item.newDay ?? null,
    })),
    message: "Approval accepted. Database writes and customer notifications are the next integration.",
  });
}
