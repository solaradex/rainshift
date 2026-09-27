import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshJobberAccessToken } from "./jobber";
import { decryptToken, encryptToken } from "./secure-token";

type StoredConnection = {
  id: string;
  encrypted_access_token: string | null;
  encrypted_refresh_token: string | null;
  access_token_expires_at?: string | null;
  active: boolean;
};

export async function getJobberAccessToken(
  supabase: SupabaseClient,
  companyId: string,
  connection: StoredConnection,
  forceRefresh = false
) {
  if (!connection.active || !connection.encrypted_access_token) {
    throw new Error("Jobber is not connected");
  }

  if (!forceRefresh) {
    const expiresAt = connection.access_token_expires_at
      ? new Date(connection.access_token_expires_at).getTime()
      : 0;

    if (expiresAt > Date.now() + 30_000) {
      return decryptToken(connection.encrypted_access_token);
    }
  }

  if (!connection.encrypted_refresh_token) {
    throw new Error("Jobber authorization has expired. Reconnect Jobber.");
  }

  try {
    const tokens = await refreshJobberAccessToken(
      decryptToken(connection.encrypted_refresh_token)
    );

    const { data: saved, error: saveError } = await supabase
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
      .eq("company_id", companyId)
      .eq("encrypted_access_token", connection.encrypted_access_token)
      .select("encrypted_access_token")
      .maybeSingle();

    if (saveError) throw saveError;

    // Another request may have rotated the token first. In that case reload
    // the newest stored token instead of trying to use the invalid old refresh token.
    if (!saved) {
      const { data: latest, error: latestError } = await supabase
        .from("scheduling_connections")
        .select("encrypted_access_token,active")
        .eq("id", connection.id)
        .eq("company_id", companyId)
        .maybeSingle();

      if (latestError) throw latestError;
      if (!latest?.active || !latest.encrypted_access_token) {
        throw new Error("Jobber authorization has expired. Reconnect Jobber.");
      }

      return decryptToken(latest.encrypted_access_token);
    }

    return tokens.access_token;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("provided refresh token is not valid")) {
      const { data: latest } = await supabase
        .from("scheduling_connections")
        .select("encrypted_access_token,encrypted_refresh_token,active")
        .eq("id", connection.id)
        .eq("company_id", companyId)
        .maybeSingle();

      // If another request already rotated the token, use the new one.
      if (
        latest?.active &&
        latest.encrypted_access_token &&
        latest.encrypted_refresh_token &&
        latest.encrypted_refresh_token !== connection.encrypted_refresh_token
      ) {
        return decryptToken(latest.encrypted_access_token);
      }

      throw new Error("Jobber authorization has expired. Reconnect Jobber.");
    }

    throw error;
  }
}
