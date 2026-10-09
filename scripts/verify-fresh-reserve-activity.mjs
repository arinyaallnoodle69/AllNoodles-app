// Disposable local database only; all schema and data changes roll back.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Client } from "pg";
const db = new Client({ host: "127.0.0.1", port: 55439, user: "postgres", database: "factory_test" });
await db.connect();
const id = (n) => "00000000-0000-0000-0000-" + String(n).padStart(12, "0");
const org = id(1), bkk = id(2), province = id(3), customer = id(4), vehicle = id(5), order = id(6);
const product = id(10), date = "2026-10-09";
const events = async () => (await db.query("select before_quantity,after_quantity,demand_change,reserve_change,available_after from fresh_reserve_activity where product_id=$1", [product])).rows;
const expect = async (before, after, change, used, available) => {
  const rows = await events();
  assert.equal(rows.length, 1);
  assert.deepEqual(Object.values(rows[0]).map(Number), [before, after, change, used, available]);
};
const run = async (fn) => { await db.query("savepoint scenario"); try { await fn(); } finally { await db.query("rollback to savepoint scenario"); } };
try {
  await db.query("begin");
  await db.query(`create role anon; create role authenticated; create role service_role;
    create table products(id uuid primary key,organization_id uuid,sku text,metadata jsonb);
    create table warehouses(id uuid primary key,organization_id uuid,name text);
    create table customers(id uuid primary key,organization_id uuid,name text,default_warehouse_id uuid,default_vehicle_id uuid);
    create table orders(id uuid primary key,organization_id uuid,customer_id uuid,order_date date,status text,warehouse_id uuid,assigned_vehicle_id uuid);
    create table order_items(id uuid primary key default gen_random_uuid(),organization_id uuid,order_id uuid references orders(id) on delete cascade,product_id uuid,quantity_in_base_unit numeric,updated_at timestamptz default now());
    create table delivery_notes(id uuid primary key default gen_random_uuid(),organization_id uuid,order_id uuid,warehouse_id uuid,vehicle_id uuid,status text,created_at timestamptz default now());
    create table product_warehouse_fulfillment_modes(organization_id uuid,product_id uuid,warehouse_id uuid,mode text);
    create table daily_order_special_items(id uuid primary key default gen_random_uuid(),organization_id uuid,entry_date date,product_id uuid,vehicle_id uuid,entry_type text,quantity numeric);`);
  await db.query("insert into warehouses values ($1,$3,'คลังกรุงเทพ'),($2,$3,'คลังต่างจังหวัด')", [bkk, province, org]);
  await db.query("insert into customers values ($1,$2,'ทดสอบ',$3,$4)", [customer, org, bkk, vehicle]);
  await db.query("insert into orders values ($1,$2,$3,$4,'confirmed',null,$5)", [order, org, customer, date, vehicle]);
  for (const [i, sku] of ["ANP180","ANP181","ANP182"].entries()) {
    await db.query("insert into products values ($1,$2,$3,$4)", [id(10+i), org, sku, { factory_order_adjustments: { [date]: { adjustedQuantity: i ? 15 : 110, remainingQuantity: i ? 0 : 20, reserveQuantity: 30, orderDemand: i ? 0 : 100 } } }]);
    await db.query("insert into product_warehouse_fulfillment_modes values ($1,$2,$3,'fresh')", [org,id(10+i),bkk]);
  }
  await db.query("insert into order_items(id,organization_id,order_id,product_id,quantity_in_base_unit) values ($1,$2,$3,$4,100)", [id(20),org,order,product]);
  await db.query(readFileSync("supabase/migrations/20261009113550_fresh_reserve_activity.sql", "utf8"));
  await db.query(readFileSync("supabase/migrations/20261009113951_refine_fresh_reserve_activity.sql", "utf8"));
  await run(async () => {
    await db.query("update order_items set quantity_in_base_unit=115");
    await expect(100,115,15,15,15);
    await db.query("update order_items set quantity_in_base_unit=120");
    await expect(100,120,20,20,10);
    await db.query("update order_items set quantity_in_base_unit=100");
    assert.equal((await events()).length,0);
  });
  await run(async () => { await db.query("update order_items set quantity_in_base_unit=90"); await expect(100,90,-10,-10,40); });
  await run(async () => { await db.query("update order_items set quantity_in_base_unit=150"); await expect(100,150,50,30,0); });
  await run(async () => { await db.query("delete from order_items"); await expect(100,0,-100,-100,130); });
  await run(async () => {
    await db.query("delete from order_items");
    await db.query("insert into order_items(organization_id,order_id,product_id,quantity_in_base_unit) values($1,$2,$3,100)",[org,order,product]);
    assert.equal((await events()).length,0, "delete and recreate same quantity must not appear");
  });
  await run(async () => { await db.query("update orders set status='cancelled'"); await expect(100,0,-100,-100,130); });
  await run(async () => { await db.query("delete from orders"); await expect(100,0,-100,-100,130); });
  await run(async () => { await db.query("update orders set warehouse_id=$1",[province]); await expect(100,0,-100,-100,130); });
  await run(async () => { await db.query("update customers set default_warehouse_id=$1",[province]); await expect(100,0,-100,-100,130); });
  await run(async () => {
    await db.query("insert into delivery_notes(organization_id,order_id,warehouse_id,vehicle_id,status) values($1,$2,$3,$4,'confirmed')",[org,order,province,vehicle]);
    await expect(100,0,-100,-100,130);
  });
  await run(async () => { await db.query("update order_items set quantity_in_base_unit=quantity_in_base_unit"); assert.equal((await events()).length,0); });
  await run(async () => {
    await db.query("insert into daily_order_special_items(organization_id,entry_date,product_id,vehicle_id,entry_type,quantity) values($1,$2,$3,$4,'remaining',10)",[org,date,product,vehicle]);
    const rows = await events(); assert.equal(Number(rows[0].demand_change),-10); assert.equal(Number(rows[0].available_after),40);
  });
  await run(async () => {
    await db.query("insert into orders values ($1,$2,$3,$4,'confirmed',null,$5)",[id(30),org,customer,date,vehicle]);
    await db.query("insert into order_items(organization_id,order_id,product_id,quantity_in_base_unit) values($1,$2,$3,10)",[org,id(30),product]);
    await db.query("delete from fresh_reserve_activity");
    await db.query("update customers set default_warehouse_id=$1",[province]);
    await expect(110,0,-110,-110,130);
  });
  assert.equal((await db.query("select has_table_privilege('anon','fresh_reserve_activity','select') as allowed")).rows[0].allowed,false);
  console.log("PASS: increases, reductions, shortage, deletion, cancellation, warehouse and customer transfers, delivery notes, special quantities, zero changes, transaction aggregation and private history");
} finally { await db.query("rollback"); await db.end(); }


