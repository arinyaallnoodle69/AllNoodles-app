import assert from "node:assert/strict";
import test from "node:test";
import { getUnitWeightInput, parseUnitWeightGrams } from "./unit-weight.ts";

test("normalizes grams and kilograms to grams", () => {
  assert.equal(parseUnitWeightGrams("500", "g"), 500);
  assert.equal(parseUnitWeightGrams("1.25", "kg"), 1250);
  assert.equal(parseUnitWeightGrams("", "kg"), null);
  assert.equal(Number.isNaN(parseUnitWeightGrams("0", "g")), true);
});

test("chooses a convenient editing unit for stored grams", () => {
  assert.deepEqual(getUnitWeightInput(500), { unit: "g", value: "500" });
  assert.deepEqual(getUnitWeightInput(1250), { unit: "kg", value: "1.25" });
  assert.deepEqual(getUnitWeightInput(null), { unit: "g", value: "" });
});
