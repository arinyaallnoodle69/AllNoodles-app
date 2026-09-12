"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireAnyRole } from "@/lib/auth/authorization";
import { FACTORY_ADJUSTMENT_SKUS } from "@/lib/orders/factory-order-adjustments";
import { getFactoryOrderSheetData } from "@/lib/orders/vehicle-product-summary";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

export type FactoryOrderAdjustmentInput = {
  adjustedQuantity: number;
  orderDemand: number;
  productId: string;
  remainingQuantity: number;
  reserveQuantity: number;
};

export async function saveFactoryOrderAdjustmentsAction(
  date: string,
  input: FactoryOrderAdjustmentInput[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireAnyRole(["admin", "member"]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "วันที่ไม่ถูกต้อง" };
  if (input.length !== FACTORY_ADJUSTMENT_SKUS.length) {
    return { ok: false, error: "ข้อมูลสินค้าปรับยอดไม่ครบ" };
  }

  const rows = input.map((item) => ({
    adjustedQuantity: Number(item.adjustedQuantity),
    orderDemand: Number(item.orderDemand),
    productId: item.productId.trim(),
    remainingQuantity: Number(item.remainingQuantity),
    reserveQuantity: Number(item.reserveQuantity),
  }));
  if (rows.some((row) => !row.productId || [row.adjustedQuantity, row.orderDemand, row.remainingQuantity, row.reserveQuantity].some((value) => !Number.isFinite(value) || value < 0))) {
    return { ok: false, error: "กรุณากรอกจำนวนเป็นเลขตั้งแต่ 0 ขึ้นไป" };
  }
  if (rows.some((row) => Math.abs(row.adjustedQuantity - Math.max(0, row.orderDemand + row.reserveQuantity - row.remainingQuantity)) > 0.001)) {
    return { ok: false, error: "ยอดสั่งคำนวณไม่ถูกต้อง กรุณาลองใหม่" };
  }

  const admin = getSupabaseAdmin();
  const { data: products, error: productsError } = await admin
    .from("products")
    .select("id, sku, metadata")
    .eq("organization_id", session.organizationId)
    .in("id", rows.map((row) => row.productId));

  if (productsError) return { ok: false, error: productsError.message ?? "ตรวจสอบสินค้าไม่สำเร็จ" };
  const skuByProductId = new Map((products ?? []).map((product) => [product.id, product.sku.trim().toUpperCase()]));
  const submittedSkus = new Set(rows.map((row) => skuByProductId.get(row.productId)));
  if (new Set(rows.map((row) => row.productId)).size !== FACTORY_ADJUSTMENT_SKUS.length || FACTORY_ADJUSTMENT_SKUS.some((sku) => !submittedSkus.has(sku))) {
    return { ok: false, error: "ปรับยอดได้เฉพาะ ANP180, ANP181 และ ANP182" };
  }

  const demandByProductId = new Map<string, number>();
  for (const sheet of await getFactoryOrderSheetData(session.organizationId, date, date, { applyAdjustments: false })) {
    sheet.products.forEach((product, index) => {
      const demand = (sheet.qty[index] ?? []).reduce((sum, quantity) => sum + Number(quantity ?? 0), 0);
      demandByProductId.set(product.id, (demandByProductId.get(product.id) ?? 0) + demand);
    });
  }
  if (rows.some((row) => Math.abs(row.orderDemand - (demandByProductId.get(row.productId) ?? 0)) > 0.001)) {
    return { ok: false, error: "ยอดออเดอร์มีการเปลี่ยนแปลง กรุณาเปิดหน้าปรับยอดใหม่" };
  }

  const productById = new Map((products ?? []).map((product) => [product.id, product]));
  const updates = await Promise.all(rows.map((row) => {
    const product = productById.get(row.productId);
    const metadata = product?.metadata && typeof product.metadata === "object" && !Array.isArray(product.metadata)
      ? product.metadata as Record<string, unknown>
      : {};
    const currentByDate = metadata.factory_order_adjustments;
    const adjustments = currentByDate && typeof currentByDate === "object" && !Array.isArray(currentByDate)
      ? currentByDate as Record<string, unknown>
      : {};

    // ponytail: keep three small date-keyed records with each product; move to a dedicated table if long-term history makes metadata large.
    return admin
      .from("products")
      .update({
        metadata: {
          ...metadata,
          factory_order_adjustments: {
            ...adjustments,
            [date]: {
              adjustedQuantity: row.adjustedQuantity,
              orderDemand: row.orderDemand,
              remainingQuantity: row.remainingQuantity,
              reserveQuantity: row.reserveQuantity,
              updatedAt: new Date().toISOString(),
              updatedBy: session.userId,
            },
          },
        } as Json,
      })
      .eq("organization_id", session.organizationId)
      .eq("id", row.productId);
  }));
  const updateError = updates.find((result) => result.error)?.error;
  if (updateError) return { ok: false, error: updateError.message ?? "บันทึกยอดสั่งผลิตไม่สำเร็จ" };

  updateTag(`orders-${session.organizationId}`);
  revalidatePath("/orders/incoming");
  revalidatePath("/orders/factory-order-sheet");
  revalidatePath("/orders/fresh-reserve");
  return { ok: true };
}
