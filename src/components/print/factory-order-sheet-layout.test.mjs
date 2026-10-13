import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const loaded = { exports: {} };
const compiled = ts.transpileModule(readFileSync(new URL("./factory-order-sheet-layout.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
new Function("require", "module", "exports", compiled)(createRequire(import.meta.url), loaded, loaded.exports);
function weights(products, qty) {
  const html = renderToStaticMarkup(createElement(loaded.exports.FactoryOrderSheetLayout, { data: {
    organizationName: "All Noodles", dateLabel: "12 ตุลาคม 2569", products,
    vehicles: [{ id: "total", name: "จำนวนรวม" }], qty,
  } }));
  return [...html.matchAll(/class="factory-order-weight"[^>]*>(.*?)<\/div>/g)].map(match => match[1]);
}
const product = (id, unit, unitWeightGrams) => ({ id, name: `สินค้า ${id} 5 โล`, sku: id, unit, unitWeightGrams, imageUrl: null });

test("uses final displayed quantities and does not multiply kilogram products twice", () => {
  const [weight] = weights([product("kg", "กก.", 5000), product("pack", "แพ็ก", 500)], [[40], [3]]);
  assert.match(weight, /41.5/);
  assert.match(weight, /น้ำหนักรวมใบนี้/);
});

test("each printed page totals only its own rows", () => {
  const result = weights(Array.from({ length: 16 }, (_, i) => product(String(i), "กก.", null)),
    Array.from({ length: 16 }, (_, i) => [i === 15 ? 7 : 1]));
  assert.equal(result.length, 2);
  assert.match(result[0], />15</);
  assert.match(result[1], />7</);
});

test("missing unit weights are visible and never presented as a complete total", () => {
  const [weight] = weights([product("kg", "กก.", null), product("bag", "ถุง", null)], [[10], [2]]);
  assert.match(weight, /เฉพาะที่คำนวณได้/);
  assert.match(weight, /ยังไม่ตั้งน้ำหนัก 1 รายการ/);
});
