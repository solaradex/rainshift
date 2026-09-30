import type { SupabaseClient } from "@supabase/supabase-js";
import {
  editJobberAppointmentAssignment,
  editJobberAppointmentSchedule,
} from "./jobber";
import { getJobberAccessToken } from "./jobber-tokens";

type JobberConnection = {
  id: string;
  encrypted_access_token: string | null;
  encrypted_refresh_token: string | null;
  access_token_expires_at?: string | null;
  active: boolean;
};

export async function reassignJobberAppointment(
  supabase: SupabaseClient,
  companyId: string,
  connection: JobberConnection,
  visitId: string,
  assignedUserIds: string[]
) {
  let accessToken = await getJobberAccessToken(
    supabase,
    companyId,
    connection
  );

  const execute = (token: string) =>
    editJobberAppointmentAssignment(token, visitId, assignedUserIds);

  try {
    const result = await execute(accessToken);
    const errors = result.appointmentEditAssignment.userErrors;

    if (errors.length) {
      throw new Error(
        `Jobber assignment update rejected: ${errors.map((e) => e.message).join("; ")}`
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("[HTTP 401]") && !message.includes("Access token expired")) {
      throw error;
    }

    accessToken = await getJobberAccessToken(
      supabase,
      companyId,
      connection,
      true
    );

    const result = await execute(accessToken);
    const errors = result.appointmentEditAssignment.userErrors;

    if (errors.length) {
      throw new Error(
        `Jobber assignment update rejected: ${errors.map((e) => e.message).join("; ")}`
      );
    }
  }
}

export async function rescheduleJobberAppointment(
  supabase: SupabaseClient,
  companyId: string,
  connection: JobberConnection,
  visitId: string,
  startAt: string,
  endAt: string,
  timezone: string
) {
  let accessToken = await getJobberAccessToken(
    supabase,
    companyId,
    connection
  );

  const execute = (token: string) =>
    editJobberAppointmentSchedule(token, visitId, {
      startAt,
      endAt,
      timezone,
    });

  try {
    const result = await execute(accessToken);
    const errors = result.appointmentEditSchedule.userErrors;

    if (errors.length) {
      throw new Error(
        `Jobber schedule update rejected: ${errors.map((e) => e.message).join("; ")}`
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("[HTTP 401]") && !message.includes("Access token expired")) {
      throw error;
    }

    accessToken = await getJobberAccessToken(
      supabase,
      companyId,
      connection,
      true
    );

    const result = await execute(accessToken);
    const errors = result.appointmentEditSchedule.userErrors;

    if (errors.length) {
      throw new Error(
        `Jobber schedule update rejected: ${errors.map((e) => e.message).join("; ")}`
      );
    }
  }
}
