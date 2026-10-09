import "server-only";

import { syncBillingSnapshotsForDeliveryNumbers } from "@/lib/billing/actions";
import { revalidateDashboardPages } from "@/lib/dashboard/revalidate-dashboard-pages";
import { revalidateReportPages } from "@/lib/reports/revalidate-report-pages";
import type { Database } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

type Admin = SupabaseClient<Database>;

type SyncResult =
  | { success: true; deliveryNumber: string }
  | { error: string };

export async function syncDeliveryNoteForOrder(
  admin: Admin,
  input: {
    lossInBaseUnitByItemId?: Map<string, number>;
    orderId: string;
    organizationId: string;
    skipBillingSync?: boolean;
    userId: string | null;
    skipRevalidate?: boolean;
  },
): Promise<SyncResult> {
  const { data: rawOrder, error: orderError } = await admin
    .from("orders")
    .select("id, customer_id, order_date, notes, assigned_vehicle_id")
    .eq("id", input.orderId)
    .eq("organization_id", input.organizationId)
    .single();

  if (orderError || !rawOrder) {
    return {
      error: `ไม่พบข้อมูลออเดอร์ (ID: ${input.orderId.slice(0, 8)}...) ${orderError?.message ?? ""}`,
    };
  }

  const order = rawOrder;
  const { data: deliveryNumber, error: deliveryError } = await admin.rpc("sync_order_delivery_current", {
    p_organization_id: input.organizationId,
    p_order_id: input.orderId,
    p_user_id: input.userId ?? undefined,
    p_loss_by_order_item: Object.fromEntries(input.lossInBaseUnitByItemId ?? []),
  });
  if (deliveryError) return { error: "ปรับปรุงบิลส่งของไม่สำเร็จ: " + deliveryError.message };

  if (!input.skipBillingSync) {
    const billingSyncResult = await syncBillingSnapshotsForDeliveryNumbers({
      organizationId: input.organizationId,
      customerId: order.customer_id,
      deliveryNumbers: [String(deliveryNumber)],
      skipRevalidate: input.skipRevalidate,
    });

    if (!billingSyncResult.success) {
      return { error: billingSyncResult.error };
    }
  }

  if (!input.skipRevalidate) {
    revalidateReportPages();
    revalidateDashboardPages();
  }
  return { success: true, deliveryNumber: String(deliveryNumber) };
}
