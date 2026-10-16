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

const data=fixture(4,44);data.products.forEach((p,i)=>{p.name='สินค้า '+(i+1);p.category=i<16?'บะหมี่':i<30?'เส้นเล็ก':'เส้นใหญ่';});
data.stores[0].barcodeProductKeys=data.products.filter((_,i)=>i%2===0).map(p=>p.key);data.stores[0].name='ซุปเปอร์ชิพ';
data.qty.forEach((row,i)=>row[0]=[20,100,1000,10000,1234.5][i%5]);
const pageSource=readFileSync('src/app/orders/packing-list/page.tsx','utf8');
const projectionStart=pageSource.indexOf('        stores: stores.map((store) => ({');
const projectionEnd=pageSource.indexOf('        products: products.map',projectionStart);
const projection=pageSource.slice(projectionStart,projectionEnd).trim().replace(/^stores:\s*/, '').replace(/,$/,'');
data.stores=new Function('stores',`return (${projection});`)(data.stores);
require('node:assert/strict').ok(data.stores[0].barcodeProductKeys.length>0);
require('node:fs').writeFileSync('output/reserve-history/barcode-packing.html','<!doctype html><meta charset="utf-8"><title>ทดสอบดอกจันบาร์โค้ด</title>'+renderToStaticMarkup(createElement(PackingListLayout,{data})));
