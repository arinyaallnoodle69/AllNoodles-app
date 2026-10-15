import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

for (const reserve of [false, true]) test(`combined delivery PDF separates ${reserve ? "reserve" : "barcode"} rows and sums money once`, async () => {
  const source = readFileSync(new URL("./print.ts", import.meta.url), "utf8");
  const start = source.indexOf("export async function getMergedDeliveryPrintData");
  const end = source.indexOf("export async function getDeliveryNotePrintData", start);
  const compiled = ts.transpileModule(source.slice(start, end).replace("export ", ""), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const item = (separate, quantity) => ({ id: "p", productSku: "ANP137", productName: "ผัดไท", saleUnitLabel: "กก.", isBarcode: !reserve && separate, isReserve: reserve && separate, quantityDelivered: quantity, unitPrice: 100, lineTotal: quantity * 100 });
  const parts = { normal: { deliveryNumber: "DN1", totalAmount: 1000, items: [item(false, 10)] }, barcode: { deliveryNumber: "DN2", totalAmount: 600, items: [item(true, 6)] } };
  const merge = new Function("getDeliveryNotePrintData", "sortDeliveryItems", `${compiled};return getMergedDeliveryPrintData;`)(async (_org, id) => parts[id], items => items);
  const result = await merge("org", ["normal", "barcode"]);
  assert.equal(result.items.length, 2);
  assert.deepEqual(result.items.map(item => item.quantityDelivered), [10, 6]);
  assert.equal(result.totalAmount, 1600);
});
