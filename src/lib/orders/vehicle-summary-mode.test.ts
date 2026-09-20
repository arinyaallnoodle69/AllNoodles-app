import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
import { resolveVehicleSummaryProductMode } from "./vehicle-summary-mode.ts";

test("classifies a product from its order warehouse instead of its product kind or another warehouse", () => {
  const modes = new Map([
    ["ANP128:bangkok", "stock"],
    ["ANP128:province", "fresh"],
  ]);

  assert.equal(resolveVehicleSummaryProductMode("ANP128", "bangkok", modes), "stock");
  assert.equal(resolveVehicleSummaryProductMode("ANP128", "province", modes), "fresh");
  assert.equal(resolveVehicleSummaryProductMode("ANP128", null, modes), "stock");
});
