"use server";

import { requireAnyRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function fetchOrderReserveStockAction(warehouseId: string): Promise<{ productId: string; available: number }[]> {
  const session = await requireAnyRole(["admin", "member"]);
  const admin = getSupabaseAdmin();
  const { data: warehouse, error: warehouseError } = await admin.from("warehouses").select("name").eq("organization_id", session.organizationId).eq("id", warehouseId).single();
  if (warehouseError || !warehouse) throw new Error("ไม่พบคลังของร้านค้า");
  const provincial = warehouse.name === "คลังต่างจังหวัด";
  if (!provincial && warehouse.name !== "คลังกรุงเทพ") return [];
  const [groups, modes] = await Promise.all([
    admin.from("fresh_reserve_stock_groups").select("id,suppliers(name,supplier_code)").eq("organization_id", session.organizationId).eq("warehouse_id", warehouseId),
    admin.from("product_warehouse_fulfillment_modes").select("product_id").eq("organization_id", session.organizationId).eq("warehouse_id", warehouseId).eq("mode", "fresh"),
  ]);
  if (groups.error || modes.error) throw new Error("โหลดสต็อคสำรองไม่สำเร็จ");
  const group = groups.data.find(row => provincial ? row.suppliers?.supplier_code === "TYV005" : row.suppliers?.name === "โรงงานมังกร");
  if (!group) return [];
  const { data, error } = await admin.from(provincial ? "provincial_fresh_reserve_stock_balances" : "fresh_reserve_stock_balances")
    .select("product_id,available").eq("organization_id", session.organizationId).eq("group_id", group.id);
  if (error) throw new Error("โหลดสต็อคสำรองไม่สำเร็จ");
  const fresh = new Set(modes.data.map(row => row.product_id));
  return (data ?? []).flatMap(row => row.product_id && fresh.has(row.product_id) && Number(row.available) > 0
    ? [{ productId: row.product_id, available: Number(row.available) }] : []);
}
