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


const { readdirSync }=require("node:fs");
const { chromium }=require("C:/Users/Riew/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const roster=JSON.parse(readFileSync("output/packing-order/roster-today.json","utf8"));
const products=JSON.parse(readFileSync("output/packing-order/products-today.json","utf8"));
const items=roster.flatMap(r=>r.orders?.items||[]);
const productRows=products.flatMap(p=>[...new Set(items.filter(i=>i.sku===p.sku).map(i=>i.unit))].map(unit=>({key:p.sku+"||"+unit,sku:p.sku,name:p.print_name||p.name,unit,category:p.category||"",brand:p.brand||"",icon:p.icon||""})));
const data={date:"2026-10-11",dateLabel:"11 ตุลาคม 2569 เวลา 15:14 น.",organizationName:"อริยา พาณิชย์",vehicles:[{id:"bkk",name:"รถกรุงเทพ"}],
 stores:roster.map(r=>({id:r.code,name:r.name,packingListGroup:"bkk_noodle",vehicleId:"bkk",vehicleName:"รถกรุงเทพ",missingWeightProductIds:[],totalWeightGrams:Number(r.orders?.weight_kg||0)*1000,isStopped:!r.orders})),
 products:productRows,qty:productRows.map(p=>roster.map(r=>(r.orders?.items||[]).filter(i=>i.sku===p.sku&&i.unit===p.unit).reduce((sum,i)=>sum+Number(i.qty),0)))};
const css=readdirSync(".next/static/chunks").filter(f=>f.endsWith(".css")).map(f=>readFileSync(".next/static/chunks/"+f,"utf8")).join("\n");
const html=("<style>"+css+"</style>"+renderToStaticMarkup(createElement(PackingListLayout,{data}))).replaceAll("/fonts/angsana-new/angsab.woff","data:font/woff;base64,"+readFileSync("public/fonts/angsana-new/angsab.woff").toString("base64"));
const browser=await chromium.launch({headless:true,channel:"msedge"});
const page=await browser.newPage({viewport:{width:1400,height:1000}});
await page.setContent(html);await page.evaluate(()=>document.fonts.ready);
const measurements=await page.locator('.packing-sheet').evaluateAll(nodes=>nodes.map(n=>{
 const wrap=n.querySelector('.packing-table-wrap'),table=wrap.querySelector('table'),rows=[...table.tBodies[0].rows];
 return {rows:rows.map(r=>r.cells[0].textContent),tableHeight:table.getBoundingClientRect().height,wrapHeight:wrap.getBoundingClientRect().height,overflow:table.getBoundingClientRect().bottom-wrap.getBoundingClientRect().bottom,lastRowHeight:rows.at(-1).getBoundingClientRect().height,firstRowHeight:rows[0].getBoundingClientRect().height};
}));console.log(JSON.stringify({products:productRows.length,measurements}));
await browser.close();
assert.ok(measurements.every(m=>m.overflow<=0),"Today\'s roster has clipped rows");
