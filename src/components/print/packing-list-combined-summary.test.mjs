import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { paginateCombinedSummary } from "./packing-list-pagination.ts";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
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
test("final noodle sheet includes main-only, noodle-only and shared products, excluding other vehicles", () => {
  const tables = summaries(fixture());
  assert.equal(tables.length, 1);
  assert.ok(tables[0].includes("รวมรถกรุงเทพ + รถกรุงเทพบะหมี่"));
  for (let index = 0; index < 4; index++) assert.ok(tables[0].includes(`>P${index}<`));
  assert.deepEqual([...tables[0].matchAll(/class="packing-number[^\"]*">([^<]+)/g)].map((match) => Number(match[1])), [7, 5, 4, 4]);
});
test("summary is printed once after all store pages and includes all product chunks", () => {
  const tables = summaries(fixture(60, 101));
  assert.equal(tables.length, 3);
  assert.equal(tables.join("").match(/class="packing-col packing-col--product/g).length, 101);
  assert.ok(tables.join("").includes(">P100<"));
});
test("no Bangkok noodle orders means no extra summary", () => {
  const data = fixture();
  data.stores.forEach((store) => { store.packingListGroup = "default"; });
  assert.deepEqual(summaries(data), []);
});
test("main Bangkok sheet keeps its own total and combined totals appear only in the noodle summary", () => {
  const html = renderToStaticMarkup(createElement(PackingListLayout, { data: fixture() }));
  const sections = [...html.matchAll(/<section[\s\S]*?<\/section>/g)].map((match) => match[0]);
  assert.ok(sections[0].includes("packing-table__total-row"));
  assert.ok(!sections[0].includes("packing-table__total-row--combined"));
  assert.equal(sections.filter((section) => section.includes("packing-table__total-row--combined")).length, 1);
  assert.ok(sections[1].includes("packing-table--combined-summary"));
});
test("summary overflow continues on full-size pages without losing or duplicating products", () => {
  const indices = Array.from({ length: 251 }, (_, index) => index);
  const pages = paginateCombinedSummary(indices, 50, 20, 33.8, 146);
  assert.deepEqual(pages.map((page) => page.length), [0, 4, 2]);
  assert.deepEqual(pages.flat(2), indices);
});
