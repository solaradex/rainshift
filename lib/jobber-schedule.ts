import type { SupabaseClient } from "@supabase/supabase-js";
import { editJobberAppointmentSchedule, refreshJobberAccessToken } from "./jobber";
import { decryptToken, encryptToken } from "./secure-token";

type JobberConnection = {
  id: string;
  encrypted_access_token: string | null;
  encrypted_refresh_token: string | null;
  active: boolean;
};

export async function rescheduleJobberAppointment(
  supabase: SupabaseClient,
  companyId: string,
  connection: JobberConnection,
  visitId: string,
  startAt: string,
  endAt: string,
  timezone: string
) {
  if (!connection.active || !connection.encrypted_access_token) {
    throw new Error("Jobber is not connected");
  }

  let accessToken = decryptToken(connection.encrypted_access_token);

  const run = (token: string) =>
    editJobberAppointmentSchedule(token, visitId, {
      startAt,
      endAt,
      timezone,
    });

  try {
    const result = await run(accessToken);
    const errors = result.appointmentEditSchedule.userErrors;
    if (errors.length) {
      throw new Error(
        `Jobber schedule update rejected: ${errors.map((e) => e.message).join("; ")}`
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const expired =
      message.includes("Access token expired") ||
      message.includes("[HTTP 401]");

    if (!expired || !connection.encrypted_refresh_token) throw error;

    const tokens = await refreshJobberAccessToken(
      decryptToken(connection.encrypted_refresh_token)
    );

    const { error: saveError } = await supabase
      .from("scheduling_connections")
      .update({
        encrypted_access_token: encryptToken(tokens.access_token),
        encrypted_refresh_token: encryptToken(tokens.refresh_token),
        access_token_expires_at: new Date(
          Date.now() + tokens.expires_in * 1000
        ).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id)
      .eq("company_id", companyId);

    if (saveError) throw saveError;

    accessToken = tokens.access_token;

    const result = await run(accessToken);
    const errors = result.appointmentEditSchedule.userErrors;

    if (errors.length) {
      throw new Error(
        `Jobber schedule update rejected: ${errors.map((e) => e.message).join("; ")}`
      );
    }
  }
}
