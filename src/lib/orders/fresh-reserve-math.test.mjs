import assert from "node:assert/strict";
import test from "node:test";
import { calculateFreshReserve } from "./fresh-reserve-math.ts";

test("factory quantity and same-day reserve follow the agreed flow", () => {
  const originalDemand = 575;
  const remaining = 70;
  const wantedReserve = 300;
  const factoryQuantity = originalDemand + wantedReserve - remaining;

  assert.equal(factoryQuantity, 805);
  const afterLateOrder = calculateFreshReserve({
    adjustedQuantity: factoryQuantity,
    orderDemand: originalDemand,
    remainingQuantity: remaining,
    reserveQuantity: wantedReserve,
  }, 675);
  assert.deepEqual({ ...afterLateOrder, percent: Math.round(afterLateOrder.percent) }, { available: 200, overCapacity: 0, percent: 67, used: 100 });

  // A different date has no saved adjustment, so nothing carries forward.
  assert.deepEqual(calculateFreshReserve(null, 40), { available: 0, overCapacity: 0, percent: 0, used: 0 });

  assert.deepEqual(calculateFreshReserve({
    adjustedQuantity: 560,
    orderDemand: 575,
    remainingQuantity: 70,
    reserveQuantity: 55,
  }, 675), { available: 0, overCapacity: 45, percent: 0, used: 100 });
});
