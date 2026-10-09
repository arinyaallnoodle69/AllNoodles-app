"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireAnyRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { DailySpecialItemType } from "@/lib/orders/daily-special-items";

export type SaveDailySpecialItemInput = {
  productId: string;
  quantity: number;
  type: DailySpecialItemType;
  vehicleId: string;
};

type SpecialModesAdmin = {
  from(table: "product_warehouse_fulfillment_modes"): any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

export async function saveDailySpecialItemsAction(
  date: string,
  input: SaveDailySpecialItemInput[],
  expected: SaveDailySpecialItemInput[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireAnyRole(["admin", "member"]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "วันที่ไม่ถูกต้อง" };

  const normalized = input
    .map((item) => ({
      productId: item.productId.trim(),
      quantity: Number(item.quantity),
      type: item.type === "claim" ? "claim" as const : item.type === "remaining" ? "remaining" as const : "office" as const,
      vehicleId: item.vehicleId.trim(),
    }))
    .filter((item) => item.productId && item.vehicleId && Number.isFinite(item.quantity) && item.quantity > 0);

  const unique = new Map(normalized.map((item) => [`${item.type}:${item.vehicleId}:${item.productId}`, item]));
  const items = Array.from(unique.values());
  const vehicleIds = Array.from(new Set(items.map((item) => item.vehicleId)));
  const productIds = Array.from(new Set(items.map((item) => item.productId)));
  const admin = getSupabaseAdmin();
  const modesTable = (admin as unknown as SpecialModesAdmin).from("product_warehouse_fulfillment_modes");

  const [vehiclesResult, productsResult, freshModesResult] = await Promise.all([
    vehicleIds.length
      ? admin.from("vehicles").select("id").eq("organization_id", session.organizationId).in("id", vehicleIds)
      : Promise.resolve({ data: [], error: null }),
    productIds.length
      ? admin.from("products").select("id").eq("organization_id", session.organizationId).eq("is_active", true).in("id", productIds)
      : Promise.resolve({ data: [], error: null }),
    productIds.length
      ? modesTable.select("product_id").eq("organization_id", session.organizationId).eq("mode", "fresh").in("product_id", productIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (vehiclesResult.error || (vehiclesResult.data?.length ?? 0) !== vehicleIds.length) {
    return { ok: false, error: "พบรถที่ไม่ถูกต้อง กรุณาโหลดหน้าใหม่" };
  }
  if (productsResult.error || (productsResult.data?.length ?? 0) !== productIds.length) {
    return { ok: false, error: "พบสินค้าที่ไม่ถูกต้อง กรุณาโหลดหน้าใหม่" };
  }
  if (freshModesResult.error) return { ok: false, error: "ตรวจสอบประเภทสินค้าไม่สำเร็จ" };
  const freshProductIds = new Set((freshModesResult.data ?? []).map((row: { product_id: string }) => row.product_id));
  if (items.some((item) => item.type === "remaining" && !freshProductIds.has(item.productId))) {
    return { ok: false, error: "ของเหลือเลือกได้เฉพาะสินค้าผลิตสด" };
  }

  const { error } = await admin.rpc("save_daily_special_items_atomic", {
    p_org: session.organizationId, p_user: session.userId, p_date: date,
    p_items: items, p_expected: expected.map(({ productId, vehicleId, type, quantity }) => ({ productId, vehicleId, type, quantity })),
  });
  if (error) return { ok: false, error: error.message };

  updateTag(`orders-${session.organizationId}`);
  revalidatePath("/orders/incoming");
  revalidatePath("/orders/packing-list");
  revalidatePath("/orders/vehicle-product-summary");
  revalidatePath("/orders/factory-order-sheet");
  revalidatePath("/orders/fresh-reserve");
  revalidatePath("/orders/fresh-reserve-stock");
  return { ok: true };
}
