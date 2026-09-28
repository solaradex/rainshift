import { NextResponse } from "next/server";
import { getCurrentCompany } from "@/lib/auth/company";

export async function GET() {
  try {
    const { supabase, userId, companyId } = await getCurrentCompany();

    if (!userId || !companyId) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("companies")
      .select("notification_phone")
      .eq("id", companyId)
      .single();

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      notificationPhone: data.notification_phone ?? "",
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not load notification settings" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, userId, companyId } = await getCurrentCompany();

    if (!userId || !companyId) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      notificationPhone?: string;
    };

    const phone = body.notificationPhone?.trim() ?? "";
    const digits = phone.replace(/\D/g, "");

    if (phone && (digits.length < 10 || digits.length > 15)) {
      return NextResponse.json(
        { ok: false, error: "Enter a valid operator phone number" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("companies")
      .update({
        notification_phone: phone || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", companyId)
      .eq("owner_user_id", userId);

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      notificationPhone: phone,
      message: phone
        ? "Weather alert phone saved."
        : "Weather alert phone cleared.",
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not save notification settings" },
      { status: 500 }
    );
  }
}
