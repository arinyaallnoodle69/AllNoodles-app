import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

test("changing packaging in the edit picker clears the previous selection and filters", () => {
  const source = readFileSync(new URL("./order-add-product-picker.tsx", import.meta.url), "utf8");
  const ast = ts.createSourceFile("picker.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "handleOpenPicker") callback = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const state = {};
  const dependencies = { isBarcode: false, isReplacement: false, products: [{}], fallbackProducts: [], ...Object.fromEntries(["IsReplacement", "IsBarcode", "Open", "Selections", "Query", "SelectedCategoryId", "SelectedBrand", "DisplayLimit"].map(name => [`set${name}`, value => { state[name] = value; }])) };
  const compiled = ts.transpileModule(`const open = ${callback};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function(...Object.keys(dependencies), `${compiled};open(false,true);`)(...Object.values(dependencies));
  assert.deepEqual(state.Selections, {});
  assert.equal(state.SelectedCategoryId, "__all__");
  assert.equal(state.SelectedBrand, "__all__");
  assert.equal(state.IsBarcode, true);
  assert.equal(state.Open, true);
});
