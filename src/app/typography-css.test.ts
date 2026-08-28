import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("desktop typography keeps browser subpixel rendering and readable muted text", async () => {
  const css = await readFile(new URL("./globals.css", import.meta.url), "utf8");

  assert.match(css, /-webkit-font-smoothing:\s*auto/);
  assert.match(css, /-moz-osx-font-smoothing:\s*auto/);
  assert.match(css, /--ui-muted-foreground:\s*#475467/);
  assert.match(css, /color:\s*var\(--ui-muted-foreground\)\s*!important/);
});
