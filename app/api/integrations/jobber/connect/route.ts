import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentCompany } from "@/lib/auth/company";

export async function GET(request: Request) {
  const { userId, companyId } = await getCurrentCompany();

  if (!userId || !companyId) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const clientId = process.env.JOBBER_CLIENT_ID;
  const redirectUri =
    process.env.JOBBER_REDIRECT_URI ||
    new URL("/api/integrations/jobber/callback", request.url).toString();

  if (!clientId) {
    return NextResponse.json(
      { ok: false, error: "Jobber OAuth is missing JOBBER_CLIENT_ID in the production environment" },
      { status: 503 }
    );
  }

  const state = crypto.randomBytes(24).toString("base64url");
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");

  const response = NextResponse.redirect(
    new URL(
      `https://api.getjobber.com/api/oauth/authorize?response_type=code&client_id=${encodeURIComponent(
        clientId
      )}&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&state=${encodeURIComponent(
        state
      )}&code_challenge=${encodeURIComponent(
        challenge
      )}&code_challenge_method=S256`,
      request.url
    )
  );

  response.cookies.set("rainshift_jobber_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });

  response.cookies.set("rainshift_jobber_verifier", verifier, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });

  response.cookies.set("rainshift_jobber_company", companyId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });

  return response;
}
