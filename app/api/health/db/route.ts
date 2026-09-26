import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";

export async function GET() {
  try {
    const { error } = await supabase
      .from("companies")
      .select("id")
      .eq("id", "demo-company")
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      database: "connected",
      provider: "supabase",
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("RainShift database health check failed", error);

    return NextResponse.json(
      {
        ok: false,
        database: "unavailable",
        provider: "supabase",
      },
      { status: 503 }
    );
  }
}
