"use server";

import { revalidatePath } from "next/cache";
import { requireAnyRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function initializeReserveStockAction(date: string, rows: { productId: string; quantity: number }[]) {
  const session = await requireAnyRole(["admin", "member"]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(rows) || !rows.length || rows.some((row) => !row.productId || !Number.isFinite(row.quantity) || row.quantity < 0 || row.quantity > 1_000_000_000 || Math.abs(Math.round(row.quantity * 1000) - row.quantity * 1000) > 0.000001)) {
    return { ok: false as const, error: "กรอกจำนวนให้ครบ ใส่ 0 หากไม่มีของ และใช้ทศนิยมไม่เกิน 3 ตำแหน่ง" };
  }
  const { error } = await getSupabaseAdmin().rpc("initialize_fresh_reserve_stock", { p_org: session.organizationId, p_user: session.userId, p_date: date, p_rows: rows });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/orders/fresh-reserve-stock");
  return { ok: true as const };
}
