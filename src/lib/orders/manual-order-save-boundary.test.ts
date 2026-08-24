import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
import { persistManualOrderThenSchedule } from "./manual-order-save-boundary.ts";

test("returns the persisted order without waiting for reconciliation", async () => {
  let scheduledTask: (() => Promise<void>) | null = null;
  let finishReconciliation: (() => void) | null = null;
  const reconciliationFinished = new Promise<void>((resolve) => {
    finishReconciliation = resolve;
  });

  const result = await persistManualOrderThenSchedule({
    persist: async () => ({ orderId: "order-1", orderNumber: "OD001" }),
    reconcile: async () => reconciliationFinished,
    schedule: (task) => {
      scheduledTask = task;
    },
  });

  assert.deepEqual(result, { orderId: "order-1", orderNumber: "OD001" });
  assert.ok(scheduledTask, "reconciliation must be scheduled after persistence");

  let settled = false;
  const runningTask = (scheduledTask as () => Promise<void>)().then(() => {
    settled = true;
  });
  await Promise.resolve();
  assert.equal(settled, false, "foreground result must not await reconciliation");

  finishReconciliation?.();
  await runningTask;
  assert.equal(settled, true);
});

test("does not schedule reconciliation when persistence fails", async () => {
  let scheduled = false;

  await assert.rejects(
    persistManualOrderThenSchedule({
      persist: async () => {
        throw new Error("write failed");
      },
      reconcile: async () => undefined,
      schedule: () => {
        scheduled = true;
      },
    }),
    /write failed/,
  );

  assert.equal(scheduled, false);
});
