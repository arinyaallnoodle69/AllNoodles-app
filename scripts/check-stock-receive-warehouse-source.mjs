import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync("src/components/settings/stock-receive-form.tsx", "utf8");

assert.match(
  source,
  /getWarehouseOnHandQuantity\(p, warehouseId\)/,
  "The receive-stock balance must come from the selected warehouse stock.",
);
assert.doesNotMatch(
  source,
  /\{p\.onHandQuantity\}\s*\{p\.unit\}/,
  "The receive-stock balance must not display the legacy aggregate product stock.",
);
