import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");

    return NextResponse.json({
      ok: true,
      database: "connected",
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("RainShift database health check failed", error);

    return NextResponse.json(
      {
        ok: false,
        database: "unavailable",
        error: "DATABASE_URL is missing or the PostgreSQL connection failed",
      },
      { status: 503 }
    );
  }
}
