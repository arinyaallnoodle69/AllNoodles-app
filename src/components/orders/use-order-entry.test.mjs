import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("./use-order-entry.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("entry.ts", source, ts.ScriptTarget.Latest, true);
let declaration;
function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === "recoverEntryLease") declaration = node.getText(ast); ts.forEachChild(node, visit); }
visit(ast);

test("expired lease is reacquired and a competing user retains their lock", async () => {
  assert.ok(declaration, "automatic lease recovery is available");
  const js = ts.transpileModule(declaration, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const recover = new Function(`${js}; return recoverEntryLease;`)();
  const scope = { customerId: "shop", date: "2026-11-10" };
  const calls = [];
  const makeRequest = (result) => async (action) => { calls.push(action); return result; };
  const free = { granted: true, orderedCount: 0, locks: [{ customerId: "shop", owned: true }] };
  const taken = { granted: false, orderedCount: 0, locks: [{ customerId: "shop", owned: false, displayName: "A" }] };
  assert.equal((await recover(makeRequest(free), scope, 0)).granted, true);
  assert.equal((await recover(makeRequest(taken), scope, 0)).granted, false);
  assert.deepEqual(calls, ["acquire", "acquire"]);
  calls.length = 0;
  const changed = { ...free, orderedCount: 1 };
  assert.equal((await recover(makeRequest(changed), scope, 0)).granted, false);
  assert.deepEqual(calls, ["acquire", "release"]);
});
