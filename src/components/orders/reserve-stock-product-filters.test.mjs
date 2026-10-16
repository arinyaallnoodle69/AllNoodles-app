import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(file, mocks) {
  const loaded = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", source)(name => mocks[name] ?? require(name), loaded, loaded.exports);
  return loaded.exports;
}
function harness() {
  const state = [];
  let cursor = 0;
  function Filters() { return null; }
  const { ReserveStockProductFilters } = load("./reserve-stock-product-filters.tsx", {
    react: { ...React, useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => state[i] = value]; } },
    "@/components/settings/product-factory-brand-filters": { ProductFactoryBrandFilters: Filters },
  });
  return props => { cursor = 0; const tree = ReserveStockProductFilters(props); return { filters: tree.props.children[0].props, html: renderToStaticMarkup(tree) }; };
}
const item = (id, brand) => ({ id, brand, content: React.createElement("article", null, id) });

test("reserve filters preserve product order, configured brand order and reset all brands", () => {
  const render = harness();
  const props = { factoryName: "โรงงานมังกร", brands: ["กระทุ่มแบน", "มังกร"], items: [item("ANP156", "มังกร"), item("ANP157", "กระทุ่มแบน"), item("ANP158", "มังกร")] };
  let ui = render(props);
  assert.deepEqual(ui.filters.factoryOptions, ["โรงงานมังกร"]);
  assert.deepEqual(ui.filters.brandOptions, ["กระทุ่มแบน", "มังกร"]);
  ui.filters.onBrandSelect("มังกร");
  ui = render(props);
  assert.match(ui.html, /ANP156.*ANP158/);
  assert.doesNotMatch(ui.html, /ANP157/);
  ui.filters.onFactorySelect("โรงงานมังกร");
  assert.equal(render(props).filters.selectedBrand, "มังกร");
  ui.filters.onFactorySelect("__all__");
  assert.match(render(props).html, /ANP156.*ANP157.*ANP158/);
});

test("province stays limited to its supplied products; missing brands and empty lists work", () => {
  const render = harness();
  const props = { factoryName: "A.ดอกบัว", brands: [], items: [item("lotus", "ดอกบัว"), item("unbranded", "")] };
  let ui = render(props);
  ui.filters.onBrandSelect("ดอกบัว");
  assert.doesNotMatch(render(props).html, /unbranded/);
  ui = render({ ...props, items: [item("unbranded", "")] });
  assert.equal(ui.filters.selectedBrand, "__all__");
  assert.match(ui.html, /unbranded/);
  ui = render({ ...props, items: [] });
  assert.deepEqual(ui.filters.factoryOptions, []);
  assert.match(ui.html, /ไม่พบสินค้า/);
});

test("shared tabs expose both filters, selection and horizontal scrolling on desktop/mobile", () => {
  const calls = [];
  const { ProductFactoryBrandFilters } = load("../settings/product-factory-brand-filters.tsx", {
    react: { ...React, useState: () => [null, () => {}], useEffect: () => {}, useRef: () => ({ current: null }) },
  });
  const props = { factoryOptions: ["A.ดอกบัว"], brandOptions: ["ดอกบัว"], selectedFactory: "A.ดอกบัว", selectedBrand: "__all__", onFactorySelect: value => calls.push(value), onBrandSelect: value => calls.push(value) };
  function buttons(tree) { return !tree || typeof tree !== "object" ? [] : [...(tree.type === "button" ? [tree] : []), ...React.Children.toArray(tree.props?.children).flatMap(buttons)]; }
  for (const variant of [undefined, "desktop", "mobile"]) {
    const tree = ProductFactoryBrandFilters({ ...props, variant });
    const html = renderToStaticMarkup(tree);
    assert.match(html, /เปิดรายการโรงงานทั้งหมด/);
    assert.match(html, /เปิดรายการแบรนด์ทั้งหมด/);
    assert.match(html, /overflow-x-auto/);
    const factory = buttons(tree).find(b => b.props.children?.[0] === "A.ดอกบัว");
    assert.equal(factory.props["aria-pressed"], true);
    let scrolled = false;
    factory.props.onClick({ currentTarget: { offsetLeft: 100, offsetWidth: 40, parentElement: { offsetLeft: 0, clientWidth: 200, scrollTo() { scrolled = true; } } } });
    assert.equal(scrolled, true);
  }
  assert.deepEqual(calls, ["A.ดอกบัว", "A.ดอกบัว", "A.ดอกบัว"]);
});

test("filter label opens an accessible picker and selecting an option closes it", () => {
  let drawer = null;
  const calls = [];
  const { ProductFactoryBrandFilters } = load("../settings/product-factory-brand-filters.tsx", {
    react: { ...React, useState: () => [drawer, value => drawer = value], useEffect: () => {}, useRef: () => ({ current: null }) },
    "react-dom": { createPortal: children => children },
  });
  const props = { factoryOptions: ["A.ดอกบัว"], brandOptions: ["ดอกบัว"], selectedFactory: "__all__", selectedBrand: "__all__", onFactorySelect: value => calls.push(value), onBrandSelect() {} };
  function nodes(tree, predicate) { return !tree || typeof tree !== "object" ? [] : [...(predicate(tree) ? [tree] : []), ...React.Children.toArray(tree.props?.children).flatMap(child => nodes(child, predicate))]; }
  const previous = globalThis.document;
  globalThis.document = { body: {} };
  try {
    let tree = ProductFactoryBrandFilters(props);
    nodes(tree, n => n.props?.["aria-label"] === "เปิดรายการโรงงานทั้งหมด")[0].props.onClick();
    tree = ProductFactoryBrandFilters(props);
    assert.equal(nodes(tree, n => n.props?.role === "dialog")[0].props["aria-modal"], "true");
    const picker = nodes(tree, n => n.props?.role === "dialog")[0];
    nodes(picker, n => n.type === "button" && n.props.children?.[0] === "A.ดอกบัว")[0].props.onClick();
    assert.deepEqual(calls, ["A.ดอกบัว"]);
    assert.equal(drawer, null);
  } finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
});
