const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";

function getTwilioAuth() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const apiKey = process.env.TWILIO_API_KEY;
  const apiSecret = process.env.TWILIO_API_SECRET;

  if (!accountSid) {
    throw new Error("TWILIO_ACCOUNT_SID is not configured");
  }

  if (apiKey && apiSecret) {
    return {
      accountSid,
      username: apiKey,
      password: apiSecret,
    };
  }

  if (authToken) {
    return {
      accountSid,
      username: accountSid,
      password: authToken,
    };
  }

  throw new Error(
    "Twilio credentials are not configured. Set TWILIO_AUTH_TOKEN or TWILIO_API_KEY/TWILIO_API_SECRET."
  );
}

function toE164(phone: string) {
  const trimmed = phone.trim();
  if (trimmed.startsWith("+")) {
    const normalized = "+" + trimmed.slice(1).replace(/\D/g, "");
    if (/^\+\d{8,15}$/.test(normalized)) return normalized;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits.startsWith("1")) return "+" + digits;

  throw new Error("Customer phone number is not a valid E.164 or US phone number");
}

export type SendSmsInput = {
  to: string;
  body: string;
};

export type SendSmsResult = {
  sid: string;
  status: string;
};

export async function sendSms({ to, body }: SendSmsInput): Promise<SendSmsResult> {
  const { accountSid, username, password } = getTwilioAuth();
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const from = process.env.TWILIO_FROM_PHONE_NUMBER;

  if (!messagingServiceSid && !from) {
    throw new Error(
      "Twilio sender is not configured. Set TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_PHONE_NUMBER."
    );
  }

  const form = new URLSearchParams({
    To: toE164(to),
    Body: body,
  });

  if (messagingServiceSid) {
    form.set("MessagingServiceSid", messagingServiceSid);
  } else {
    form.set("From", toE164(from!));
  }

  const response = await fetch(
    `${TWILIO_API_BASE}/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(`${username}:${password}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: form,
      cache: "no-store",
    }
  );

  const raw = await response.text();
  let data: { sid?: string; status?: string; message?: string; code?: number } = {};

  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    // Preserve a useful error even if Twilio returns non-JSON.
  }

  if (!response.ok || !data.sid) {
    const detail =
      data.message ||
      raw ||
      `Twilio returned HTTP ${response.status}`;
    throw new Error(`Twilio SMS failed [${response.status}]: ${detail}`);
  }

  return {
    sid: data.sid,
    status: data.status || "queued",
  };
}

export function formatRescheduledDate(date: string, timezone: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "your new service date";

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: timezone,
  }).format(parsed);
}
