import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("./create-order-modal.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("modal.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function effect(needle, dependencies) {
  let callback;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect" && node.arguments[0]?.getText(ast).includes(needle)) callback = node.arguments[0].getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(callback, `Missing effect: ${needle}`);
  const compiled = ts.transpileModule(`const callback = ${callback};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(dependencies), `${compiled}; return callback();`)(...Object.values(dependencies));
}

test("order modal freezes background scrolling and restores the original page position/styles", () => {
  const body = { style: { overflow: "auto", position: "", top: "", width: "", paddingRight: "" } };
  const html = { style: { overflow: "", overscrollBehavior: "" }, clientWidth: 390 };
  const scrolls = [];
  const cleanup = effect("savedScrollYRef.current =", { open: true, savedScrollYRef: { current: 0 }, document: { body, documentElement: html }, window: { scrollY: 420, innerWidth: 390, scrollTo: value => scrolls.push(value) } });
  assert.equal(body.style.position, "fixed");
  assert.equal(body.style.top, "-420px");
  cleanup();
  assert.equal(body.style.overflow, "auto");
  assert.equal(body.style.position, "");
  assert.equal(html.style.overflow, "");
  assert.equal(scrolls.at(-1).top, 420);
});

test("customer picker follows the visible viewport when keyboard opens and removes listeners on close", () => {
  const listeners = new Map();
  const values = new Map();
  const viewport = { height: 740, offsetTop: 0, addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name) };
  const cleanup = effect("customerPickerViewportRef", { open: true, customerPickerOpen: true, customerPickerViewportRef: { current: { style: { setProperty: (name, value) => values.set(name, value), removeProperty: name => values.delete(name) } } }, window: { visualViewport: viewport } });
  viewport.height = 380;
  viewport.offsetTop = 60;
  listeners.get("resize")();
  assert.equal(values.get("--customer-picker-height"), "380px");
  assert.equal(values.get("--customer-picker-top"), "60px");
  cleanup();
  assert.equal(listeners.size, 0);
  assert.equal(values.size, 0);
});

test("vehicle selection scrolls only its horizontal strip without scrollIntoView", () => {
  let declaration;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "handleVehicleSelect") declaration = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const compiled = ts.transpileModule(`const select = ${declaration};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const calls = [];
  const dependencies = { setSelectedVehicleId() {}, setVehicleUnderlineStyle() {}, vehicleTabsContainerRef: { current: { clientWidth: 300, scrollTo: value => calls.push(value) } } };
  const select = new Function(...Object.keys(dependencies), `${compiled};return select;`)(...Object.values(dependencies));
  select("vehicle", { currentTarget: { offsetLeft: 500, offsetWidth: 100, scrollIntoView() { throw new Error("Must not move outer scroll containers"); } } });
  assert.equal(calls[0].left, 400);
  assert.equal(calls[0].top, undefined);
});
