import { createClient } from "@supabase/supabase-js";
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("=== LATEST 15 INVENTORY MOVEMENTS ===");
  const { data: movements, error: mError } = await admin
    .from("inventory_movements")
    .select(`
      id,
      created_at,
      product_id,
      warehouse_id,
      movement_type,
      quantity_delta,
      stock_before,
      stock_after,
      reference_number,
      notes,
      products (name)
    `)
    .order("created_at", { ascending: false })
    .limit(15);

  if (mError) {
    console.error("Movements Error:", mError);
  } else {
    movements.forEach(m => {
      console.log(`[${m.created_at}] Product: ${m.products?.name} | Warehouse: ${m.warehouse_id} | Type: ${m.movement_type} | Delta: ${m.quantity_delta} | Before: ${m.stock_before} | After: ${m.stock_after} | Ref: ${m.reference_number} | Note: ${m.notes}`);
    });
  }

  console.log("\n=== PRODUCT WAREHOUSE STOCKS ===");
  const { data: stocks, error: sError } = await admin
    .from("product_warehouse_stocks")
    .select(`
      id,
      product_id,
      warehouse_id,
      stock_quantity,
      reserved_quantity,
      products (name),
      warehouses (name)
    `)
    .limit(20);

  if (sError) {
    console.error("Stocks Error:", sError);
  } else {
    stocks.forEach(s => {
      console.log(`Product: ${s.products?.name} | Warehouse: ${s.warehouses?.name} | Stock: ${s.stock_quantity} | Reserved: ${s.reserved_quantity}`);
    });
  }
}

run().catch(console.error);
