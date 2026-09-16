import "server-only";

import { syncBillingSnapshotsForDeliveryNumbers } from "@/lib/billing/actions";
import { revalidateDashboardPages } from "@/lib/dashboard/revalidate-dashboard-pages";
import { revalidateReportPages } from "@/lib/reports/revalidate-report-pages";
import { getOrderRequiredWarehouse } from "@/lib/warehouses";
import type { Database } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

type Admin = SupabaseClient<Database>;

type WarehouseMutationResult = {
  data: unknown;
  error: { message?: string } | null;
};

type WarehouseMutationQuery = {
  eq(column: string, value: number | string): WarehouseMutationQuery;
  in(column: string, values: string[]): Promise<WarehouseMutationResult>;
  insert(values: unknown): Promise<WarehouseMutationResult>;
  select(columns: string): WarehouseMutationQuery;
  then: Promise<WarehouseMutationResult>["then"];
  update(values: Record<string, unknown>): WarehouseMutationQuery;
};

type WarehouseMutationClient = {
  from(table: string): WarehouseMutationQuery;
  rpc(fn: string, params: Record<string, unknown>): Promise<WarehouseMutationResult>;
};

type SyncResult =
  | { success: true; deliveryNumber: string }
  | { error: string };

async function resolveActorUserId(
  admin: Admin,
  organizationId: string,
  preferredUserId: string | null,
) {
  if (preferredUserId) {
    return preferredUserId;
  }

  const { data } = await admin
    .from("app_users")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data?.id ?? null;
}

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
    .single();

  if (orderError || !rawOrder) {
    return {
      error: `ไม่พบข้อมูลออเดอร์ (ID: ${input.orderId.slice(0, 8)}...) ${orderError?.message ?? ""}`,
    };
  }

  const order = rawOrder as unknown as {
    assigned_vehicle_id: string | null;
    customer_id: string;
    id: string;
    notes: string | null;
    order_date: string;
  };

  const warehouseResult = await getOrderRequiredWarehouse(input.organizationId, input.orderId);
  if (warehouseResult.error) {
    return { error: warehouseResult.error };
  }
  const warehouseId = warehouseResult.warehouse!.id;

  const { data: customer } = await admin
    .from("customers")
    .select("default_vehicle_id")
    .eq("id", order.customer_id)
    .single();

  const assignedVehicleId = order.assigned_vehicle_id;
  const vehicleId = assignedVehicleId || customer?.default_vehicle_id || null;
  const lossInBaseUnitByItemId = input.lossInBaseUnitByItemId ?? new Map<string, number>();

  const { data: sameDayOrders, error: sameDayOrdersError } = await admin
    .from("orders")
    .select("id, notes")
    .eq("organization_id", input.organizationId)
    .eq("customer_id", order.customer_id)
    .eq("order_date", order.order_date)
    .eq("warehouse_id", warehouseId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: true });

  if (sameDayOrdersError) {
    return { error: "โหลดรายการออเดอร์ของร้านนี้ในวันเดียวกันไม่สำเร็จ" };
  }

  const targetOrders = sameDayOrders ?? [];
  const targetOrderIds = targetOrders.map((item) => item.id);

  if (targetOrderIds.length === 0) {
    return { error: "ไม่พบออเดอร์ที่พร้อมซิงก์สำหรับร้านค้านี้" };
  }

  const { data: orderItems, error: itemsError } = await admin
    .from("order_items")
    .select("*")
    .in("order_id", targetOrderIds)
    .order("created_at", { ascending: true });

  if (itemsError) {
    return { error: "ไม่สามารถโหลดรายการสินค้าในออเดอร์ได้" };
  }

  const items = orderItems ?? [];
  const actorUserId = await resolveActorUserId(
    admin,
    input.organizationId,
    input.userId,
  );

  if (!actorUserId) {
    return { error: "ไม่พบผู้ใช้งานสำหรับซิงก์บิลส่งของ" };
  }

  const mergedNotes = targetOrders.reduce<string | null>((acc, item) => {
    const current = acc?.trim() ?? "";
    const incoming = item.notes?.trim() ?? "";

    if (!incoming) return current || null;
    if (!current) return incoming;
    if (current.includes(incoming)) return current;
    return `${current} / ${incoming}`;
  }, null);

  const itemIds = (orderItems ?? []).map((item) => item.id);
  let existingDn: { id: string; total_amount: number; delivery_date: string; delivery_number: string } | null = null;
  let existingDnError = null;

  if (itemIds.length > 0) {
    const { data: linkedDnItem, error: linkedError } = await admin
      .from("delivery_note_items")
      .select("delivery_note_id")
      .in("order_item_id", itemIds)
      .limit(1)
      .maybeSingle();

    if (linkedError) {
      existingDnError = linkedError;
    } else if (linkedDnItem?.delivery_note_id) {
      const { data: dn, error: dnError } = await admin
        .from("delivery_notes")
        .select("id, total_amount, delivery_date, delivery_number")
        .eq("id", linkedDnItem.delivery_note_id)
        .single();
      
      if (dnError) {
        existingDnError = dnError;
      } else {
        existingDn = dn as unknown as { id: string; total_amount: number; delivery_date: string; delivery_number: string };
      }
    }
  }

  // Fallback to customer/date if not found by items
  if (!existingDn && !existingDnError) {
    const { data: dn, error: dnError } = await admin
      .from("delivery_notes")
      .select("id, total_amount, delivery_date, delivery_number")
      .eq("organization_id", input.organizationId)
      .eq("customer_id", order.customer_id)
      .eq("delivery_date", order.order_date)
      .eq("warehouse_id", warehouseId)
      .eq("status", "confirmed")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    
    if (dnError) existingDnError = dnError;
    else existingDn = dn as unknown as { id: string; total_amount: number; delivery_date: string; delivery_number: string };
  }

  if (existingDnError) {
    return { error: "โหลดข้อมูลบิลส่งของเดิมไม่สำเร็จ" };
  }

  const payloadItems = items.map(
    (item: {
      id: string;
      product_id: string;
      product_sale_unit_id: string | null;
      quantity: number;
      sale_unit_label: string;
      sale_unit_ratio: number;
      unit_price: number;
    }) => ({
      orderItemId: item.id,
      productId: item.product_id,
      productSaleUnitId: item.product_sale_unit_id,
      quantityDelivered: Number(item.quantity),
      saleUnitLabel: item.sale_unit_label,
      saleUnitRatio: Number(item.sale_unit_ratio),
      unitPrice: Number(item.unit_price),
    }),
  );

  const warehouseDb = admin as unknown as WarehouseMutationClient;
  const { data: deliveryNumber, error: deliveryError } = await warehouseDb.rpc("create_store_delivery_note", {
    p_organization_id: input.organizationId,
    p_order_ids: targetOrderIds,
    p_customer_id: order.customer_id,
    p_vehicle_id: vehicleId as unknown as string,
    p_delivery_date: existingDn ? existingDn.delivery_date : order.order_date,
    p_notes: mergedNotes as unknown as string,
    p_created_by: actorUserId,
    p_items: payloadItems,
    p_warehouse_id: warehouseId,
    p_loss_by_order_item: Object.fromEntries(lossInBaseUnitByItemId),
    p_installment_paid: 0,
  });

  if (deliveryError) {
    return { error: "ปรับปรุงบิลส่งของไม่สำเร็จ: " + deliveryError.message };
  }

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
