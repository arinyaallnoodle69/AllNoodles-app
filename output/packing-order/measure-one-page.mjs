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


const { chromium } = require("C:/Users/Riew/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const browser=await chromium.launch({headless:true,channel:"msedge"});
const page=await browser.newPage({viewport:{width:1400,height:1000}});
let worstOverflow=-Infinity;
for(const count of [27]) {
 const data=fixture(count,20);data.stores.forEach((s,i)=>s.packingListGroup=i===26 ? "bkk_noodle" : "default"); data.products.forEach((p,i)=>p.category="หมวดสินค้าผลิตสด "+i);
 const html=renderToStaticMarkup(createElement(PackingListLayout,{data})).replaceAll("/fonts/angsana-new/angsab.woff", "data:font/woff;base64,"+readFileSync("public/fonts/angsana-new/angsab.woff").toString("base64"));
 await page.setContent(html);await page.evaluate(()=>document.fonts.ready);
 const measurements=await page.locator('.packing-sheet').evaluateAll(nodes=>nodes.map(n=>{
  const w=n.querySelector('.packing-table-wrap'),t=w.querySelector('table');
  return {rows:t.tBodies[0].rows.length,wrap:w.getBoundingClientRect().height,table:t.getBoundingClientRect().height,overflow:t.getBoundingClientRect().bottom-w.getBoundingClientRect().bottom};
 }));
 console.log(count,measurements); worstOverflow=Math.max(worstOverflow,...measurements.map(m=>m.overflow));
}

for (const productCount of [1,20,50,101,251]) {
 const data=fixture(60,productCount);data.products.forEach((p,i)=>p.category="หมวดสินค้าผลิตสด "+i);
 await page.setContent(renderToStaticMarkup(createElement(PackingListLayout,{data})).replaceAll("/fonts/angsana-new/angsab.woff", "data:font/woff;base64,"+readFileSync("public/fonts/angsana-new/angsab.woff").toString("base64")));
 await page.evaluate(()=>document.fonts.ready);
 const overflows=await page.locator('.packing-table-wrap').evaluateAll(nodes=>nodes.map(w=>Math.max(...[...w.querySelectorAll('table')].map(t=>t.getBoundingClientRect().bottom))-w.getBoundingClientRect().bottom));
 console.log("Mixed Bangkok sheets",productCount,Math.max(...overflows));worstOverflow=Math.max(worstOverflow,...overflows);
}
await page.emulateMedia({media:"print"});
const printOverflow=await page.locator('.packing-table-wrap').evaluateAll(nodes=>nodes.map(w=>Math.max(...[...w.querySelectorAll('table')].map(t=>t.getBoundingClientRect().bottom))-w.getBoundingClientRect().bottom));
console.log("Print overflow",Math.max(...printOverflow));worstOverflow=Math.max(worstOverflow,...printOverflow);
await browser.close();
assert.ok(worstOverflow <= 0, `Last row clipped by ${worstOverflow}px`);

