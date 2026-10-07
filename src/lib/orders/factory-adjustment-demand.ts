type FactoryDemandSheet = {
  warehouseName?: string;
  products: Array<{ id: string }>;
  qty: number[][];
};

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
