import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Admin = SupabaseClient<Database>;

export type MergeableOrderItemInput = {
  isReplacement?: boolean;
  costPrice: number;
  productId: string;
  productSaleUnitId: string | null;
  quantity: number;
  quantityInBaseUnit: number;
  saleUnitLabel: string;
  saleUnitRatio: number;
  unitPrice: number;
};

function getOrderItemKey(productId: string, productSaleUnitId: string | null, isReplacement = false) {
  return `${productId}__${productSaleUnitId ?? "__default__"}__${isReplacement ? "replacement" : "sale"}`;
}

function normalizeMergedUnitPrice(lineTotal: number, quantity: number, fallback: number) {
  if (!Number.isFinite(quantity) || quantity <= 0) return fallback;
  return lineTotal / quantity;
}

export function aggregateMergeableOrderItems(items: MergeableOrderItemInput[]) {
  const grouped = new Map<string, MergeableOrderItemInput>();

  for (const item of items) {
    const unitPrice = item.isReplacement ? 0 : Number(item.unitPrice) || 0;
    const key = getOrderItemKey(item.productId, item.productSaleUnitId, item.isReplacement);
    const existing = grouped.get(key);
    const lineTotal = Number(item.quantity) * unitPrice;

    if (!existing) {
      grouped.set(key, {
        isReplacement: item.isReplacement === true,
        costPrice: Number(item.costPrice) || 0,
        productId: item.productId,
        productSaleUnitId: item.productSaleUnitId,
        quantity: Number(item.quantity),
        quantityInBaseUnit: Number(item.quantityInBaseUnit),
        saleUnitLabel: item.saleUnitLabel,
        saleUnitRatio: Number(item.saleUnitRatio) || 1,
        unitPrice,
      });
      continue;
    }

    const mergedQuantity = Number(existing.quantity) + Number(item.quantity);
    const mergedLineTotal =
      Number(existing.quantity) * Number(existing.unitPrice) + lineTotal;

    existing.quantity = mergedQuantity;
    existing.quantityInBaseUnit =
      Number(existing.quantityInBaseUnit) + Number(item.quantityInBaseUnit);
    existing.unitPrice = normalizeMergedUnitPrice(
      mergedLineTotal,
      mergedQuantity,
      unitPrice || Number(existing.unitPrice) || 0,
    );
    existing.saleUnitLabel = item.saleUnitLabel;
    existing.saleUnitRatio = Number(item.saleUnitRatio) || Number(existing.saleUnitRatio) || 1;
    existing.costPrice = Number(item.costPrice) || Number(existing.costPrice) || 0;
  }

  return Array.from(grouped.values());
}

export async function mergeItemsIntoOrder(admin: Admin, input: {
  items: MergeableOrderItemInput[];
  orderId: string;
  organizationId: string;
  userId?: string | null;
  syncDelivery?: boolean;
}) {
  const items = aggregateMergeableOrderItems(input.items);
  if (items.length === 0) return { success: true as const };
  const { error } = await admin.rpc("merge_order_items_atomic", {
    p_organization_id: input.organizationId,
    p_order_id: input.orderId,
    p_items: items,
    p_user_id: input.userId ?? undefined,
    p_sync_delivery: input.syncDelivery ?? false,
  });
  if (error) return { error: error.message };
  return { success: true as const };
}
