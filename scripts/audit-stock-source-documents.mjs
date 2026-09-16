import { createClient } from "@supabase/supabase-js";

const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const from = process.argv[2] ?? "2026-09-14";
const to = process.argv[3] ?? "2026-09-15";

const { data: modes, error: modeError } = await client.from("product_warehouse_fulfillment_modes")
  .select("product_id,warehouse_id,mode").eq("mode", "stock");
if (modeError) throw modeError;
const stockKeys = new Set(modes.map((row) => `${row.warehouse_id}:${row.product_id}`));
const productIds = [...new Set(modes.map((row) => row.product_id))];
const warehouseIds = [...new Set(modes.map((row) => row.warehouse_id))];
const summaryOnly = process.argv.includes("--summary");

const [{ data: products, error: productError }, { data: warehouses, error: warehouseError }, { data: notes, error: noteError }, { data: receipts, error: receiptError }, { data: stocks, error: stockError }] = await Promise.all([
  client.from("products").select("id,sku,name").in("id", productIds),
  client.from("warehouses").select("id,name").in("id", warehouseIds),
  client.from("delivery_notes").select("id,delivery_number,delivery_date,status,warehouse_id,order_id").gte("delivery_date", from).lte("delivery_date", to),
  client.from("inventory_receipts").select("id,receipt_number,received_at,warehouse_id").gte("received_at", `${from}T00:00:00+07:00`).lt("received_at", new Date(new Date(`${to}T00:00:00+07:00`).getTime() + 86400000).toISOString()),
  client.from("product_warehouse_stocks").select("product_id,warehouse_id,stock_quantity").in("product_id", productIds).in("warehouse_id", warehouseIds),
]);
if (productError) throw productError;
if (warehouseError) throw warehouseError;
if (noteError) throw noteError;
if (receiptError) throw receiptError;
if (stockError) throw stockError;

const [{ data: noteItems, error: noteItemError }, { data: receiptItems, error: receiptItemError }] = await Promise.all([
  notes.length ? client.from("delivery_note_items").select("delivery_note_id,product_id,quantity_in_base_unit").in("delivery_note_id", notes.map((row) => row.id)) : { data: [], error: null },
  receipts.length ? client.from("inventory_receipt_items").select("receipt_id,product_id,warehouse_id,quantity_received").in("receipt_id", receipts.map((row) => row.id)) : { data: [], error: null },
]);
if (noteItemError) throw noteItemError;
if (receiptItemError) throw receiptItemError;

const productMap = new Map(products.map((row) => [row.id, row]));
const warehouseMap = new Map(warehouses.map((row) => [row.id, row.name]));
const noteMap = new Map(notes.map((row) => [row.id, row]));
const receiptMap = new Map(receipts.map((row) => [row.id, row]));
const stockMap = new Map(stocks.map((row) => [`${row.warehouse_id}:${row.product_id}`, Number(row.stock_quantity)]));
const groups = new Map();
const add = (warehouseId, productId, kind, quantity, detail) => {
  if (!stockKeys.has(`${warehouseId}:${productId}`)) return;
  const key = `${warehouseId}:${productId}`;
  const group = groups.get(key) ?? { warehouseId, productId, received: 0, delivered: 0, documents: [] };
  group[kind] += quantity;
  group.documents.push(detail);
  groups.set(key, group);
};
for (const item of receiptItems) {
  const receipt = receiptMap.get(item.receipt_id);
  add(item.warehouse_id ?? receipt?.warehouse_id, item.product_id, "received", Number(item.quantity_received), { type: "receipt", number: receipt?.receipt_number, quantity: Number(item.quantity_received) });
}
for (const item of noteItems) {
  const note = noteMap.get(item.delivery_note_id);
  add(note?.warehouse_id, item.product_id, "delivered", Number(item.quantity_in_base_unit), { type: "delivery", number: note?.delivery_number, status: note?.status, quantity: Number(item.quantity_in_base_unit) });
}

const result = [...groups.values()].map((group) => ({
  sku: productMap.get(group.productId)?.sku,
  name: productMap.get(group.productId)?.name,
  warehouse: warehouseMap.get(group.warehouseId),
  received: group.received,
  delivered: group.delivered,
  receiptMinusCurrentDeliveryNotes: group.received - group.delivered,
  currentStock: stockMap.get(`${group.warehouseId}:${group.productId}`) ?? null,
  matchesDocuments: stockMap.get(`${group.warehouseId}:${group.productId}`) === group.received - group.delivered,
  ...(summaryOnly ? {} : { documents: group.documents }),
})).sort((a, b) => a.sku.localeCompare(b.sku, "en", { numeric: true }));
console.log(JSON.stringify({ from, to, deliveryNoteStatuses: notes.reduce((acc, row) => ({ ...acc, [row.status]: (acc[row.status] ?? 0) + 1 }), {}), result }, null, 2));
