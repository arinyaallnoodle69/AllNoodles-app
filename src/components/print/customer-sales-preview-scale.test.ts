import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
import { getCustomerSalesPreviewSize } from "./customer-sales-preview-scale.ts";

test("fits an A4 page inside a narrow mobile preview without clipping", () => {
  assert.deepEqual(getCustomerSalesPreviewSize(360, 794, 1123), {
    scale: 360 / 794,
    width: 360,
    height: 1123 * (360 / 794),
  });
});

test("does not enlarge an A4 page beyond its natural size", () => {
  assert.deepEqual(getCustomerSalesPreviewSize(1000, 794, 1123), {
    scale: 1,
    width: 794,
    height: 1123,
  });
});
