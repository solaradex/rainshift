import { NextResponse } from "next/server";
import { getCurrentCompany } from "@/lib/auth/company";
import { sendSms } from "@/lib/sms";

export async function POST() {
  try {
    const { userId, companyId } = await getCurrentCompany();

    if (!userId || !companyId) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const testNumber = process.env.TEXTBELT_TEST_TO_NUMBER;
    if (!testNumber) {
      return NextResponse.json(
        {
          ok: false,
          error: "TEXTBELT_TEST_TO_NUMBER is not configured",
        },
        { status: 400 }
      );
    }

    const result = await sendSms({
      to: testNumber,
      body: "RainShift test SMS: customer weather notifications are connected and ready.",
    });

    return NextResponse.json({
      ok: true,
      sid: result.sid,
      status: result.status,
      message: "Test SMS sent.",
    });
  } catch (error) {
    console.error("RainShift Twilio test error", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Twilio test failed",
      },
      { status: 500 }
    );
  }
}
