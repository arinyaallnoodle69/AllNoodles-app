import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { notifyOrderEntry, orderEntryTopic } from "@/lib/orders/order-entry-live";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handle(request: NextRequest) {
  const session = await getAppSession();
  if (!session || !["admin", "member"].includes(session.role)) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
  if (request.method === "POST" && request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  let input;
  try { input = request.method === "GET" ? Object.fromEntries(request.nextUrl.searchParams) : await request.json(); }
  catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  if (!input || typeof input !== "object") return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const { token, date, customerId } = input;
  const action = request.method === "GET" ? "state" : input.action;
  if (!uuid.test(String(token)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !["state", "acquire", "renew", "release"].includes(action) || (action !== "state" && !uuid.test(String(customerId)))) return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const admin = getSupabaseAdmin() as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }> };
  const { data, error } = await admin.rpc("order_entry_lease", { p_org: session.organizationId, p_user: session.userId, p_session: session.sessionId, p_owner: token, p_date: date, p_customer: action === "state" ? null : customerId, p_action: action });
  if (error) {
    console.error("[order-entry]", error.message);
    return NextResponse.json({ error: "ตรวจสอบสถานะร้านค้าไม่สำเร็จ กรุณาลองใหม่" }, { status: 503 });
  }
  if ((action === "acquire" && data?.granted) || action === "release") await notifyOrderEntry(session.organizationId);
  return NextResponse.json({ ...data, topic: orderEntryTopic(session.organizationId) }, { headers: { "Cache-Control": "no-store" } });
}
export const GET = handle;
export const POST = handle;
