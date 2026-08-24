import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("successful manual-order save does not block on a full route refresh", async () => {
  const source = await readFile(new URL("./create-order-modal.tsx", import.meta.url), "utf8");
  const submitFlow = source.slice(
    source.indexOf("function handleSubmit()"),
    source.indexOf("const totalAmount =", source.indexOf("function handleSubmit()")),
  );

  assert.doesNotMatch(submitFlow, /router\.refresh\(\)/);
});
