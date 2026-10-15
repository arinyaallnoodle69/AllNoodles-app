import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
const require = createRequire(import.meta.url);
const groupId = "11111111-1111-4111-8111-111111111111";
const input = { groupId, from: "2026-10-15", to: "2026-10-16" };
function action({ allowed = true, fail = false, rows = [] } = {}) {
  const calls = [];
  const mocks = {
    "@/lib/auth/authorization": { requireAnyRole: async () => ({ organizationId: "my-org" }) },
    "@/lib/supabase/admin": { getSupabaseAdmin: () => ({ from(table) {
      const log = { table, filters: [] }; calls.push(log);
      const query = {};
      for (const method of ["select", "eq", "gte", "lt", "lte", "or", "order", "limit"]) query[method] = (...args) => { log.filters.push([method, ...args]); return query; };
      query.maybeSingle = async () => ({ data: allowed ? { id: groupId } : null, error: null });
      query.then = resolve => resolve({ data: rows, count: 84, error: fail ? "db error" : null });
      return query;
    } }) },
  };
  const loaded = { exports: {} };
  const compiled = ts.transpileModule(readFileSync(new URL("./history-actions.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function("require", "module", "exports", compiled)(name => mocks[name] ?? require(name), loaded, loaded.exports);
  return { calls, fetch: loaded.exports.fetchReserveWarehouseHistory };
}
test("rejects invalid dates and cross-organization group before reading movements", async () => {
  const invalid = action();
  for (const bad of [{ from: "2026-02-31" }, { from: "2026-10-17" }, { groupId: "bad" }, { cursor: { at: "bad", id: groupId } }]) await assert.rejects(invalid.fetch({ ...input, ...bad }));
  assert.equal(invalid.calls.length, 0);
  const denied = action({ allowed: false }); await assert.rejects(denied.fetch(input), /เข้าถึง/);
  assert.equal(denied.calls.length, 1);
  assert.deepEqual(denied.calls[0].filters.find(f => f[1] === "organization_id"), ["eq", "organization_id", "my-org"]);
});
test("uses Bangkok inclusive dates, stable descending cursor, frozen snapshot, and independent total", async () => {
  const rows = Array.from({ length: 51 }, (_, i) => ({ id: groupId, created_at: "2026-10-16T01:00:00.123456+00:00", products: { name: `สินค้า${i}` }, quantity_delta: -1, quantity_after: 0 }));
  const api = action({ rows });
  const result = await api.fetch({ ...input, asOf: "2026-10-16T05:00:00.000Z", cursor: { at: "2026-10-16T02:00:00.000Z", id: groupId } });
  assert.equal(result.items.length, 50); assert.equal(result.total, 84); assert.equal(result.cursor.at, rows[49].created_at);
  const list = api.calls[1].filters, count = api.calls[2].filters;
  assert.ok(list.some(f => f[0] === "gte" && f[2] === "2026-10-15T00:00:00+07:00"));
  assert.ok(list.some(f => f[0] === "lt" && f[2] === "2026-10-16T17:00:00.000Z"));
  assert.ok(list.some(f => f[0] === "lte" && f[2] === result.asOf));
  assert.ok(list.some(f => f[0] === "or" && f[1].includes(`id.lt.${groupId}`)));
  assert.ok(!count.some(f => f[0] === "or"));
  assert.deepEqual(list.filter(f => f[0] === "order").map(f => f[1]), ["created_at", "id"]);
});
test("database error is visible instead of silently returning empty history", async () => {
  await assert.rejects(action({ fail: true }).fetch(input), /โหลดประวัติไม่สำเร็จ/);
});
