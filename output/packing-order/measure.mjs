import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

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


const { chromium } = require("C:/Users/Riew/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const browser=await chromium.launch({headless:true,channel:"msedge"});
const page=await browser.newPage({viewport:{width:1400,height:1000}});
let worstOverflow=-Infinity;
for(const count of [27,29,30,58]) {
 const data=fixture(count,20);data.stores.forEach(s=>s.packingListGroup="default"); data.products.forEach((p,i)=>p.category="หมวดสินค้าผลิตสด "+i);
 const html=renderToStaticMarkup(createElement(PackingListLayout,{data})).replaceAll("/fonts/angsana-new/angsab.woff", "data:font/woff;base64,"+readFileSync("public/fonts/angsana-new/angsab.woff").toString("base64"));
 await page.setContent(html);await page.evaluate(()=>document.fonts.ready);
 const measurements=await page.locator('.packing-sheet').evaluateAll(nodes=>nodes.map(n=>{
  const w=n.querySelector('.packing-table-wrap'),t=w.querySelector('table');
  return {rows:t.tBodies[0].rows.length,wrap:w.getBoundingClientRect().height,table:t.getBoundingClientRect().height,overflow:t.getBoundingClientRect().bottom-w.getBoundingClientRect().bottom};
 }));
 console.log(count,measurements); worstOverflow=Math.max(worstOverflow,...measurements.map(m=>m.overflow));
}

for (const productCount of [1,20,40,50,101,251]) {
 const data=fixture(60,productCount);data.qty=data.products.map((_,i)=>data.stores.map((_,s)=>s===0 ? [9,99,999,9999,99999,1230,1090,150,12.5,999999,999.999,1000000000][i%12] : 0));data.products.forEach((p,i)=>p.category="หมวดสินค้าผลิตสด "+i);
 await page.setContent(renderToStaticMarkup(createElement(PackingListLayout,{data})).replaceAll("/fonts/angsana-new/angsab.woff", "data:font/woff;base64,"+readFileSync("public/fonts/angsana-new/angsab.woff").toString("base64")));
 await page.evaluate(()=>document.fonts.ready);
 const overflows=await page.locator('.packing-table-wrap').evaluateAll(nodes=>nodes.map(w=>Math.max(...[...w.querySelectorAll('table')].map(t=>t.getBoundingClientRect().bottom))-w.getBoundingClientRect().bottom));
 const numberOverflows=await page.locator('.packing-cell--total .packing-number').evaluateAll(nodes=>nodes.flatMap(n=>{
  const range=document.createRange();range.selectNodeContents(n);const text=range.getBoundingClientRect(),cell=n.parentElement.getBoundingClientRect();
  const context=document.createElement("canvas").getContext("2d");const style=getComputedStyle(n);context.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;const metrics=context.measureText(n.textContent);const baseline=text.top+metrics.fontBoundingBoxAscent;const inkTop=baseline-metrics.actualBoundingBoxAscent,inkBottom=baseline+metrics.actualBoundingBoxDescent;
  return inkTop<cell.top || inkBottom>cell.bottom || text.left<cell.left+1 || text.right>cell.right-1 ? [{value:n.textContent,width:text.width,cellWidth:cell.width,left:text.left-cell.left,right:cell.right-text.right}] : [];
 }));
 assert.deepEqual(numberOverflows,[],`Summary numbers overflow with ${productCount} products`);
 console.log("Mixed Bangkok sheets",productCount,Math.max(...overflows));worstOverflow=Math.max(worstOverflow,...overflows);
}
await page.emulateMedia({media:"print"});
const printOverflow=await page.locator('.packing-table-wrap').evaluateAll(nodes=>nodes.map(w=>Math.max(...[...w.querySelectorAll('table')].map(t=>t.getBoundingClientRect().bottom))-w.getBoundingClientRect().bottom));
 const printNumberOverflows=await page.locator('.packing-cell--total .packing-number').evaluateAll(nodes=>nodes.flatMap(n=>{
  const range=document.createRange();range.selectNodeContents(n);const text=range.getBoundingClientRect(),cell=n.parentElement.getBoundingClientRect();
  const context=document.createElement("canvas").getContext("2d");const style=getComputedStyle(n);context.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;const metrics=context.measureText(n.textContent);const baseline=text.top+metrics.fontBoundingBoxAscent;const inkTop=baseline-metrics.actualBoundingBoxAscent,inkBottom=baseline+metrics.actualBoundingBoxDescent;
  return inkTop<cell.top || inkBottom>cell.bottom || text.left<cell.left+1 || text.right>cell.right-1 ? [{value:n.textContent,width:text.width,cellWidth:cell.width,left:text.left-cell.left,right:cell.right-text.right}] : [];
 }));
 assert.deepEqual(printNumberOverflows,[],`Summary numbers overflow with print products`);
console.log("Print overflow",Math.max(...printOverflow));worstOverflow=Math.max(worstOverflow,...printOverflow);
await browser.close();
assert.ok(worstOverflow <= 0, `Last row clipped by ${worstOverflow}px`);

