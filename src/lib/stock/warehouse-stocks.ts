import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type ProductWarehouseStockSnapshot = {
  productId: string;
  reservedQuantity: number;
  stockQuantity: number;
  warehouseId: string;
};

type WarehouseStockRow = {
  product_id: string;
  reserved_quantity: number | string | null;
  stock_quantity: number | string | null;
  warehouse_id: string;
};

function toNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

export async function getProductWarehouseStockSnapshots(
  organizationId: string,
  productIds: string[],
  warehouseId?: string | null,
): Promise<ProductWarehouseStockSnapshot[]> {
  const uniqueProductIds = Array.from(new Set(productIds.filter(Boolean)));
  if (uniqueProductIds.length === 0) {
    return [];
  }

  let query = getSupabaseAdmin()
    .from("product_warehouse_stocks")
    .select("product_id, warehouse_id, stock_quantity, reserved_quantity")
    .eq("organization_id", organizationId)
    .in("product_id", uniqueProductIds);

  if (warehouseId) {
    query = query.eq("warehouse_id", warehouseId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message ?? "Failed to load warehouse stock.");
  }

  return ((data ?? []) as WarehouseStockRow[]).map((row) => ({
    productId: row.product_id,
    reservedQuantity: toNumber(row.reserved_quantity),
    stockQuantity: toNumber(row.stock_quantity),
    warehouseId: row.warehouse_id,
  }));
}

export function createWarehouseStockMap(
  rows: ProductWarehouseStockSnapshot[],
): Map<string, ProductWarehouseStockSnapshot[]> {
  const map = new Map<string, ProductWarehouseStockSnapshot[]>();

  for (const row of rows) {
    const current = map.get(row.productId) ?? [];
    current.push(row);
    map.set(row.productId, current);
  }

  return map;
}

export function getWarehouseStockQuantity(
  rows: ProductWarehouseStockSnapshot[] | undefined,
  warehouseId: string | null | undefined,
  fallbackQuantity: number,
): number {
  if (!warehouseId) {
    return fallbackQuantity;
  }

  const match = rows?.find((row) => row.warehouseId === warehouseId);
  return match ? match.stockQuantity : fallbackQuantity;
}

export function getWarehouseAvailableStockQuantity(
  rows: ProductWarehouseStockSnapshot[] | undefined,
  warehouseId: string | null | undefined,
  fallbackStockQuantity: number,
  fallbackReservedQuantity = 0,
): number {
  if (!warehouseId) {
    return Math.max(0, fallbackStockQuantity - fallbackReservedQuantity);
  }

  const match = rows?.find((row) => row.warehouseId === warehouseId);
  if (!match) {
    return Math.max(0, fallbackStockQuantity - fallbackReservedQuantity);
  }

  return Math.max(0, match.stockQuantity - match.reservedQuantity);
}
