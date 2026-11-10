import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const ast = ts.createSourceFile("stock-list.tsx", readFileSync(new URL("./stock-list.tsx", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function extract(name) {
  let declaration;
  function visit(node) { if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) declaration = `const ${node.getText(ast)};`; ts.forEachChild(node, visit); }
  visit(ast);
  assert.ok(declaration, `${name} exists`);
  return ts.transpileModule(declaration, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}
test("adjustment returns to the position captured when its modal opened", () => {
  const savedScrollYRef = { current: 0 }, scrolls = [], frames = [];
  const window = { scrollY: 1250, history: { pushState() {}, scrollRestoration: "auto" }, scrollTo: ({ top }) => scrolls.push(top) };
  const closeModals = () => {};
  const bind = (name, deps) => new Function(...Object.keys(deps), `${extract(name)};return ${name};`)(...Object.values(deps));
  bind("handleAdjust", { canEditStock: true, savedScrollYRef, window, setAdjustProductId() {}, setAdjustOpen() {}, buildCurrentUrl: () => "/stock" })("p");
  window.scrollY = 0;
  bind("closeAdjust", { savedScrollYRef, window, document: { activeElement: null }, HTMLElement: class {}, closeModals, requestAnimationFrame: fn => frames.push(fn) })();
  frames.forEach(fn => fn());
  assert.deepEqual(scrolls, [1250, 1250]);
});
