export type FreshReserveAdjustment = {
  adjustedQuantity: number;
  orderDemand: number;
  remainingQuantity: number;
  reserveQuantity: number;
};

export function calculateFreshReserve(adjustment: FreshReserveAdjustment | null, currentDemand: number) {
  if (!adjustment) return { available: 0, overCapacity: 0, percent: 0, used: 0 };

  const available = Math.max(0, adjustment.adjustedQuantity + adjustment.remainingQuantity - currentDemand);
  const overCapacity = Math.max(0, currentDemand - adjustment.adjustedQuantity - adjustment.remainingQuantity);
  return {
    available,
    overCapacity,
    percent: adjustment.reserveQuantity > 0 ? Math.max(0, Math.min(100, available / adjustment.reserveQuantity * 100)) : 0,
    used: Math.max(0, currentDemand - adjustment.orderDemand),
  };
}
