import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
import { fitBillingBahtText, fitBillingTotalFontSize } from "./billing-baht-text.ts";

test("keeps ordinary baht text on one readable line with larger font", () => {
  const text = "(หนึ่งหมื่นสามพันแปดร้อยหกสิบบาทถ้วน)";
  const fitted = fitBillingBahtText(text);

  assert.deepEqual(fitted.lines, [text]);
  assert.ok(fitted.fontSizePt >= 11);
});

test("keeps long baht text strictly on one line and scales font size down", () => {
  const text = `(${"หนึ่งล้าน".repeat(10)}บาทถ้วน)`;
  const fitted = fitBillingBahtText(text);

  assert.equal(fitted.lines.length, 1);
  assert.equal(fitted.lines[0], text);
  assert.ok(fitted.fontSizePt < 11);
  assert.ok(fitted.fontSizePt >= 4.5);
});

test("does not split Thai combining marks from their base character", () => {
  const text = `(โบตั๋น${"หนึ่งล้าน".repeat(8)}บาทถ้วน)`;
  const fitted = fitBillingBahtText(text);

  assert.equal(fitted.lines[0], text);
  assert.equal(fitted.lines[0].includes("๋"), true);
});

test("fits numeric total amount without overflowing cell", () => {
  assert.equal(fitBillingTotalFontSize("1,250.00"), 16.5);
  assert.equal(fitBillingTotalFontSize("15,000,000.00"), 16.5);
  assert.ok(fitBillingTotalFontSize("1,500,000,000.00") <= 16.5);
});

