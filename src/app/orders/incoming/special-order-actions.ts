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

type SpecialItemsAdmin = {
  from(table: "daily_order_special_items"): any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

export async function saveDailySpecialItemsAction(
  date: string,
  input: SaveDailySpecialItemInput[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireAnyRole(["admin", "member"]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "วันที่ไม่ถูกต้อง" };

  const normalized = input
    .map((item) => ({
      productId: item.productId.trim(),
      quantity: Number(item.quantity),
      type: item.type === "claim" ? "claim" as const : "office" as const,
      vehicleId: item.vehicleId.trim(),
    }))
    .filter((item) => item.productId && item.vehicleId && Number.isFinite(item.quantity) && item.quantity > 0);

  const unique = new Map(normalized.map((item) => [`${item.type}:${item.vehicleId}:${item.productId}`, item]));
  const items = Array.from(unique.values());
  const vehicleIds = Array.from(new Set(items.map((item) => item.vehicleId)));
  const productIds = Array.from(new Set(items.map((item) => item.productId)));
  const admin = getSupabaseAdmin();

  const [vehiclesResult, productsResult] = await Promise.all([
    vehicleIds.length
      ? admin.from("vehicles").select("id").eq("organization_id", session.organizationId).in("id", vehicleIds)
      : Promise.resolve({ data: [], error: null }),
    productIds.length
      ? admin.from("products").select("id").eq("organization_id", session.organizationId).eq("is_active", true).in("id", productIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (vehiclesResult.error || (vehiclesResult.data?.length ?? 0) !== vehicleIds.length) {
    return { ok: false, error: "พบรถที่ไม่ถูกต้อง กรุณาโหลดหน้าใหม่" };
  }
  if (productsResult.error || (productsResult.data?.length ?? 0) !== productIds.length) {
    return { ok: false, error: "พบสินค้าที่ไม่ถูกต้อง กรุณาโหลดหน้าใหม่" };
  }

  const table = (admin as unknown as SpecialItemsAdmin).from("daily_order_special_items");
  const { data: previousRows, error: previousError } = await table
    .select("entry_type, vehicle_id, product_id, quantity, created_by")
    .eq("organization_id", session.organizationId)
    .eq("entry_date", date);

  if (previousError) return { ok: false, error: previousError.message ?? "บันทึกรายการไม่สำเร็จ" };

  const { error: deleteError } = await table
    .delete()
    .eq("organization_id", session.organizationId)
    .eq("entry_date", date);

  if (deleteError) return { ok: false, error: deleteError.message ?? "บันทึกรายการไม่สำเร็จ" };

  if (items.length > 0) {
    const { error: insertError } = await table.insert(items.map((item) => ({
      organization_id: session.organizationId,
      entry_date: date,
      entry_type: item.type,
      vehicle_id: item.vehicleId,
      product_id: item.productId,
      quantity: item.quantity,
      created_by: session.userId,
    })));

    if (insertError) {
      if ((previousRows?.length ?? 0) > 0) {
        await table.insert(previousRows.map((row: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
          organization_id: session.organizationId,
          entry_date: date,
          entry_type: row.entry_type,
          vehicle_id: row.vehicle_id,
          product_id: row.product_id,
          quantity: row.quantity,
          created_by: row.created_by,
        })));
      }
      return { ok: false, error: insertError.message ?? "บันทึกรายการไม่สำเร็จ" };
    }
  }

  updateTag(`orders-${session.organizationId}`);
  revalidatePath("/orders/incoming");
  revalidatePath("/orders/packing-list");
  revalidatePath("/orders/vehicle-product-summary");
  revalidatePath("/orders/factory-order-sheet");
  return { ok: true };
}
