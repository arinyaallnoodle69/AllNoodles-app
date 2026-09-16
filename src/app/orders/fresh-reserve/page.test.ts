import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("mobile fresh-reserve page links back to orders while preserving the selected date", async () => {
  const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");

  assert.match(source, /href=\{`\/orders\/incoming\?date=\$\{date\}`\}/);
  assert.match(source, /aria-label="กลับหน้ารายการออเดอร์"/);
  assert.match(source, /lg:hidden/);
  assert.match(source, /sticky top-\[68px\] z-30/);
});
