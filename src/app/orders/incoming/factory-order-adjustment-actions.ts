"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireAnyRole } from "@/lib/auth/authorization";
import { FACTORY_ADJUSTMENT_SKUS } from "@/lib/orders/factory-order-adjustments";
import { getFactoryOrderSheetData } from "@/lib/orders/vehicle-product-summary";
import { getBangkokFactoryAdjustmentDemand } from "@/lib/orders/factory-adjustment-demand";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { calculateFactoryOrderQuantity } from "@/lib/orders/fresh-reserve-math";
import type { Json } from "@/types/database";

export type FactoryOrderAdjustmentInput = {
  adjustedQuantity: number;
  orderDemand: number;
  productId: string;
  remainingQuantity: number;
  reserveQuantity: number;
  updatedAt: string | null;
  additionalQuantity?: number;
};

export async function saveFactoryOrderAdjustmentsAction(
  date: string,
  input: FactoryOrderAdjustmentInput[],
  operation: "confirm" | "add",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireAnyRole(["admin", "member"]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "วันที่ไม่ถูกต้อง" };
  if (!Array.isArray(input) || input.length !== FACTORY_ADJUSTMENT_SKUS.length || !["confirm", "add"].includes(operation)) {
    return { ok: false, error: "ข้อมูลสินค้าหรือการยืนยันไม่ถูกต้อง" };
  }
  const rows = input.map((item) => ({
    adjustedQuantity: Number(item.adjustedQuantity),
    orderDemand: Number(item.orderDemand),
    productId: typeof item.productId === "string" ? item.productId.trim() : "",
    remainingQuantity: Number(item.remainingQuantity),
    reserveQuantity: Number(item.reserveQuantity),
    updatedAt: item.updatedAt,
    additionalQuantity: Number(item.additionalQuantity ?? 0),
  }));
  if (rows.some((row) => !row.productId || [row.adjustedQuantity, row.orderDemand, row.remainingQuantity, row.reserveQuantity, row.additionalQuantity].some((value) => !Number.isFinite(value) || value < 0))) {
    return { ok: false, error: "กรุณากรอกจำนวนเป็นเลขตั้งแต่ 0 ขึ้นไป" };
  }
  if (operation === "add" && !rows.some((row) => row.additionalQuantity > 0)) {
    return { ok: false, error: "กรอกจำนวนที่สั่งโรงงานเพิ่มจริงก่อนยืนยัน" };
  }
  const admin = getSupabaseAdmin();
  const { data: products, error: productsError } = await admin.from("products")
    .select("id, sku").eq("organization_id", session.organizationId)
    .in("id", rows.map((row) => row.productId));
  if (productsError) return { ok: false, error: "ตรวจสอบสินค้าไม่สำเร็จ" };
  const skuByProductId = new Map((products ?? []).map((product) => [product.id, product.sku.trim().toUpperCase()]));
  const submittedSkus = new Set(rows.map((row) => skuByProductId.get(row.productId)));
  if (new Set(rows.map((row) => row.productId)).size !== 3 || FACTORY_ADJUSTMENT_SKUS.some((sku) => !submittedSkus.has(sku))) {
    return { ok: false, error: "ปรับยอดได้เฉพาะ ANP180, ANP181 และ ANP182" };
  }
  if (operation === "confirm") {
    if (rows.some((row) => Math.abs(row.adjustedQuantity - calculateFactoryOrderQuantity(row.orderDemand, row.reserveQuantity, row.remainingQuantity)) > 0.001)) {
      return { ok: false, error: "ยอดสั่งคำนวณไม่ถูกต้อง กรุณาลองใหม่" };
    }
    updateTag(`orders-${session.organizationId}`);
    const demandByProductId = getBangkokFactoryAdjustmentDemand(
      await getFactoryOrderSheetData(session.organizationId, date, date, { applyAdjustments: false }),
    );
    if (rows.some((row) => Math.abs(row.orderDemand - (demandByProductId.get(row.productId) ?? 0)) > 0.001)) {
      return { ok: false, error: "ยอดออเดอร์มีการเปลี่ยนแปลง กรุณาเปิดหน้ายืนยันใหม่" };
    }
  }
  const { error } = await admin.rpc("save_confirmed_factory_production", {
    p_organization_id: session.organizationId,
    p_date: date,
    p_user_id: session.userId,
    p_operation: operation,
    p_rows: rows as unknown as Json,
  });
  if (error) return { ok: false, error: error.message ?? "บันทึกยอดโรงงานไม่สำเร็จ" };
  updateTag(`orders-${session.organizationId}`);
  revalidatePath("/orders/incoming");
  revalidatePath("/orders/factory-order-sheet");
  revalidatePath("/orders/fresh-reserve");
  return { ok: true };
}
