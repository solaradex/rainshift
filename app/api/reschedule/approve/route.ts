import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { RescheduleProposal } from "@/lib/scheduling/types";

type ApprovalPayload = {
  proposal?: RescheduleProposal;
};

const DEMO_COMPANY_ID = process.env.RAINSHIFT_COMPANY_ID ?? "demo-company";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ApprovalPayload;
    const proposal = body.proposal;

    if (!proposal || !Array.isArray(proposal.appointments)) {
      return NextResponse.json(
        { ok: false, error: "A valid reschedule proposal is required" },
        { status: 400 }
      );
    }

    if (proposal.companyId && proposal.companyId !== DEMO_COMPANY_ID) {
      return NextResponse.json(
        { ok: false, error: "Proposal company does not match the active company" },
        { status: 403 }
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

    const moves = proposal.appointments.filter(
      (item) => item.status === "MOVE" && item.newDate
    );

    const result = await prisma.$transaction(async (tx) => {
      const updated: string[] = [];

      for (const move of moves) {
        const existing = await tx.appointment.findFirst({
          where: {
            id: move.id,
            companyId: DEMO_COMPANY_ID,
          },
        });

        if (!existing) {
          throw new Error("Appointment not found: " + move.id);
        }

        await tx.appointment.update({
          where: { id: existing.id },
          data: {
            proposedDate: new Date(move.newDate as string),
            scheduledDate: new Date(move.newDate as string),
            status: "RESCHEDULED",
            moveReason: move.reason,
            approvedAt: new Date(),
          },
        });

        updated.push(existing.id);
      }

      return { updated };
    });

    return NextResponse.json({
      ok: true,
      simulated: false,
      updatedAppointments: result.updated,
      message: "Reschedule approved and persisted to Postgres.",
    });
  } catch (error) {
    console.error("RainShift approval error", error);
    return NextResponse.json(
      { ok: false, error: "Could not persist reschedule approval" },
      { status: 500 }
    );
  }
}
