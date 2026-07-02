import { createClient } from "@supabase/supabase-js";
import dotenv from 'dotenv';
import path from 'path';

// Load env from the project directory
dotenv.config({ path: 'C:/Users/Riew/Desktop/Ya-Noodles/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("=== CHECKING PRODUCT ANP051 ===");
  
  // Find product by SKU
  const { data: products, error: pError } = await admin
    .from("products")
    .select("id, name, sku, stock_quantity, reserved_quantity, unit, is_active")
    .eq("sku", "ANP051");

  if (pError) {
    console.error("Error fetching product:", pError);
    return;
  }

  if (!products || products.length === 0) {
    console.log("Product ANP051 not found in products table.");
    // Let's try searching for ANP051 in sku or name case insensitively
    const { data: searchProducts, error: sError } = await admin
      .from("products")
      .select("id, name, sku, stock_quantity, reserved_quantity, unit")
      .ilike("sku", "%ANP051%");
      
    if (sError) {
      console.error("Error searching product:", sError);
      return;
    }
    console.log("Search results for 'ANP051':", searchProducts);
    if (!searchProducts || searchProducts.length === 0) {
      return;
    }
    products.push(...searchProducts);
  }

  for (const product of products) {
    console.log(`\nProduct Found: ${product.name} (SKU: ${product.sku}, ID: ${product.id})`);
    console.log(`- Base stock_quantity in 'products' table: ${product.stock_quantity} ${product.unit}`);
    console.log(`- Base reserved_quantity in 'products' table: ${product.reserved_quantity} ${product.unit}`);
    console.log(`- Active: ${product.is_active}`);

    // Check product warehouse stocks
    console.log("\n--- Warehouse Stocks (product_warehouse_stocks) ---");
    const { data: whStocks, error: whError } = await admin
      .from("product_warehouse_stocks")
      .select(`
        id,
        warehouse_id,
        stock_quantity,
        reserved_quantity,
        warehouses (name, slug)
      `)
      .eq("product_id", product.id);

    if (whError) {
      console.error("Error fetching warehouse stocks:", whError);
    } else {
      whStocks.forEach(ws => {
        console.log(`Warehouse: ${ws.warehouses?.name} (${ws.warehouses?.slug}) | ID: ${ws.warehouse_id}`);
        console.log(`  - Stock Quantity: ${ws.stock_quantity}`);
        console.log(`  - Reserved Quantity: ${ws.reserved_quantity}`);
      });
    }

    // Check movements
    console.log("\n--- Stock Movements (inventory_movements) ---");
    const { data: movements, error: mError } = await admin
      .from("inventory_movements")
      .select(`
        id,
        created_at,
        warehouse_id,
        movement_type,
        quantity_delta,
        stock_before,
        stock_after,
        reference_number,
        notes
      `)
      .eq("product_id", product.id)
      .order("created_at", { ascending: false });

    if (mError) {
      console.error("Error fetching movements:", mError);
    } else {
      if (movements.length === 0) {
        console.log("No stock movements found for this product.");
      } else {
        movements.forEach(m => {
          console.log(`[${m.created_at}] Type: ${m.movement_type} | Delta: ${m.quantity_delta} | Before: ${m.stock_before} | After: ${m.stock_after} | Ref: ${m.reference_number} | Note: ${m.notes}`);
        });
      }
    }

    // Check if there are any remaining orders referencing this product that might be active/cancelled
    console.log("\n--- Order Items referencing this product (order_items) ---");
    const { data: orderItems, error: oiError } = await admin
      .from("order_items")
      .select(`
        id,
        order_id,
        quantity,
        quantity_in_base_unit,
        line_total,
        orders (
          order_number,
          order_date,
          status,
          fulfillment_status,
          customers (name)
        )
      `)
      .eq("product_id", product.id);

    if (oiError) {
      console.error("Error fetching order items:", oiError);
    } else {
      if (orderItems.length === 0) {
        console.log("No order items found referencing this product.");
      } else {
        orderItems.forEach(oi => {
          const o = oi.orders;
          console.log(`Order: ${o?.order_number || 'N/A'} | Date: ${o?.order_date || 'N/A'} | Customer: ${o?.customers?.name || 'N/A'} | Status: ${o?.status} | Fulfillment: ${o?.fulfillment_status} | Qty: ${oi.quantity} (Base unit: ${oi.quantity_in_base_unit})`);
        });
      }
    }

    // Check if there are any delivery note items referencing this product
    console.log("\n--- Delivery Note Items referencing this product (delivery_note_items) ---");
    const { data: dnItems, error: dniError } = await admin
      .from("delivery_note_items")
      .select(`
        id,
        delivery_note_id,
        quantity_delivered,
        quantity_in_base_unit,
        delivery_notes (
          delivery_number,
          delivery_date,
          status,
          customers (name)
        )
      `)
      .eq("product_id", product.id);

    if (dniError) {
      console.error("Error fetching delivery note items:", dniError);
    } else {
      if (dnItems.length === 0) {
        console.log("No delivery note items found referencing this product.");
      } else {
        dnItems.forEach(dni => {
          const dn = dni.delivery_notes;
          console.log(`DN: ${dn?.delivery_number || 'N/A'} | Date: ${dn?.delivery_date || 'N/A'} | Customer: ${dn?.customers?.name || 'N/A'} | Status: ${dn?.status} | Delivered Qty: ${dni.quantity_delivered} (Base: ${dni.quantity_in_base_unit})`);
        });
      }
    }

    // Check if there are any inventory receipt items referencing this product
    console.log("\n--- Inventory Receipt Items referencing this product (inventory_receipt_items) ---");
    const { data: receiptItems, error: riError } = await admin
      .from("inventory_receipt_items")
      .select(`
        id,
        receipt_id,
        quantity_received,
        inventory_receipts (
          receipt_number,
          received_at,
          supplier_name
        )
      `)
      .eq("product_id", product.id);

    if (riError) {
      console.error("Error fetching receipt items:", riError);
    } else {
      if (receiptItems.length === 0) {
        console.log("No inventory receipt items found referencing this product.");
      } else {
        receiptItems.forEach(ri => {
          const r = ri.inventory_receipts;
          console.log(`Receipt: ${r?.receipt_number || 'N/A'} | Date: ${r?.received_at || 'N/A'} | Supplier: ${r?.supplier_name} | Received Qty: ${ri.quantity_received}`);
        });
      }
    }
  }
}

run().catch(console.error);
