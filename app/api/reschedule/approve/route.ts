import { NextResponse } from "next/server";
import { getCurrentCompany } from "@/lib/auth/company";
import { createSupabaseSchedulingProvider } from "@/lib/scheduling/supabase-provider";
import type { RescheduleProposal } from "@/lib/scheduling/types";

type ApprovalPayload = {
  proposal?: RescheduleProposal;
};

export async function POST(request: Request) {
  try {
    const { supabase, userId, companyId } = await getCurrentCompany();

    if (!userId || !companyId) {
      return NextResponse.json(
        { ok: false, error: "No RainShift company is attached to this account" },
        { status: 403 }
      );
    }

    const body = (await request.json()) as ApprovalPayload;
    const proposal = body.proposal;

    if (!proposal || !Array.isArray(proposal.appointments)) {
      return NextResponse.json(
        { ok: false, error: "A valid reschedule proposal is required" },
        { status: 400 }
      );
    }

    if (proposal.companyId && proposal.companyId !== companyId) {
      return NextResponse.json(
        { ok: false, error: "Proposal company does not match the active company" },
        { status: 403 }
      );
    }

    const reviews = proposal.appointments.filter(
      (item) => item.status === "REVIEW"
    );

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

    const provider = createSupabaseSchedulingProvider(supabase, companyId);

    const updatedAppointments: Array<{
      id: string;
      status: string;
      scheduledDate: string;
    }> = [];

    for (const item of proposal.appointments) {
      if (item.status === "MOVE") {
        if (!item.newDate) {
          return NextResponse.json(
            {
              ok: false,
              error: "Moved appointment is missing a new date: " + item.id,
            },
            { status: 400 }
          );
        }

        const newDate = new Date(item.newDate);

        if (Number.isNaN(newDate.getTime())) {
          return NextResponse.json(
            { ok: false, error: "Invalid replacement date: " + item.id },
            { status: 400 }
          );
        }

        const updated = await provider.updateAppointment(item.id, {
          proposedDate: newDate.toISOString(),
          scheduledDate: newDate.toISOString(),
          status: "RESCHEDULED",
          moveReason: item.reason,
          approvedAt: new Date().toISOString(),
        });

        updatedAppointments.push(updated);
      }

      if (item.status === "KEEP") {
        const updated = await provider.updateAppointment(item.id, {
          status: "KEEP",
          moveReason: null,
          approvedAt: new Date().toISOString(),
        });

        updatedAppointments.push(updated);
      }
    }

    return NextResponse.json({
      ok: true,
      simulated: false,
      updatedAppointments,
      message: "Reschedule approval persisted to Supabase.",
    });
  } catch (error) {
    console.error("RainShift approval error", error);

    return NextResponse.json(
      { ok: false, error: "Could not persist reschedule approval" },
      { status: 500 }
    );
  }
}
