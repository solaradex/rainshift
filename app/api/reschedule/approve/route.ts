import { NextResponse } from "next/server";
import { getCurrentCompany } from "@/lib/auth/company";
import { rescheduleJobberAppointment } from "@/lib/jobber-schedule";
import { createSupabaseSchedulingProvider } from "@/lib/scheduling/supabase-provider";
import type { RescheduleProposal } from "@/lib/scheduling/types";

type ApprovalPayload = { proposal?: RescheduleProposal };

export async function POST(request: Request) {
  try {
    const { supabase, userId, companyId } = await getCurrentCompany();

    if (!userId || !companyId) {
      return NextResponse.json(
        { ok: false, error: "No RainShift company is attached to this account" },
        { status: 403 }
      );
    }

    const { proposal } = (await request.json()) as ApprovalPayload;

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

    if (reviews.length) {
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

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("timezone")
      .eq("id", companyId)
      .maybeSingle();

    if (companyError) throw companyError;

    const timezone = company?.timezone || "America/New_York";

    const { data: jobberConnection, error: connectionError } = await supabase
      .from("scheduling_connections")
      .select("id,encrypted_access_token,encrypted_refresh_token,active")
      .eq("company_id", companyId)
      .eq("provider", "jobber")
      .maybeSingle();

    if (connectionError) throw connectionError;

    const updatedAppointments: Array<{
      id: string;
      status: string;
      scheduledDate: string;
      externalId?: string;
    }> = [];

    for (const item of proposal.appointments) {
      if (item.status === "KEEP") {
        const updated = await provider.updateAppointment(item.id, {
          status: "KEEP",
          moveReason: null,
          approvedAt: new Date().toISOString(),
        });
        updatedAppointments.push(updated);
        continue;
      }

      if (item.status !== "MOVE") continue;
      if (!item.newDate) {
        return NextResponse.json(
          { ok: false, error: "Moved appointment is missing a new date: " + item.id },
          { status: 400 }
        );
      }

      const { data: record, error: recordError } = await supabase
        .from("appointments")
        .select("id,source_provider,external_id,scheduled_date,duration_minutes")
        .eq("id", item.id)
        .eq("company_id", companyId)
        .single();

      if (recordError) throw recordError;

      const currentStart = new Date(record.scheduled_date);
      const targetStart = new Date(item.newDate);

      if (Number.isNaN(currentStart.getTime()) || Number.isNaN(targetStart.getTime())) {
        return NextResponse.json(
          { ok: false, error: "Invalid appointment date for " + item.id },
          { status: 400 }
        );
      }

      targetStart.setUTCHours(
        currentStart.getUTCHours(),
        currentStart.getUTCMinutes(),
        currentStart.getUTCSeconds(),
        currentStart.getUTCMilliseconds()
      );

      const startAt = targetStart.toISOString();
      const endAt = new Date(
        targetStart.getTime() + Math.max(1, record.duration_minutes) * 60 * 1000
      ).toISOString();

      if (record.source_provider === "jobber") {
        if (!record.external_id) {
          return NextResponse.json(
            { ok: false, error: "Jobber visit is missing its external ID: " + item.id },
            { status: 409 }
          );
        }

        if (!jobberConnection) {
          return NextResponse.json(
            { ok: false, error: "Jobber is not connected" },
            { status: 404 }
          );
        }

        await rescheduleJobberAppointment(
          supabase,
          companyId,
          jobberConnection,
          record.external_id,
          startAt,
          endAt,
          timezone
        );
      }

      const updated = await provider.updateAppointment(item.id, {
        proposedDate: startAt,
        scheduledDate: startAt,
        status: "RESCHEDULED",
        moveReason: item.reason,
        approvedAt: new Date().toISOString(),
      });

      updatedAppointments.push({
        ...updated,
        externalId: record.external_id ?? undefined,
      });
    }

    return NextResponse.json({
      ok: true,
      simulated: false,
      updatedAppointments,
      message: "Reschedule approval persisted to RainShift and Jobber.",
    });
  } catch (error) {
    console.error("RainShift approval error", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not persist reschedule approval",
      },
      { status: 500 }
    );
  }
}
