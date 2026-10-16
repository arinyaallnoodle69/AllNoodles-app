import "server-only";
import { createHmac } from "node:crypto";
import { getSessionSecret } from "@/lib/supabase/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export function orderEntryTopic(organizationId: string) {
  return `order-entry:${createHmac("sha256", getSessionSecret()).update(organizationId).digest("hex")}`;
}

export async function notifyOrderEntry(organizationId: string) {
  // Broadcast carries only a refresh hint; all actual data stays behind app-session authorization.
  const admin = getSupabaseAdmin();
  const channel = admin.channel(orderEntryTopic(organizationId));
  try {
    const result = await channel.httpSend("changed", {}, { timeout: 2500 });
    if (!result.success) console.error("[order-entry broadcast]", result.error);
  } catch (error) {
    console.error("[order-entry broadcast]", error);
  } finally {
    await admin.removeChannel(channel);
  }
}
