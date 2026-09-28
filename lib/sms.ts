const TEXTBEE_API_URL = "https://api.textbee.dev/api/v1/gateway/send-sms";

function getTextbeeKey() {
  const apiKey = process.env.TEXTBEE_API_KEY;
  if (!apiKey) {
    throw new Error("TEXTBEE_API_KEY is not configured");
  }
  return apiKey;
}

function normalizePhone(phone: string) {
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
  textId: string;
  status: string;
  quotaRemaining?: number;
};

export async function sendSms({ to, body }: SendSmsInput): Promise<SendSmsResult> {
  const response = await fetch(TEXTBEE_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": getTextbeeKey(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      recipients: [normalizePhone(to)],
      message: body,
    }),
    cache: "no-store",
  });

  const raw = await response.text();
  let data: {
    batchId?: string;
    error?: string;
    message?: string;
  } = {};

  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    // Preserve a useful error even if Textbelt returns non-JSON.
  }

  if (!response.ok || !data.batchId) {
    throw new Error(
      `SMS delivery failed [${response.status}]: ${data.error || data.message || raw || "Textbee rejected the message"}`
    );
  }

  return {
    textId: data.batchId,
    status: "SENT",
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
