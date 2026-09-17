import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("delivery note typography fits the fixed A4 header and table", async () => {
  const source = await readFile(new URL("./delivery-note-layout.tsx", import.meta.url), "utf8");

  assert.match(source, /\.dn-title-box\s*\{[^}]*font-size:\s*16pt;[^}]*line-height:\s*1\.2;/s);
  assert.match(source, /\.dn-meta-label\s*\{[^}]*font-size:\s*11pt;/s);
  assert.match(source, /\.dn-meta-value\s*\{[^}]*font-size:\s*12pt;[^}]*white-space:\s*nowrap;/s);
  assert.match(source, /\.dn-table\s*\{[^}]*font-size:\s*14pt;/s);
  assert.match(source, /\.dn-table th\s*\{[^}]*font-size:\s*12\.5pt;[^}]*white-space:\s*nowrap;/s);
  assert.match(source, /\.dn-col-name\s*\{[^}]*white-space:\s*nowrap;[^}]*overflow:\s*visible;/s);
  assert.match(source, /\.dn-col-index\s*\{\s*width:\s*12mm;/s);
  assert.match(source, /\.dn-col-unit\s*\{\s*width:\s*14mm;/s);
  assert.doesNotMatch(source, /\.dn-col-name\s*\{[^}]*text-overflow:\s*ellipsis;/s);
  assert.doesNotMatch(source, /item\.productSku\}\{["']\\u00a0/);
  assert.ok(source.includes('`${item.productSku} ${item.productName}`'));
  assert.doesNotMatch(source, /className="dn-item-sku"/);
  assert.match(source, /\.dn-notes span\s*\{[^}]*flex-shrink:\s*0;[^}]*white-space:\s*nowrap;/s);
});
