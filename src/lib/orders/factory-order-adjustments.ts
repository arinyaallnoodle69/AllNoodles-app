import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const FACTORY_ADJUSTMENT_SKUS = ["ANP180", "ANP181", "ANP182"] as const;

export type FactoryOrderAdjustment = {
  adjustedQuantity: number;
  date: string;
  orderDemand: number;
  productId: string;
  remainingQuantity: number;
  reserveQuantity: number;
  updatedAt: string | null;
};

type StoredAdjustment = Omit<FactoryOrderAdjustment, "date" | "productId">;

function readAdjustment(metadata: unknown, date: string): StoredAdjustment | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const byDate = (metadata as Record<string, unknown>).factory_order_adjustments;
  if (!byDate || typeof byDate !== "object" || Array.isArray(byDate)) return null;
  const stored = (byDate as Record<string, unknown>)[date];
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return null;

  const value = stored as Record<string, unknown>;
  const parsed = {
    adjustedQuantity: Number(value.adjustedQuantity ?? 0),
    orderDemand: Number(value.orderDemand ?? 0),
    remainingQuantity: Number(value.remainingQuantity ?? 0),
    reserveQuantity: Number(value.reserveQuantity ?? 0),
  };
  return Object.values(parsed).every(Number.isFinite)
    ? { ...parsed, updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null }
    : null;
}

export async function getDailyFactoryOrderAdjustments(
  organizationId: string,
  date: string,
): Promise<FactoryOrderAdjustment[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag(`orders-${organizationId}`);

  const { data, error } = await getSupabaseAdmin()
    .from("products")
    .select("id, metadata")
    .eq("organization_id", organizationId)
    .in("sku", [...FACTORY_ADJUSTMENT_SKUS]);

  if (error) throw new Error(error.message ?? "โหลดข้อมูลปรับยอดสั่งผลิตไม่สำเร็จ");

  return (data ?? []).flatMap((product) => {
    const stored = readAdjustment(product.metadata, date);
    return stored ? [{ ...stored, date, productId: product.id }] : [];
  });
}
