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
  console.log("=== ORDER ORD2026060500001 ===");
  const { data: orders, error: oError } = await admin
    .from("orders")
    .select("*")
    .eq("order_number", "ORD2026060500001");

  if (oError) {
    console.error("Order Lookup Error:", oError);
    return;
  }

  console.log("Orders found:", orders);

  if (!orders || orders.length === 0) return;
  const orderId = orders[0].id;

  console.log("\n=== ORDER ITEMS FOR ORD2026060500001 ===");
  const { data: items, error: iError } = await admin
    .from("order_items")
    .select("*, products(name)")
    .eq("order_id", orderId);

  if (iError) console.error("Items Error:", iError);
  else console.log("Items:", items);

  console.log("\n=== INVENTORY MOVEMENTS FOR THIS ORDER ===");
  const { data: movements, error: mError } = await admin
    .from("inventory_movements")
    .select("*, products(name)")
    .or(`notes.ilike.%ORD2026060500001%,reference_number.eq.ORD2026060500001,metadata->>order_id.eq.${orderId}`);

  if (mError) console.error("Movements Error:", mError);
  else {
    movements.forEach(m => {
      console.log(`[${m.created_at}] Product: ${m.products?.name} | Type: ${m.movement_type} | Delta: ${m.quantity_delta} | Before: ${m.stock_before} | After: ${m.stock_after} | Ref: ${m.reference_number} | Note: ${m.notes}`);
    });
  }
}

run().catch(console.error);
