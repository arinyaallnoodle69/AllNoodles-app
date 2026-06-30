import { NextResponse } from "next/server";
import { APP_ROLE_COOKIE, getAppSession } from "@/lib/auth/session";

export async function GET() {
  const session = await getAppSession();

  if (!session) {
    const response = NextResponse.json({ role: null }, { status: 401 });
    response.cookies.delete(APP_ROLE_COOKIE);
    return response;
  }

  const response = NextResponse.json({ role: session.role });
  response.cookies.set(APP_ROLE_COOKIE, session.role, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(session.expiresAt),
  });

  return response;
}
