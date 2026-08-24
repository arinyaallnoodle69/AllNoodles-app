import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
import { isStockShortage } from "./stock-shortage.ts";

test("counts only negative available stock as a shortage", () => {
  assert.equal(isStockShortage(-1), true);
  assert.equal(isStockShortage(-0.01), true);
  assert.equal(isStockShortage(0), false);
  assert.equal(isStockShortage(1), false);
  assert.equal(isStockShortage(5), false);
});
