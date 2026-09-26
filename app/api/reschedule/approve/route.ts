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

    const result = await prisma.$transaction(async (tx) => {
      const updated: Array<{ id: string; status: string; scheduledDate: string }> = [];

      for (const item of proposal.appointments) {
        const existing = await tx.appointment.findFirst({
          where: {
            id: item.id,
            companyId: DEMO_COMPANY_ID,
          },
        });

        if (!existing) {
          throw new Error("Appointment not found: " + item.id);
        }

        if (item.status === "MOVE") {
          if (!item.newDate) {
            throw new Error("Moved appointment is missing a new date: " + item.id);
          }

          const newDate = new Date(item.newDate);

          if (Number.isNaN(newDate.getTime())) {
            throw new Error("Invalid replacement date: " + item.id);
          }

          await tx.appointment.update({
            where: { id: existing.id },
            data: {
              proposedDate: newDate,
              scheduledDate: newDate,
              status: "RESCHEDULED",
              moveReason: item.reason,
              approvedAt: new Date(),
            },
          });

          updated.push({
            id: existing.id,
            status: "RESCHEDULED",
            scheduledDate: newDate.toISOString(),
          });
        } else if (item.status === "KEEP") {
          await tx.appointment.update({
            where: { id: existing.id },
            data: {
              status: "KEEP",
              moveReason: null,
              approvedAt: new Date(),
            },
          });

          updated.push({
            id: existing.id,
            status: "KEEP",
            scheduledDate: existing.scheduledDate.toISOString(),
          });
        }
      }

      return { updated };
    });

    return NextResponse.json({
      ok: true,
      simulated: false,
      updatedAppointments: result.updated,
      message: "Reschedule approval persisted to Postgres.",
    });
  } catch (error) {
    console.error("RainShift approval error", error);
    return NextResponse.json(
      { ok: false, error: "Could not persist reschedule approval" },
      { status: 500 }
    );
  }
}
