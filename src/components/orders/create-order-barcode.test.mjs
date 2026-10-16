import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

test("cart permits the same product/unit in both packaging types and merges only matching packaging", () => {
  const source = readFileSync(new URL("./create-order-modal.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("modal.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "addManyToCart") declaration = node.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const compiled = ts.transpileModule(declaration, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  let cart = [];
  const selection = { product: { id: "p", name: "ผัดไท" }, unitId: "u", unitLabel: "กก.", baseQty: 1, quantity: 10, minOrderQty: 1, stepOrderQty: null, unitPrice: 100 };
  const invoke = (barcodeMode, quantity) => {
    const dependencies = { customerId: "ANS109", replacementMode: false, barcodeMode, reserveMode: false, setCart: update => { cart = update(cart); }, normalizeToRule: value => value, role: "member", setPriceMap() {} };
    const add = new Function(...Object.keys(dependencies), `${compiled};return addManyToCart;`)(...Object.values(dependencies));
    add([{ ...selection, quantity }]);
  };
  invoke(false, 10); invoke(true, 6); invoke(true, 2);
  assert.equal(cart.length, 2);
  assert.equal(cart.find(item => item.isBarcode).quantity, 8);
  assert.equal(cart.find(item => !item.isBarcode).quantity, 10);
});

test("barcode SKU allowlist agrees with the database guard", () => {
  const configuration = readFileSync(new URL("../../lib/orders/barcode-packaging.ts", import.meta.url), "utf8");
  const sql = readFileSync(new URL("../../../supabase/migrations/20261016043954_remove_anp054_barcode_packaging.sql", import.meta.url), "utf8");
  const expected = ["ANP137", "ANP138", "ANP139", "ANP140", "ANP146", "ANP115", "ANP229", "ANP119", "ANP136", "ANP088", "ANP087", "ANP052", "ANP109", "ANP097"].sort();
  assert.deepEqual([...configuration.matchAll(/ANP\d+/g)].map(match => match[0]).sort(), expected);
  assert.deepEqual([...sql.match(/p\.sku in \(([^)]+)\)/)[1].matchAll(/ANP\d+/g)].map(match => match[0]).sort(), expected);
});

test("tools menu flips above the trigger when the totals footer would cover it", () => {
  const source = readFileSync(new URL("./create-order-modal.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("modal.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect" && node.arguments[0]?.getText(ast).includes("positionMenu")) callback = node.arguments[0].getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const menu = { style: {}, getBoundingClientRect: () => ({ bottom: 600 }) };
  let footerTop = 500, resize;
  const dependencies = { toolsOpen: true, toolsMenuRef: { current: menu }, document: { querySelector: () => ({ getBoundingClientRect: () => ({ top: footerTop }) }) }, window: { innerHeight: 700, addEventListener: (_name, callback) => { resize = callback; }, removeEventListener: () => { resize = undefined; } } };
  const compiled = ts.transpileModule(`const effect = ${callback};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const cleanup = new Function(...Object.keys(dependencies), `${compiled};return effect();`)(...Object.values(dependencies));
  assert.equal(menu.style.top, "auto");
  assert.equal(menu.style.bottom, "calc(100% + 0.5rem)");
  footerTop = 700; resize();
  assert.equal(menu.style.top, "");
  cleanup();
  assert.equal(resize, undefined);
});
