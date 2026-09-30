const JOBBER_API_URL = "https://api.getjobber.com/api/graphql";
const JOBBER_TOKEN_URL = "https://api.getjobber.com/api/oauth/token";
const JOBBER_API_VERSION =
  process.env.JOBBER_API_VERSION || "2026-05-12";

export type JobberTokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
};

export type JobberAccount = {
  id: string;
  name: string;
};

export async function exchangeJobberCode(
  code: string,
  redirectUri: string,
  codeVerifier: string
) {
  const clientId = process.env.JOBBER_CLIENT_ID;
  const clientSecret = process.env.JOBBER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Jobber OAuth credentials are not configured");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const response = await fetch(JOBBER_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Jobber token exchange failed [${response.status}]: ${await response.text()}`);
  }

  return (await response.json()) as JobberTokenResponse;
}

export async function refreshJobberAccessToken(refreshToken: string) {
  const clientId = process.env.JOBBER_CLIENT_ID;
  const clientSecret = process.env.JOBBER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Jobber OAuth credentials are not configured");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch(JOBBER_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Jobber token refresh failed [${response.status}]: ${await response.text()}`);
  }

  return (await response.json()) as JobberTokenResponse;
}

export async function jobberGraphQL<T>(
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>
) {
  const response = await fetch(JOBBER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-JOBBER-GRAPHQL-VERSION": JOBBER_API_VERSION,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  const rawBody = await response.text();
  let result: { data?: T; errors?: Array<{ message: string }> } = {};

  try {
    result = JSON.parse(rawBody) as typeof result;
  } catch {
    // Keep the raw response for diagnostics when Jobber does not return JSON.
  }

  if (!response.ok || result.errors?.length) {
    const graphqlErrors =
      result.errors?.map((item) => item.message).join("; ") || rawBody || response.statusText;
    throw new Error(
      `Jobber GraphQL request failed [HTTP ${response.status}] [API ${JOBBER_API_VERSION}]: ${graphqlErrors}`
    );
  }

  if (!result.data) throw new Error("Jobber returned no data");
  return result.data;
}

export async function getJobberAccount(accessToken: string) {
  return jobberGraphQL<{ account: JobberAccount }>(
    accessToken,
    `query GetAccount {
      account { id name }
    }`
  );
}

export async function editJobberAppointmentAssignment(
  accessToken: string,
  appointmentId: string,
  assignedUserIds: string[]
) {
  return jobberGraphQL<{
    appointmentEditAssignment: {
      userErrors: Array<{ message: string; path?: string[] }>;
    };
  }>(
    accessToken,
    `mutation EditAppointmentAssignment(
      $appointmentId: EncodedId!
      $input: AppointmentEditAssignmentInput!
    ) {
      appointmentEditAssignment(
        appointmentId: $appointmentId
        input: $input
      ) {
        userErrors {
          message
          path
        }
      }
    }`,
    {
      appointmentId,
      input: { assignedUserIds },
    }
  );
}


export async function editJobberAppointmentSchedule(
  accessToken: string,
  appointmentId: string,
  schedule: {
    startAt: string;
    endAt: string;
    timezone: string;
  }
) {
  return jobberGraphQL<{
    appointmentEditSchedule: {
      userErrors: Array<{ message: string; path?: string[] }>;
    };
  }>(
    accessToken,
    `mutation EditAppointmentSchedule(
      $appointmentId: EncodedId!
      $input: AppointmentEditScheduleInput!
    ) {
      appointmentEditSchedule(
        appointmentId: $appointmentId
        input: $input
      ) {
        userErrors {
          message
          path
        }
      }
    }`,
    {
      appointmentId,
      input: {
        schedule,
      },
    }
  );
}
