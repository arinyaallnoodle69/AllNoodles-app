import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export async function getReserveRebuildError(admin: SupabaseClient<Database>, organizationId: string, orderId: string) {
  const { data, error } = await admin.from("order_items").select("id").eq("organization_id", organizationId)
    .eq("order_id", orderId).eq("supply_source", "reserve").limit(1);
  if (error) return "ตรวจรายการสำรองไม่สำเร็จ กรุณาลองใหม่";
  return data.length ? "ออเดอร์นี้มีรายการใช้สำรอง กรุณาแก้จำนวนหรือลบสินค้าในหน้ารายละเอียดออเดอร์ หรือใช้ยกเลิกออเดอร์ เพื่อคืนสำรองให้ถูกต้อง" : null;
}
