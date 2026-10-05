import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
import { fitBillingBahtText } from "./billing-baht-text.ts";

test("keeps ordinary baht text on one readable line", () => {
  const text = "(หนึ่งหมื่นสามพันแปดร้อยหกสิบบาทถ้วน)";
  const fitted = fitBillingBahtText(text);

  assert.deepEqual(fitted.lines, [text]);
  assert.ok(fitted.fontSizePt >= 11);
});

test("keeps every grapheme while balancing long baht text across two lines", () => {
  const text = `(${"หนึ่งล้าน".repeat(10)}บาทถ้วน)`;
  const fitted = fitBillingBahtText(text);

  assert.equal(fitted.lines.length, 2);
  assert.equal(fitted.lines.join(""), text);
  const segmenter = new Intl.Segmenter("th", { granularity: "grapheme" });
  const lineLengths = fitted.lines.map((line) => Array.from(segmenter.segment(line)).length);
  assert.ok(Math.abs(lineLengths[0] - lineLengths[1]) <= 1);
  assert.ok(fitted.fontSizePt >= 7.5 && fitted.fontSizePt <= 10.5);
});

test("does not split Thai combining marks from their base character", () => {
  const text = `(โบตั๋น${"หนึ่งล้าน".repeat(8)}บาทถ้วน)`;
  const fitted = fitBillingBahtText(text);

  assert.equal(fitted.lines.join(""), text);
  assert.equal(fitted.lines.some((line) => line.startsWith("๋")), false);
});
