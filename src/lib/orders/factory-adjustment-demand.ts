type FactoryDemandSheet = {
  warehouseName?: string;
  products: Array<{ id: string }>;
  qty: number[][];
};

type FactoryProductMode = {
  mode: string;
  product_id: string;
  warehouse_id: string;
};

export function getBangkokFactoryProductMode<T extends FactoryProductMode>(
  productId: string,
  modes: T[],
  warehouseNameById: Map<string, string>,
) {
  return modes.find(
    (mode) =>
      mode.product_id === productId &&
      mode.mode === "fresh" &&
      warehouseNameById.get(mode.warehouse_id)?.trim() === "คลังกรุงเทพ",
  );
}

export function getBangkokFactoryAdjustmentDemand(sheets: FactoryDemandSheet[]): Map<string, number> {
  const demandByProductId = new Map<string, number>();
  for (const sheet of sheets) {
    if (sheet.warehouseName?.trim() !== "คลังกรุงเทพ") continue;
    sheet.products.forEach((product, index) => {
      const demand = (sheet.qty[index] ?? []).reduce((sum, quantity) => sum + Number(quantity ?? 0), 0);
      demandByProductId.set(product.id, (demandByProductId.get(product.id) ?? 0) + demand);
    });
  }
  return demandByProductId;
}
