export function isStockShortage(availableQuantity: number) {
  return Number.isFinite(availableQuantity) && availableQuantity < 0;
}
