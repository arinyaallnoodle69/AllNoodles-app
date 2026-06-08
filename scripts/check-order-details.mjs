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
  console.log("=== LATEST 10 ORDERS ===");
  const { data: orders, error: oError } = await admin
    .from("orders")
    .select(`
      id,
      order_number,
      status,
      fulfillment_status,
      total_amount,
      warehouse_id,
      order_date,
      created_at
    `)
    .order("created_at", { ascending: false })
    .limit(10);

  if (oError) {
    console.error("Orders Error:", oError);
  } else {
    orders.forEach(o => {
      console.log(`Order: ${o.order_number} | ID: ${o.id} | Status: ${o.status} | Fulfillment: ${o.fulfillment_status} | Date: ${o.order_date} | Warehouse: ${o.warehouse_id} | Created: ${o.created_at}`);
    });
  }

  console.log("\n=== LATEST 10 DELIVERY NOTES ===");
  const { data: dns, error: dError } = await admin
    .from("delivery_notes")
    .select(`
      id,
      delivery_number,
      delivery_date,
      status,
      warehouse_id,
      created_at
    `)
    .order("created_at", { ascending: false })
    .limit(10);

  if (dError) {
    console.error("DN Error:", dError);
  } else {
    dns.forEach(d => {
      console.log(`DN: ${d.delivery_number} | ID: ${d.id} | Status: ${d.status} | Date: ${d.delivery_date} | Warehouse: ${d.warehouse_id} | Created: ${d.created_at}`);
    });
  }
}

run().catch(console.error);
