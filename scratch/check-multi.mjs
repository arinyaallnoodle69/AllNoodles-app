import { createClient } from "@supabase/supabase-js";
import dotenv from 'dotenv';

dotenv.config({ path: 'C:/Users/Riew/Desktop/Ya-Noodles/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(supabaseUrl, supabaseKey);

async function checkProduct(sku) {
  console.log(`\n=================== CHECKING SKU: ${sku} ===================`);
  
  const { data: products, error: pError } = await admin
    .from("products")
    .select("id, name, sku, stock_quantity, reserved_quantity, unit, is_active")
    .eq("sku", sku);

  if (pError || !products || products.length === 0) {
    console.log(`Product ${sku} not found.`);
    return;
  }

  const product = products[0];
  console.log(`Product: ${product.name} (ID: ${product.id})`);
  console.log(`- products.stock_quantity: ${product.stock_quantity}`);

  const { data: whStocks } = await admin
    .from("product_warehouse_stocks")
    .select("stock_quantity, reserved_quantity, warehouses(name)")
    .eq("product_id", product.id);

  console.log("- Warehouse stocks:");
  whStocks?.forEach(ws => {
    console.log(`  * ${ws.warehouses?.name}: Stock = ${ws.stock_quantity}, Reserved = ${ws.reserved_quantity}`);
  });

  const { data: movements } = await admin
    .from("inventory_movements")
    .select("created_at, movement_type, quantity_delta, stock_before, stock_after, reference_number, notes")
    .eq("product_id", product.id)
    .order("created_at", { ascending: false });

  console.log(`- Movements count: ${movements?.length || 0}`);
  movements?.slice(0, 10).forEach(m => {
    console.log(`  * [${m.created_at}] Type: ${m.movement_type} | Delta: ${m.quantity_delta} | Before: ${m.stock_before} | After: ${m.stock_after} | Ref: ${m.reference_number} | Note: ${m.notes}`);
  });

  const { data: orderItems } = await admin
    .from("order_items")
    .select("quantity_in_base_unit, orders(order_number, status, fulfillment_status)")
    .eq("product_id", product.id);

  console.log(`- Order items referencing it count: ${orderItems?.length || 0}`);
  orderItems?.forEach(oi => {
    console.log(`  * Order: ${oi.orders?.order_number} | Status: ${oi.orders?.status} | Fulfillment: ${oi.orders?.fulfillment_status} | Qty: ${oi.quantity_in_base_unit}`);
  });

  const { data: dnItems } = await admin
    .from("delivery_note_items")
    .select("quantity_in_base_unit, delivery_notes(delivery_number, status)")
    .eq("product_id", product.id);

  console.log(`- Delivery note items referencing it count: ${dnItems?.length || 0}`);
  dnItems?.forEach(dni => {
    console.log(`  * DN: ${dni.delivery_notes?.delivery_number} | Status: ${dni.delivery_notes?.status} | Qty: ${dni.quantity_in_base_unit}`);
  });

  const { data: receiptItems } = await admin
    .from("inventory_receipt_items")
    .select("quantity_received, inventory_receipts(receipt_number)")
    .eq("product_id", product.id);

  console.log(`- Inventory receipt items count: ${receiptItems?.length || 0}`);
  receiptItems?.forEach(ri => {
    console.log(`  * Receipt: ${ri.inventory_receipts?.receipt_number} | Qty: ${ri.quantity_received}`);
  });
}

async function run() {
  await checkProduct("ANP107");
  await checkProduct("ANP050");
  await checkProduct("ANP051");
}

run().catch(console.error);
