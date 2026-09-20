export function resolveVehicleSummaryProductMode(
  productId: string,
  warehouseId: string | null,
  modeByProductWarehouse: ReadonlyMap<string, string>,
) {
  if (!warehouseId) return "stock" as const;
  return modeByProductWarehouse.get(`${productId}:${warehouseId}`) === "fresh"
    ? "fresh" as const
    : "stock" as const;
}
