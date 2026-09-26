const PAYPAL_BASE_URL =
  process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

export function getPayPalClientId() {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  if (!clientId) throw new Error("NEXT_PUBLIC_PAYPAL_CLIENT_ID is not configured");
  return clientId;
}

function getCredentials() {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("PayPal client credentials are not configured");
  }

  return { clientId, clientSecret };
}

export async function getPayPalAccessToken() {
  const { clientId, clientSecret } = getCredentials();
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`PayPal OAuth failed: ${details}`);
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

export async function paypalRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = await getPayPalAccessToken();

  const response = await fetch(`${PAYPAL_BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`PayPal API ${response.status}: ${details}`);
  }

  if (response.status === 204) return {} as T;
  return (await response.json()) as T;
}

export type PayPalSubscription = {
  id: string;
  status: string;
  plan_id: string;
  start_time?: string;
  subscriber?: {
    payer_id?: string;
    email_address?: string;
  };
  billing_info?: {
    next_billing_time?: string;
  };
};