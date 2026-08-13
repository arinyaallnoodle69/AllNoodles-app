import assert from "node:assert/strict";
import test from "node:test";
import { generateSequentialReceiptNumbers } from "./receipt-number-sequence.ts";

test("generates a distinct receipt number for every supplier group", async () => {
  let lastNumber = 0;
  const generateNext = async () => {
    const observed = lastNumber;
    await new Promise((resolve) => setTimeout(resolve, 1));
    lastNumber = observed + 1;
    return `RCV260813${String(lastNumber).padStart(2, "0")}`;
  };

  const numbers = await generateSequentialReceiptNumbers(3, generateNext);

  assert.deepEqual(numbers, ["RCV26081301", "RCV26081302", "RCV26081303"]);
});
