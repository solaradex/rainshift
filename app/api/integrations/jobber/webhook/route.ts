import crypto from "node:crypto";
import { after, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type JobberWebhook = {
  data?: {
    webHookEvent?: {
      topic?: string;
      appId?: string;
      accountId?: string;
      itemId?: string;
      occurredAt?: string;
      occuredAt?: string;
    };
  };
};

const SUPPORTED_TOPICS = new Set([
  "APP_DISCONNECT",
  "JOB_CREATE",
  "JOB_UPDATE",
  "JOB_DESTROY",
]);

function verifySignature(rawBody: string, signature: string) {
  const secret = process.env.JOBBER_CLIENT_SECRET;
  if (!secret) throw new Error("JOBBER_CLIENT_SECRET is not configured");

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");

  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(signature, "utf8");

  return (
    expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

async function processWebhook(event: JobberWebhook, baseUrl: string) {
  const webhook = event.data?.webHookEvent;
  if (!webhook?.topic || !SUPPORTED_TOPICS.has(webhook.topic)) return;

  const supabase = createAdminClient();
  const topic = webhook.topic;
  const accountId = webhook.accountId ?? null;
  const itemId = webhook.itemId ?? null;
  const occurredAt = webhook.occurredAt ?? webhook.occuredAt ?? null;

  const { data: connection } = await supabase
    .from("scheduling_connections")
    .select("id,company_id")
    .eq("provider", "jobber")
    .eq("external_account_id", accountId)
    .maybeSingle();

  if (!connection) {
    await supabase.from("integration_webhook_events").insert({
      provider: "jobber",
      topic,
      external_account_id: accountId,
      external_item_id: itemId,
      occurred_at: occurredAt,
      payload: event,
      processed_at: new Date().toISOString(),
    });
    return;
  }

  if (topic === "APP_DISCONNECT") {
    await supabase
      .from("scheduling_connections")
      .update({
        active: false,
        encrypted_access_token: null,
        encrypted_refresh_token: null,
        access_token_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id);

    await supabase.from("integration_webhook_events").insert({
      provider: "jobber",
      topic,
      external_account_id: accountId,
      external_item_id: itemId,
      occurred_at: occurredAt,
      payload: event,
      processed_at: new Date().toISOString(),
    });
    return;
  }

  // Job events identify the changed Jobber Job via itemId.
  // Refresh the company's synced schedule asynchronously after acknowledging Jobber.
  await supabase.from("integration_webhook_events").insert({
    provider: "jobber",
    topic,
    external_account_id: accountId,
    external_item_id: itemId,
    occurred_at: occurredAt,
    payload: event,
    processed_at: new Date().toISOString(),
  });

  if (process.env.CRON_SECRET) {
    const syncUrl = new URL("/api/integrations/jobber/sync", baseUrl);
    syncUrl.searchParams.set("companyId", connection.company_id);

    const response = await fetch(syncUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.CRON_SECRET}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("RainShift webhook-triggered Jobber sync failed", {
        status: response.status,
        companyId: connection.company_id,
        topic,
      });
    }
  }
}

export async function POST(request: Request) {
  try {
    const signature = request.headers.get("X-Jobber-Hmac-SHA256");
    if (!signature) {
      return NextResponse.json(
        { ok: false, error: "Missing Jobber webhook signature" },
        { status: 401 }
      );
    }

    const rawBody = await request.text();

    if (!verifySignature(rawBody, signature)) {
      return NextResponse.json(
        { ok: false, error: "Invalid Jobber webhook signature" },
        { status: 401 }
      );
    }

    let payload: JobberWebhook;
    try {
      payload = JSON.parse(rawBody) as JobberWebhook;
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid webhook JSON" },
        { status: 400 }
      );
    }

    // Jobber expects a webhook response within about one second.
    // Process storage/side effects after the response is returned.
    after(async () => {
      try {
        await processWebhook(payload, new URL(request.url).origin);
      } catch (error) {
        console.error("RainShift Jobber webhook processing error", error);
      }
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("RainShift Jobber webhook error", error);
    return NextResponse.json(
      { ok: false, error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
