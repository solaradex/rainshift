import { NextResponse } from "next/server";
import { getCurrentCompany } from "@/lib/auth/company";
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

        const { data, error } = await supabase
          .from("appointments")
          .update({
            proposed_date: newDate.toISOString(),
            scheduled_date: newDate.toISOString(),
            status: "RESCHEDULED",
            move_reason: item.reason,
            approved_at: new Date().toISOString(),
          })
          .eq("id", item.id)
          .eq("company_id", companyId)
          .select("id,status,scheduled_date")
          .single();

        if (error) throw error;

        updatedAppointments.push({
          id: data.id,
          status: data.status,
          scheduledDate: data.scheduled_date,
        });
      }

      if (item.status === "KEEP") {
        const { data, error } = await supabase
          .from("appointments")
          .update({
            status: "KEEP",
            move_reason: null,
            approved_at: new Date().toISOString(),
          })
          .eq("id", item.id)
          .eq("company_id", companyId)
          .select("id,status,scheduled_date")
          .single();

        if (error) throw error;

        updatedAppointments.push({
          id: data.id,
          status: data.status,
          scheduledDate: data.scheduled_date,
        });
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
