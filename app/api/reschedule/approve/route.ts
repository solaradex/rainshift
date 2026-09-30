import { NextResponse } from "next/server";
import { getCurrentCompany } from "@/lib/auth/company";
import { rescheduleJobberAppointment } from "@/lib/jobber-schedule";
import { createSupabaseSchedulingProvider } from "@/lib/scheduling/supabase-provider";
import { formatRescheduledDate, sendSms } from "@/lib/sms";
import type { RescheduleProposal } from "@/lib/scheduling/types";

type ApprovalPayload = { proposal?: RescheduleProposal };

type SmsResult = {
  appointmentId: string;
  customer: string;
  status: "QUEUED" | "SKIPPED" | "FAILED";
  sid?: string;
  reason?: string;
};

function buildCustomerSms(
  customerName: string,
  companyName: string,
  newDate: string,
  timezone: string
) {
  const firstName = customerName.trim().split(/\s+/)[0] || "Customer";
  const dateLabel = formatRescheduledDate(newDate, timezone);

  return `Hi ${firstName}, this is ${companyName}. Due to the weather forecast, your lawn service has been moved to ${dateLabel}. No action is needed. Reply to your usual lawn-care contact with questions. Reply STOP to opt out of future texts.`;
}

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

    const crewChanges = proposal.appointments.filter(
      (item) => item.status === "MOVE" && item.crewChangedFrom
    );

    if (crewChanges.length) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "This dispatch plan includes crew reassignments. Jobber crew reassignment is not yet supported by the connected mutation layer, so the plan must be reverted to the original crews before approval.",
          crewChangeAppointmentIds: crewChanges.map((item) => item.id),
        },
        { status: 409 }
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
      .select("name,timezone")
      .eq("id", companyId)
      .maybeSingle();

    if (companyError) throw companyError;

    const timezone = company?.timezone || "America/New_York";
    const companyName = company?.name || "your lawn-care provider";

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

    const smsResults: SmsResult[] = [];

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
        .select(
          "id,source_provider,external_id,customer_id,service,scheduled_date,duration_minutes"
        )
        .eq("id", item.id)
        .eq("company_id", companyId)
        .single();

      if (recordError) throw recordError;

      const { data: customer, error: customerError } = await supabase
        .from("customers")
        .select("name,phone")
        .eq("id", record.customer_id)
        .eq("company_id", companyId)
        .maybeSingle();

      if (customerError) throw customerError;

      const currentStart = new Date(record.scheduled_date);
      const targetStart = new Date(item.newDate);

      if (
        Number.isNaN(currentStart.getTime()) ||
        Number.isNaN(targetStart.getTime())
      ) {
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

      if (!customer?.phone) {
        smsResults.push({
          appointmentId: item.id,
          customer: customer?.name || "Customer",
          status: "SKIPPED",
          reason: "Customer has no phone number on file",
        });
        continue;
      }

      const dedupeKey = `customer-reschedule:${item.id}:${startAt}:${customer.phone}`;
      const { data: existingNotification, error: notificationLookupError } = await supabase
        .from("notification_logs")
        .select("id,status,provider_message_id")
        .eq("company_id", companyId)
        .eq("dedupe_key", dedupeKey)
        .maybeSingle();

      if (notificationLookupError) throw notificationLookupError;

      if (
        existingNotification?.status === "QUEUED" ||
        existingNotification?.status === "SENT"
      ) {
        smsResults.push({
          appointmentId: item.id,
          customer: customer.name,
          status: "QUEUED",
          sid: existingNotification.provider_message_id ?? undefined,
          reason: "Already queued for this appointment/date",
        });
        continue;
      }

      const { error: pendingNotificationError } = await supabase
        .from("notification_logs")
        .insert({
          company_id: companyId,
          appointment_id: item.id,
          channel: "sms",
          notification_type: "CUSTOMER_RESCHEDULE",
          destination: customer.phone,
          status: "PENDING",
          dedupe_key: dedupeKey,
          updated_at: new Date().toISOString(),
        });

      if (pendingNotificationError && pendingNotificationError.code !== "23505") {
        throw pendingNotificationError;
      }

      if (pendingNotificationError?.code === "23505") {
        const { data: duplicate } = await supabase
          .from("notification_logs")
          .select("status,provider_message_id")
          .eq("company_id", companyId)
          .eq("dedupe_key", dedupeKey)
          .maybeSingle();

        if (duplicate?.status === "QUEUED" || duplicate?.status === "SENT") {
          smsResults.push({
            appointmentId: item.id,
            customer: customer.name,
            status: "QUEUED",
            sid: duplicate.provider_message_id ?? undefined,
            reason: "Already queued for this appointment/date",
          });
          continue;
        }
      }

      try {
        const sms = await sendSms({
          to: customer.phone,
          body: buildCustomerSms(
            customer.name,
            companyName,
            startAt,
            timezone
          ),
        });

        await supabase
          .from("notification_logs")
          .update({
            status: "QUEUED",
            provider_message_id: sms.textId,
            error_message: null,
            updated_at: new Date().toISOString(),
          })
          .eq("company_id", companyId)
          .eq("dedupe_key", dedupeKey);

        smsResults.push({
          appointmentId: item.id,
          customer: customer.name,
          status: "QUEUED",
          sid: sms.textId,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("RainShift SMS error", { appointmentId: item.id, message });

        await supabase
          .from("notification_logs")
          .update({
            status: "FAILED",
            error_message: message,
            updated_at: new Date().toISOString(),
          })
          .eq("company_id", companyId)
          .eq("dedupe_key", dedupeKey);

        smsResults.push({
          appointmentId: item.id,
          customer: customer.name,
          status: "FAILED",
          reason: message,
        });
      }
    }

    const queued = smsResults.filter((item) => item.status === "QUEUED").length;
    const skipped = smsResults.filter((item) => item.status === "SKIPPED").length;
    const failed = smsResults.filter((item) => item.status === "FAILED").length;

    return NextResponse.json({
      ok: true,
      simulated: false,
      updatedAppointments,
      sms: {
        attempted: smsResults.length,
        queued,
        skipped,
        failed,
        results: smsResults,
      },
      message:
        failed > 0
          ? `Reschedule approved. ${queued} customer SMS message${queued === 1 ? "" : "s"} queued; ${failed} failed.`
          : `Reschedule approved. ${queued} customer SMS message${queued === 1 ? "" : "s"} queued for delivery.`,
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
