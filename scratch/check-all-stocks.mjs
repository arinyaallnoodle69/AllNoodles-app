import { createClient } from "@supabase/supabase-js";
import dotenv from 'dotenv';

dotenv.config({ path: 'C:/Users/Riew/Desktop/Ya-Noodles/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("=== PRODUCTS WITH NEGATIVE STOCK ===");
  const { data: products, error } = await admin
    .from("products")
    .select("id, name, sku, stock_quantity, unit")
    .lt("stock_quantity", 0);

  if (error) {
    console.error("Error:", error);
    return;
  }

  if (products.length === 0) {
    console.log("No products have negative stock in the 'products' table.");
  } else {
    products.forEach(p => {
      console.log(`Product: ${p.name} | SKU: ${p.sku} | Stock: ${p.stock_quantity} ${p.unit}`);
    });
  }

  console.log("\n=== WAREHOUSE STOCKS WITH NEGATIVE STOCK ===");
  const { data: whStocks, error: whError } = await admin
    .from("product_warehouse_stocks")
    .select(`
      id,
      stock_quantity,
      products (name, sku, unit),
      warehouses (name)
    `)
    .lt("stock_quantity", 0);

  if (whError) {
    console.error("Error:", whError);
    return;
  }

  if (whStocks.length === 0) {
    console.log("No warehouse stocks have negative stock.");
  } else {
    whStocks.forEach(ws => {
      console.log(`Product: ${ws.products?.name} (SKU: ${ws.products?.sku}) | Warehouse: ${ws.warehouses?.name} | Stock: ${ws.stock_quantity} ${ws.products?.unit}`);
    });
  }
}

run().catch(console.error);
