import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type TelemetryRequestBody = {
  eventType?: string;
  eventName?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function POST(request: Request) {
  const session = await getAppSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  let body: TelemetryRequestBody;
  try {
    body = (await request.json()) as TelemetryRequestBody;
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  const { eventType, eventName, durationMs, metadata } = body;

  if (!isNonEmptyString(eventType) || !isNonEmptyString(eventName) || typeof durationMs !== "number") {
    return NextResponse.json({ message: "Missing required fields." }, { status: 400 });
  }

  try {
    const admin = getSupabaseAdmin();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await admin.from("system_performance_logs" as any).insert({
      organization_id: session.organizationId,
      event_type: eventType.trim(),
      event_name: eventName.trim(),
      duration_ms: durationMs,
      user_id: session.userId,
      metadata: metadata || {},
    });

    if (error) {
      console.error("[api/performance] Supabase error:", error);
      return NextResponse.json({ message: "Failed to save telemetry log." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[api/performance:post]", error);
    return NextResponse.json({ message: "Failed to save telemetry log." }, { status: 500 });
  }
}
