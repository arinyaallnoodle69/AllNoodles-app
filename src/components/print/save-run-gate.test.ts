import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types test runner requires the explicit TypeScript extension.
import { createSaveRunGate } from "./save-run-gate.ts";

test("cancelled image save runs stay cancelled after a new run starts", () => {
  const gate = createSaveRunGate();
  const firstRun = gate.start();

  assert.equal(gate.isActive(firstRun), true);

  gate.cancel();
  assert.equal(gate.isActive(firstRun), false);

  const secondRun = gate.start();
  assert.equal(gate.isActive(firstRun), false);
  assert.equal(gate.isActive(secondRun), true);
});
