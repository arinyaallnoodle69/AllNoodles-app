import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
import { fitDeliveryItemFontSize } from "./delivery-note-font-fit.ts";

test("keeps ordinary delivery item names at the enlarged font size", () => {
  assert.equal(fitDeliveryItemFontSize("ANP157 เส้นใหญ่แผ่น ถุง"), 23);
});

test("shrinks only long delivery item names without becoming unreadable", () => {
  const longName = `ANP999 ${"ชื่อสินค้าที่ยาวมาก".repeat(5)}`;
  const fontSize = fitDeliveryItemFontSize(longName);

  assert.ok(fontSize < 23);
  assert.ok(fontSize >= 14.5);
});
