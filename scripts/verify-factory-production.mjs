// Run only against a disposable local PostgreSQL database.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Client } from "pg";
import { calculateFreshReserve } from "../src/lib/orders/fresh-reserve-math.ts";

const client = new Client({ host: "127.0.0.1", port: 55439, user: "postgres", database: "factory_test" });
await client.connect();
const org = "00000000-0000-0000-0000-000000000001";
const otherOrg = "00000000-0000-0000-0000-000000000002";
const actor = "00000000-0000-0000-0000-000000000003";
const ids = [10, 11, 12].map((id) => `00000000-0000-0000-0000-${String(id).padStart(12, "0")}`);
const date = "2026-10-09";
const snapshot = async () => (await client.query("select metadata from public.products order by id")).rows.map((r) => r.metadata);
const save = (operation, rows, organization = org) => client.query(
  "select public.save_confirmed_factory_production($1,$2,$3,$4,$5::jsonb)",
  [organization, date, actor, operation, JSON.stringify(rows)],
);
try {
  await client.query("begin");
  await client.query(`create role anon; create role authenticated; create role service_role;
    create table public.products (id uuid primary key, organization_id uuid not null, sku text not null, metadata jsonb);`);
  for (const [index, id] of ids.entries()) {
    await client.query("insert into public.products values ($1,$2,$3,$4)", [id, org, ["ANP180","ANP181","ANP182"][index], { unrelated: "preserve" }]);
  }
  await client.query(readFileSync("supabase/migrations/20261009110356_confirm_factory_production.sql", "utf8"));
  let rows = ids.map((productId) => ({ productId, updatedAt: null, orderDemand: 100, remainingQuantity: 20, reserveQuantity: 30, adjustedQuantity: 110, additionalQuantity: 0 }));
  const rejectWithoutChanges = async (operation, input, organization = org) => {
    const before = await snapshot();
    await client.query("savepoint rejected");
    await assert.rejects(save(operation, input, organization));
    await client.query("rollback to savepoint rejected");
    assert.deepEqual(await snapshot(), before);
  };
  await rejectWithoutChanges("add", rows);
  await rejectWithoutChanges("confirm", rows, otherOrg);
  await rejectWithoutChanges("confirm", [rows[0], rows[0], rows[2]]);
  await rejectWithoutChanges("confirm", rows.map((r, i) => i === 2 ? { ...r, adjustedQuantity: 999 } : r));
  await save("confirm", rows);
  const original = (await snapshot()).map((m) => m.factory_order_adjustments[date]);
  assert.equal(original[0].adjustedQuantity, 110);
  assert.equal(calculateFreshReserve(original[0], 120).available, 10);
  assert.equal(calculateFreshReserve(original[0], 90).available, 40);
  assert.equal(calculateFreshReserve(original[0], 0).available, 130);
  assert.equal(calculateFreshReserve(original[0], 150).overCapacity, 20);
  await rejectWithoutChanges("confirm", rows);
  rows = rows.map((r, i) => ({ ...r, updatedAt: original[i].updatedAt }));
  await rejectWithoutChanges("confirm", rows);
  await rejectWithoutChanges("add", rows.map((r, i) => ({ ...r, additionalQuantity: i === 2 ? -1 : 10 })));
  const oldRows = rows.map((r) => ({ ...r, additionalQuantity: 10 }));
  await save("add", oldRows);
  const added = await snapshot();
  assert.equal(added[0].unrelated, "preserve");
  const newAdjustment = added[0].factory_order_adjustments[date];
  assert.equal(newAdjustment.adjustedQuantity, 120);
  assert.equal(newAdjustment.reserveQuantity, 40);
  assert.equal(newAdjustment.orderDemand, original[0].orderDemand);
  assert.equal(newAdjustment.remainingQuantity, original[0].remainingQuantity);
  assert.equal(newAdjustment.confirmedAt, original[0].confirmedAt);
  assert.equal(newAdjustment.productionAdditions[0].quantity, 10);
  assert.equal(calculateFreshReserve(newAdjustment, 120).available, 20);
  await rejectWithoutChanges("add", oldRows);
  await client.query("savepoint denied");
  await client.query("set local role authenticated");
  await assert.rejects(save("add", oldRows), /permission denied/);
  await client.query("rollback to savepoint denied");
  const grants = await client.query(`select has_function_privilege('anon','public.save_confirmed_factory_production(uuid,date,uuid,text,jsonb)','execute') as anon,
    has_function_privilege('authenticated','public.save_confirmed_factory_production(uuid,date,uuid,text,jsonb)','execute') as authenticated,
    has_function_privilege('service_role','public.save_confirmed_factory_production(uuid,date,uuid,text,jsonb)','execute') as service;`);
  assert.deepEqual(grants.rows[0], { anon: false, authenticated: false, service: true });
  console.log("PASS: confirmation, late orders, reductions, cancellation, shortage, explicit production addition, duplicate/stale saves, atomic rollback, organization isolation, private RPC");
} finally {
  await client.query("rollback");
  await client.end();
}
