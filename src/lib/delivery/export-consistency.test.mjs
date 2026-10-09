import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import crypto from "node:crypto";
import ts from "typescript";

let rows = [];
const sandboxModule = { exports: {} };
const source = readFileSync(new URL("./export-consistency.ts", import.meta.url), "utf8").replace('import "server-only";', "");
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText, {
  module: sandboxModule, exports: sandboxModule.exports, Buffer,
  require(name) {
    if (name === "node:crypto") return crypto;
    if (name.endsWith("/env")) return { getSessionSecret: () => "test-secret" };
    return { getSupabaseAdmin: () => ({ rpc: async (_, args) => ({ data: rows.filter((row) => !args.p_note_ids || args.p_note_ids.includes(row.id)), error: null }) }) };
  },
});
const { createDeliveryExportToken, validateDeliveryExportToken, assertDeliveryExportVersions } = sandboxModule.exports;

test("export rejects stale, mismatched, missing, foreign and tampered bills and files", async () => {
  rows = [{ id: "00000000-0000-0000-0000-000000000001", version: "v1", valid: true }];
  const pdf = Buffer.from("verified PDF");
  const token = createDeliveryExportToken("org", rows, pdf);
  await validateDeliveryExportToken(token, "org", pdf);
  await assert.rejects(validateDeliveryExportToken(token, "other-org"));
  await assert.rejects(validateDeliveryExportToken(token.slice(0, -3) + "abc", "org"));
  await assert.rejects(validateDeliveryExportToken(token, "org", Buffer.from("different PDF")));
  rows[0].version = "v2";
  await assert.rejects(validateDeliveryExportToken(token, "org"));
  rows[0].version = "v1";
  rows[0].valid = false;
  await assert.rejects(validateDeliveryExportToken(token, "org"));
  rows = [];
  await assert.rejects(validateDeliveryExportToken(token, "org"));
  assert.throws(() => assertDeliveryExportVersions([], [], []));
});

test("a daily batch fits an HTTP header and changes in any bill invalidate it", async () => {
  rows = Array.from({ length: 200 }, (_, index) => ({ id: `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`, version: "version", valid: true }));
  const token = createDeliveryExportToken("org", rows);
  assert.ok(token.length < 7000);
  await validateDeliveryExportToken(token, "org");
  rows[199].version = "edited";
  await assert.rejects(validateDeliveryExportToken(token, "org"));
});
