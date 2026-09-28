const TEXTBELT_API_URL = "https://textbelt.com/text";

function getTextbeltKey() {
  return process.env.TEXTBELT_API_KEY || "textbelt";
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
  const response = await fetch(TEXTBELT_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      phone: normalizePhone(to),
      message: body,
      key: getTextbeltKey(),
    }),
    cache: "no-store",
  });

  const raw = await response.text();
  let data: {
    success?: boolean;
    textId?: string | number;
    quotaRemaining?: number;
    error?: string;
  } = {};

  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    // Preserve a useful error even if Textbelt returns non-JSON.
  }

  if (!response.ok || !data.success || data.textId == null) {
    throw new Error(
      `SMS delivery failed [${response.status}]: ${data.error || raw || "Textbelt rejected the message"}`
    );
  }

  return {
    textId: String(data.textId),
    status: "SENT",
    quotaRemaining: data.quotaRemaining,
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
