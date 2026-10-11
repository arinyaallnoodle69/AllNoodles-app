import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { paginateCombinedSummary } from "../../src/components/print/packing-list-pagination.ts";

const require = createRequire(import.meta.url);
const root = resolve(process.cwd(), "src");
function loadComponent(path) {
  const loaded = { exports: {} };
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const localRequire = (name) => {
    if (!name.startsWith(".") && !name.startsWith("@/")) return require(name);
    const base = name.startsWith("@/") ? resolve(root, name.slice(2)) : resolve(dirname(path), name);
    return loadComponent(`${base}.ts`);
  };
  new Function("require", "module", "exports", compiled)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}
const { PackingListLayout } = loadComponent(resolve(root, "components/print/packing-list-layout.tsx"));
function fixture(storeCount = 2, productCount = 4) {
  return {
    date: "2026-10-09", dateLabel: "9 ตุลาคม 2569", organizationName: "All Noodles",
    vehicles: [{ id: "bkk", name: "รถกรุงเทพ" }, { id: "province", name: "รถต่างจังหวัด" }],
    stores: Array.from({ length: storeCount + 1 }, (_, index) => ({
      id: `store${index}`, name: `ร้าน${index}`, vehicleId: index === storeCount ? "province" : "bkk",
      vehicleName: index === storeCount ? "รถต่างจังหวัด" : "รถกรุงเทพ",
      packingListGroup: index === 0 ? "default" : "bkk_noodle",
      totalWeightGrams: 1000, missingWeightProductIds: [],
    })),
    products: Array.from({ length: productCount }, (_, index) => ({
      key: `sku${index}||กก.`, sku: `sku${index}`, name: `P${index}`, unit: "กก.", category: "เส้น", brand: "", icon: "",
    })),
    qty: Array.from({ length: productCount }, (_, index) => Array.from({ length: storeCount + 1 }, (_, store) =>
      store === storeCount ? 999 : index === 0 ? (store === 0 ? 7 : 0) : index === 1 ? (store === 0 ? 0 : 5) : 2)),
  };
}
function summaries(data) {
  const html = renderToStaticMarkup(createElement(PackingListLayout, { data }));
  return [...html.matchAll(/<table class="packing-table packing-table--combined-summary"[\s\S]*?<\/table>/g)].map((match) => match[0]);
}

const data=fixture(4,24);data.products.forEach((p,i)=>{p.name='สินค้า '+(i+1);p.category=i<8?'บะหมี่':i<16?'เส้นเล็ก':'เส้นใหญ่';});require('node:fs').writeFileSync('output/packing-order/preview.html','<!doctype html><meta charset="utf-8"><title>ตัวอย่างทดสอบใบออเดอร์</title>'+renderToStaticMarkup(createElement(PackingListLayout,{data})));