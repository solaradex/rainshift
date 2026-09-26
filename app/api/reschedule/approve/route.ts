import { NextResponse } from "next/server";
import type { RescheduleProposal } from "@/lib/scheduling/types";

type ApprovalPayload = {
  proposal?: RescheduleProposal;
};

export async function POST(request: Request) {
  const body = (await request.json()) as ApprovalPayload;
  const proposal = body.proposal;

  if (!proposal || !Array.isArray(proposal.appointments)) {
    return NextResponse.json(
      { ok: false, error: "A valid reschedule proposal is required" },
      { status: 400 }
    );
  }

  const reviews = proposal.appointments.filter((item) => item.status === "REVIEW");

  if (reviews.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "Resolve all REVIEW appointments before approval",
        reviewAppointmentIds: reviews.map((item) => item.id),
      },
      { status: 409 }
    );
  }

  const moves = proposal.appointments.filter((item) => item.status === "MOVE");

  return NextResponse.json({
    ok: true,
    simulated: true,
    updatedAppointments: moves.map((item) => ({
      id: item.id,
      newDay: item.newDay ?? null,
    })),
    message:
      "Approval accepted. Database writes and customer notifications are the next integration.",
  });
}
