"use server";

import { revalidatePath } from "next/cache";
import { requireAnyRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function initializeReserveStockAction(date: string, rows: { productId: string; quantity: number }[], scope: "bangkok" | "province" = "bangkok") {
  const session = await requireAnyRole(["admin", "member"]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(rows) || !rows.length || rows.some((row) => !row.productId || !Number.isFinite(row.quantity) || row.quantity < 0 || row.quantity > 1_000_000_000 || Math.abs(Math.round(row.quantity * 1000) - row.quantity * 1000) > 0.000001)) {
    return { ok: false as const, error: "กรอกจำนวนตั้งแต่ 0 ถึง 1,000,000,000 กก. และใช้ทศนิยมไม่เกิน 3 ตำแหน่ง" };
  }
  if (scope !== "bangkok" && scope !== "province") return { ok: false as const, error: "คลังสำรองไม่ถูกต้อง" };
  const { error } = await getSupabaseAdmin().rpc(scope === "province" ? "initialize_provincial_fresh_reserve_stock" : "initialize_fresh_reserve_stock", { p_org: session.organizationId, p_user: session.userId, p_date: date, p_rows: rows });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/orders/fresh-reserve-stock");
  return { ok: true as const };
}

export async function adjustReserveBalanceAction(input: {
  groupId: string; productId: string; expectedAvailable: number; quantity: number; notes: string;
}, scope: "bangkok" | "province" = "bangkok") {
  const session = await requireAnyRole(["admin", "member"]);
  if (!input.groupId || !input.productId || !Number.isFinite(input.expectedAvailable) || (scope === "bangkok" && input.expectedAvailable < 0)
    || !Number.isFinite(input.quantity) || input.quantity < 0 || input.quantity > 1_000_000_000
    || Math.abs(Math.round(input.quantity * 1000) - input.quantity * 1000) > 0.000001
    || typeof input.notes !== "string" || input.notes.length > 500) {
    return { ok: false as const, error: "กรอกยอดตั้งแต่ 0 ขึ้นไป ทศนิยมไม่เกิน 3 ตำแหน่ง และเหตุผลไม่เกิน 500 ตัวอักษร" };
  }
  if (scope !== "bangkok" && scope !== "province") return { ok: false as const, error: "คลังสำรองไม่ถูกต้อง" };
  const { error } = await getSupabaseAdmin().rpc(scope === "province" ? "adjust_provincial_fresh_reserve_balance" : "adjust_bangkok_fresh_reserve_balance", {
    p_org: session.organizationId, p_user: session.userId, p_group: input.groupId, p_product: input.productId,
    p_expected_available: input.expectedAvailable, p_quantity: input.quantity, p_notes: input.notes.trim(),
  });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/orders/fresh-reserve-stock");
  return { ok: true as const };
}
