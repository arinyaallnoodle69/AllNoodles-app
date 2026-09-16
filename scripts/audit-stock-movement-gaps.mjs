import { createClient } from "@supabase/supabase-js";

const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const from = process.argv[2] ?? "2026-09-09T00:00:00Z";
const to = process.argv[3] ?? "2026-09-16T00:00:00Z";
const movements = [];
for (let offset = 0; ; offset += 1000) {
  const { data, error } = await client.from("inventory_movements")
    .select("id,organization_id,product_id,warehouse_id,created_at,movement_type,quantity_delta,stock_before,stock_after,reference_number,notes,metadata")
    .gte("created_at", from).lt("created_at", to).order("created_at").order("id").range(offset, offset + 999);
  if (error) throw error;
  movements.push(...data);
  if (data.length < 1000) break;
}
const productIds = [...new Set(movements.map((row) => row.product_id))];
const { data: products, error: productError } = await client.from("products").select("id,sku,name").in("id", productIds);
if (productError) throw productError;
const productMap = new Map(products.map((product) => [product.id, product]));
const warehouseIds = [...new Set(movements.map((row) => row.warehouse_id).filter(Boolean))];
const [{ data: modes, error: modeError }, { data: warehouses, error: warehouseError }, { data: stocks, error: stockError }] = await Promise.all([
  client.from("product_warehouse_fulfillment_modes").select("product_id,warehouse_id,mode").in("product_id", productIds).in("warehouse_id", warehouseIds),
  client.from("warehouses").select("id,name").in("id", warehouseIds),
  client.from("product_warehouse_stocks").select("product_id,warehouse_id,stock_quantity").in("product_id", productIds).in("warehouse_id", warehouseIds),
]);
if (modeError) throw modeError;
if (warehouseError) throw warehouseError;
if (stockError) throw stockError;
const modeMap = new Map(modes.map((row) => [`${row.warehouse_id}:${row.product_id}`, row.mode]));
const warehouseMap = new Map(warehouses.map((row) => [row.id, row.name]));
const stockMap = new Map(stocks.map((row) => [`${row.warehouse_id}:${row.product_id}`, Number(row.stock_quantity)]));
const groups = new Map();
for (const movement of movements) {
  const key = `${movement.organization_id}:${movement.warehouse_id}:${movement.product_id}`;
  groups.set(key, [...(groups.get(key) ?? []), movement]);
}
const gaps = [];
for (const rows of groups.values()) {
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    const gap = Number(current.stock_before) - Number(previous.stock_after);
    if (Math.abs(gap) < 0.001) continue;
    const product = productMap.get(current.product_id);
    gaps.push({
      sku: product?.sku ?? current.product_id,
      name: product?.name ?? "",
      warehouseId: current.warehouse_id,
      warehouse: warehouseMap.get(current.warehouse_id) ?? "ไม่ระบุคลัง",
      mode: modeMap.get(`${current.warehouse_id}:${current.product_id}`) ?? "stock",
      currentStock: stockMap.get(`${current.warehouse_id}:${current.product_id}`) ?? null,
      gap,
      previous: { at: previous.created_at, after: Number(previous.stock_after), type: previous.movement_type, delta: Number(previous.quantity_delta), ref: previous.reference_number, source: previous.metadata?.source ?? null },
      next: { at: current.created_at, before: Number(current.stock_before), type: current.movement_type, delta: Number(current.quantity_delta), ref: current.reference_number, source: current.metadata?.source ?? null },
    });
  }
}
const stockGaps = gaps.filter((gap) => gap.mode === "stock");
const invalidStockMovements = movements.filter((movement) =>
  (modeMap.get(`${movement.warehouse_id}:${movement.product_id}`) ?? "stock") === "stock" &&
  Math.abs(Number(movement.stock_after) - Number(movement.stock_before) - Number(movement.quantity_delta)) >= 0.001
).map((movement) => ({
  sku: productMap.get(movement.product_id)?.sku ?? movement.product_id,
  warehouse: warehouseMap.get(movement.warehouse_id) ?? "ไม่ระบุคลัง",
  at: movement.created_at,
  before: Number(movement.stock_before),
  delta: Number(movement.quantity_delta),
  after: Number(movement.stock_after),
  difference: Number(movement.stock_after) - Number(movement.stock_before) - Number(movement.quantity_delta),
  reference: movement.reference_number,
}));
const bySku = Object.entries(stockGaps.reduce((result, gap) => {
  const item = result[gap.sku] ?? { count: 0, netGap: 0 };
  item.count += 1;
  item.netGap += gap.gap;
  result[gap.sku] = item;
  return result;
}, {})).sort((a, b) => b[1].count - a[1].count);
console.log(JSON.stringify({
  range: { from, to },
  movementCount: movements.length,
  allGapCount: gaps.length,
  excludedNonStockGapCount: gaps.length - stockGaps.length,
  stockGapCount: stockGaps.length,
  affectedStockProducts: bySku.length,
  invalidStockMovementCount: invalidStockMovements.length,
  invalidStockMovements,
  bySku,
  gaps: stockGaps,
}, null, 2));
