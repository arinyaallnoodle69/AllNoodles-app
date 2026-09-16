import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("customer sales summary uses the bundled Angsana New font", async () => {
  const source = await readFile(new URL("./customer-sales-summary-layout.tsx", import.meta.url), "utf8");

  assert.match(source, /font-family:\s*"Angsana New Customer Sales"/);
  assert.match(source, /src:\s*url\("\/fonts\/angsana-new\/ANGSA\.woff"\)/);
  assert.match(source, /src:\s*url\("\/fonts\/angsana-new\/angsab\.woff"\)/);
  assert.doesNotMatch(source, /font-family:var\(--font-sarabun/);
});
