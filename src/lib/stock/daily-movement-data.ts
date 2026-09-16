import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildDailyMovementRows, type DailyMovementEvent } from "@/lib/stock/daily-movement-report";
import type { Database } from "@/types/database";

type FulfillmentModeAdmin = {
  // Generated types are older than the fulfillment-mode migration.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: "product_warehouse_fulfillment_modes"): any;
};

type Movement = Pick<Database["public"]["Tables"]["inventory_movements"]["Row"],
  "id" | "product_id" | "warehouse_id" | "created_at" | "movement_type" | "quantity_delta" | "stock_before" | "stock_after" | "reference_number" | "notes" | "metadata">;

function metadataId(metadata: Movement["metadata"]) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const id = metadata.delivery_note_id;
  return typeof id === "string" ? id : null;
}

function documentFromNotes(notes: string | null) {
  return notes?.match(/\bDN\d+\b/i)?.[0] ?? null;
}

export async function getDailyMovementReport(organizationId: string, from: string, to: string, warehouseId: string | null) {
  const admin = getSupabaseAdmin();
  const fromUtc = new Date(`${from}T00:00:00+07:00`).toISOString();
  const untilUtc = new Date(new Date(`${to}T00:00:00+07:00`).getTime() + 86400000).toISOString();
  const [productsResult, warehousesResult, modesResult] = await Promise.all([
    admin.from("products").select("id, sku, name, unit").eq("organization_id", organizationId).order("sku"),
    admin.from("warehouses").select("id, name").eq("organization_id", organizationId).order("name"),
    (admin as unknown as FulfillmentModeAdmin).from("product_warehouse_fulfillment_modes").select("product_id, warehouse_id, mode").eq("organization_id", organizationId),
  ]);
  if (productsResult.error) throw new Error(productsResult.error.message);
  if (warehousesResult.error) throw new Error(warehousesResult.error.message);
  if (modesResult.error) throw new Error(modesResult.error.message);

  const movements: Movement[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = admin.from("inventory_movements")
      .select("id, product_id, warehouse_id, created_at, movement_type, quantity_delta, stock_before, stock_after, reference_number, notes, metadata")
      .eq("organization_id", organizationId)
      .gte("created_at", fromUtc)
      .lt("created_at", untilUtc)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + 999);
    if (warehouseId) query = query.eq("warehouse_id", warehouseId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    movements.push(...((data ?? []) as Movement[]));
    if (!data || data.length < 1000) break;
  }

  const deliveryIds = Array.from(new Set(movements.map((movement) => metadataId(movement.metadata)).filter((id): id is string => Boolean(id))));
  const deliveryNumbers = Array.from(new Set(movements.map((movement) => movement.reference_number).filter((number): number is string => Boolean(number && /^DN/i.test(number)))));
  const deliveryNotes = new Map<string, { id: string; customer_id: string; delivery_number: string }>();
  for (const values of [deliveryIds, deliveryNumbers]) {
    for (let offset = 0; offset < values.length; offset += 100) {
      const batch = values.slice(offset, offset + 100);
      const field = values === deliveryIds ? "id" : "delivery_number";
      const { data, error } = await admin.from("delivery_notes")
        .select("id, customer_id, delivery_number")
        .eq("organization_id", organizationId)
        .in(field, batch);
      if (error) throw new Error(error.message);
      for (const note of data ?? []) {
        deliveryNotes.set(note.id, note);
        deliveryNotes.set(note.delivery_number, note);
      }
    }
  }

  const customerIds = Array.from(new Set(Array.from(deliveryNotes.values()).map((note) => note.customer_id)));
  const customers = new Map<string, string>();
  for (let offset = 0; offset < customerIds.length; offset += 100) {
    const { data, error } = await admin.from("customers")
      .select("id, name")
      .eq("organization_id", organizationId)
      .in("id", customerIds.slice(offset, offset + 100));
    if (error) throw new Error(error.message);
    for (const customer of data ?? []) customers.set(customer.id, customer.name);
  }

  const fulfillmentModes = (modesResult.data ?? []) as { product_id: string; warehouse_id: string; mode: string }[];
  const modeByProductWarehouse = new Map(fulfillmentModes.map((mode) => [`${mode.warehouse_id}:${mode.product_id}`, mode.mode]));
  const events: DailyMovementEvent[] = movements.filter((movement) =>
    modeByProductWarehouse.get(`${movement.warehouse_id}:${movement.product_id}`) !== "fresh" &&
    modeByProductWarehouse.get(`${movement.warehouse_id}:${movement.product_id}`) !== "disabled",
  ).map((movement) => {
    const deliveryId = metadataId(movement.metadata);
    const note = deliveryNotes.get(deliveryId ?? "") ?? deliveryNotes.get(movement.reference_number ?? "");
    const source = movement.metadata && typeof movement.metadata === "object" && !Array.isArray(movement.metadata)
      ? movement.metadata.source : null;
    const isReturn = movement.quantity_delta > 0 && movement.movement_type === "adjustment"
      && (source === "order_management_rebuild" || source === "delivery_note_rebuild" || String(source).startsWith("delete_order_") || movement.notes?.startsWith("คืนสต็") === true || movement.notes?.startsWith("คืนยอดเดิม") === true || movement.notes?.startsWith("ลบออเดอร์") === true);
    const returnReason = String(source).startsWith("delete_order_") || movement.notes?.startsWith("ลบออเดอร์")
      ? "คืนสินค้าเข้าสต็อกจากออเดอร์ที่ยกเลิก"
      : "คืนยอดเดิมก่อนคำนวณออเดอร์ใหม่";
    return {
      id: movement.id,
      productId: movement.product_id,
      warehouseId: movement.warehouse_id ?? "unassigned",
      occurredAt: movement.created_at,
      type: isReturn ? "return" : movement.movement_type,
      delta: Number(movement.quantity_delta),
      before: Number(movement.stock_before),
      after: Number(movement.stock_after),
      document: note?.delivery_number ?? movement.reference_number ?? documentFromNotes(movement.notes),
      store: note ? customers.get(note.customer_id) ?? "ไม่พบชื่อร้าน" : null,
      reason: isReturn ? returnReason : movement.notes,
    };
  });

  const products = new Map((productsResult.data ?? []).map((product) => [product.id, product]));
  const warehouses = new Map((warehousesResult.data ?? []).map((warehouse) => [warehouse.id, warehouse]));
  const rows = buildDailyMovementRows(from, to, events)
    .filter((row) => row.movements.length > 0)
    .map((row) => ({
      ...row,
      sku: products.get(row.productId)?.sku ?? "-",
      name: products.get(row.productId)?.name ?? "ไม่พบชื่อสินค้า",
      unit: products.get(row.productId)?.unit ?? "",
      warehouseName: warehouses.get(row.warehouseId)?.name ?? "ไม่ระบุคลัง",
    }))
    .sort((a, b) => a.sku.localeCompare(b.sku, "en", { numeric: true }) || a.warehouseName.localeCompare(b.warehouseName, "th") || a.date.localeCompare(b.date));

  return { rows, warehouses: warehousesResult.data ?? [] };
}
