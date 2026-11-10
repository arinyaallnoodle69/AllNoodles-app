import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

test("history preserves saved item order when creation timestamps match", () => {
  const source = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
  const ast = ts.createSourceFile("actions.ts", source, ts.ScriptTarget.Latest, true);
  let callback;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "sortedOrderItems") callback = node.initializer.arguments[0].getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const code = ts.transpileModule(`const compare = ${callback};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const sortInfo = new Map([["a", { order: 3, sku: "3" }], ["b", { order: 2, sku: "2" }], ["c", { order: 1, sku: "1" }]]);
  const compare = new Function("sortInfo", code + ";return compare;")(sortInfo);
  const row = (product_id, item_sequence) => ({ product_id, item_sequence, created_at: "2026-11-09T00:00:00Z" });
  assert.deepEqual([row("c", 3), row("a", 1), row("b", 2)].sort(compare).map(x => x.product_id), ["a", "b", "c"]);
  assert.deepEqual([row("a", null), row("c", null), row("b", null)].sort(compare).map(x => x.product_id), ["c", "b", "a"]);
});
