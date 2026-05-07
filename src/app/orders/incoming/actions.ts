"use server";

import { revalidatePath } from "next/cache";
import { requireAppRole } from "@/lib/auth/authorization";
import { linkLineCustomerAndConvertPendingOrders } from "@/lib/orders/line-pending";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getTodayInBangkok } from "@/lib/orders/date";
import { getEffectiveSaleUnitCost } from "@/lib/products/sale-unit-cost";
import type { ActionResult, CustomerLastOrderSnapshot, CustomerLastOrderItem } from "./types";

// ─── Internal Types ──────────────────────────────────────────────────────────

type SingleResult<T> = Promise<{ data: T | null; error: { message?: string } | null }>;
type ManyResult<T> = Promise<{ data: T[] | null; error: { message?: string } | null }> & SelectChain<T>;

type OrderRow = {
  customer_id: string;
  id: string;
  order_date: string;
  order_number: string;
  organization_id: string;
  status: string;
  total_amount: number | string;
};

type OrderItemRow = {
  id: string;
  line_total: number | string;
  order_id: string;
  product_id: string;
  product_sale_unit_id: string | null;
  quantity: number | string;
  quantity_in_base_unit: number | string;
  sale_unit_label: string;
  sale_unit_ratio: number | string;
  unit_price: number | string;
};

type ProductStockRow = {
  cost_price?: number | string | null;
  reserved_quantity: number | string;
  stock_quantity: number | string;
};
type PriceRow = { product_id: string; product_sale_unit_id: string | null; sale_price: number | string };
type OrderIdRow = { id: string };
type NewOrderRow = { id: string };
type ProductSaleUnitRow = {
  base_unit_quantity: number | string;
  cost_mode?: string | null;
  fixed_cost_price?: number | string | null;
  id: string;
  is_default: boolean;
  product_id: string;
  unit_label: string;
};
type SelectChain<T> = {
  eq: (col: string, val: string | number | boolean) => SelectChain<T>;
  in: (col: string, vals: string[]) => ManyResult<T>;
  limit: (count: number) => SelectChain<T>;
  lt: (col: string, val: string | number) => SelectChain<T>;
  maybeSingle: () => SingleResult<T>;
  order: (col: string, opts: { ascending: boolean }) => ManyResult<T>;
  single: () => SingleResult<T>;
};

type UpdateChain = { eq: (col: string, val: string) => Promise<{ error: { message?: string } | null }> };
type DeleteChain = { eq: (col: string, val: string) => Promise<{ error: { message?: string } | null }> };
type InsertChain = Promise<{ error: { message?: string } | null }>;
type InsertSelectChain = {
  select: (cols: string) => { single: () => SingleResult<NewOrderRow> };
};

type ActionsAdmin = ReturnType<typeof getSupabaseAdmin> & {
  from(table: "orders"): {
    select: (cols: string) => SelectChain<OrderRow>;
    update: (vals: Record<string, unknown>) => UpdateChain;
    insert: (vals: Record<string, unknown>) => InsertSelectChain;
  };
  from(table: "order_items"): {
    select: (cols: string) => SelectChain<OrderItemRow>;
    update: (vals: Record<string, unknown>) => UpdateChain;
    insert: (vals: Record<string, unknown>) => InsertChain;
    delete: () => DeleteChain;
  };
  from(table: "products"): {
    select: (cols: string) => SelectChain<ProductStockRow>;
    update: (vals: Record<string, unknown>) => UpdateChain;
  };
  from(table: "inventory_movements"): {
    insert: (vals: Record<string, unknown>) => InsertChain;
  };
  from(table: "customer_product_prices"): {
    select: (cols: string) => SelectChain<PriceRow>;
    upsert: (
      vals: Record<string, unknown>,
      opts: { onConflict: string },
    ) => Promise<{ error: { message?: string } | null }>;
  };
  from(table: "product_sale_units"): {
    select: (cols: string) => SelectChain<ProductSaleUnitRow>;
  };
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

// For the remaining-items check (need .eq().select() chain returning id array)
type SimpleSelectChain = {
  eq: (col: string, val: string) => Promise<{ data: OrderIdRow[] | null; error: unknown }>;
};
type MinimalAdmin = { from(table: string): { select: (cols: string) => SimpleSelectChain } };

function getPreviousDate(isoDate: string) {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? isoDate : getTodayInBangkok();
  const [year, month, day] = safeDate.split("-").map((value) => Number(value));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

// ─── Helper: restore stock on cancellation ───────────────────────────────────

async function restoreItemStock(
  admin: ActionsAdmin,
  orgId: string,
  userId: string,
  productId: string,
  qtyBase: number,
  note: string,
) {
  if (qtyBase <= 0) return;

  const { data: product } = await admin
    .from("products")
    .select("stock_quantity")
    .eq("id", productId)
    .single();

  if (!product) return;

  const stockBefore = Number(product.stock_quantity);
  const stockAfter = stockBefore - qtyBase;

  await Promise.all([
    admin.from("products").update({ stock_quantity: stockAfter }).eq("id", productId),

    admin.from("inventory_movements").insert({
      created_by: userId,
      metadata: { source: "order_management" },
      movement_type: "adjustment",
      notes: note,
      organization_id: orgId,
      product_id: productId,
      quantity_delta: qtyBase,
      stock_after: stockAfter,
      stock_before: stockBefore,
    }),
  ]);
}

// ─── Cancel order ─────────────────────────────────────────────────────────────

export async function cancelOrderAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;
  const orderId = String(formData.get("orderId") ?? "").trim();

  if (!orderId) return { error: "ไม่พบรหัสออเดอร์" };

  const { data: order } = await admin
    .from("orders")
    .select("id, status, order_number, organization_id")
    .eq("id", orderId)
    .eq("organization_id", session.organizationId)
    .single();

  if (!order) return { error: "ไม่พบออเดอร์นี้" };
  if (order.status !== "submitted") return { error: "ยกเลิกได้เฉพาะออเดอร์สถานะ 'รับแล้ว' เท่านั้น" };

  const { data: items } = await admin
    .from("order_items")
    .select("product_id, quantity_in_base_unit")
    .eq("order_id", orderId)
    .in("order_id", [orderId]);

  await Promise.all(
    (items ?? []).map((item) =>
      restoreItemStock(
        admin,
        session.organizationId,
        session.userId,
        item.product_id,
        Number(item.quantity_in_base_unit),
        `ยกเลิกออเดอร์ ${order.order_number}`,
      ),
    ),
  );

  await admin.from("orders").update({ status: "cancelled" }).eq("id", orderId);

  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  return { success: true };
}

// ─── Update item quantity ─────────────────────────────────────────────────────

export async function updateOrderItemQtyAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;
  const itemId = String(formData.get("itemId") ?? "").trim();
  const newQty = Number(formData.get("quantity"));

  if (!itemId || !Number.isFinite(newQty) || newQty <= 0) return { error: "ข้อมูลไม่ถูกต้อง" };

  const { data: item } = await admin
    .from("order_items")
    .select("order_id, product_id, quantity, quantity_in_base_unit, sale_unit_ratio, unit_price")
    .eq("id", itemId)
    .single();

  if (!item) return { error: "ไม่พบรายการสินค้า" };

  const { data: order } = await admin
    .from("orders")
    .select("id, status, organization_id, total_amount, order_number")
    .eq("id", item.order_id)
    .single();

  if (!order || order.organization_id !== session.organizationId) return { error: "ไม่พบออเดอร์" };
  if (order.status !== "submitted") return { error: "แก้ไขได้เฉพาะออเดอร์สถานะ 'รับแล้ว'" };

  const oldQty = Number(item.quantity);
  const ratio = Number(item.sale_unit_ratio) || 1;
  const unitPrice = Number(item.unit_price);
  const newQtyBase = newQty * ratio;
  const oldQtyBase = Number(item.quantity_in_base_unit);
  const qtyDelta = newQtyBase - oldQtyBase;
  const newLineTotal = newQty * unitPrice;
  const oldLineTotal = oldQty * unitPrice;
  const newTotal = Math.max(0, Number(order.total_amount) + (newLineTotal - oldLineTotal));

  await admin
    .from("order_items")
    .update({ line_total: newLineTotal, quantity: newQty, quantity_in_base_unit: newQtyBase })
    .eq("id", itemId);

  await admin
    .from("orders")
    .update({ subtotal_amount: newTotal, total_amount: newTotal })
    .eq("id", item.order_id);

  if (qtyDelta !== 0) {
    const { data: product } = await admin
      .from("products")
      .select("stock_quantity")
      .eq("id", item.product_id)
      .single();

    if (product) {
      const stockBefore = Number(product.stock_quantity);
      // qtyDelta > 0 means more items ordered -> deduct stock
      // qtyDelta < 0 means fewer items ordered -> restore stock
      const stockAfter = Math.max(0, stockBefore - qtyDelta);
      
      await Promise.all([
        admin.from("products").update({ stock_quantity: stockAfter }).eq("id", item.product_id),
        admin.from("inventory_movements").insert({
          created_by: session.userId,
          metadata: { order_id: item.order_id, order_item_id: itemId, source: "order_management" },
          movement_type: qtyDelta > 0 ? "issue" : "adjustment",
          notes: `แก้ไขจำนวน ออเดอร์ ${order.order_number}`,
          organization_id: session.organizationId,
          product_id: item.product_id,
          quantity_delta: -qtyDelta,
          stock_after: stockAfter,
          stock_before: stockBefore,
        }),

      ]);
    }
  }

  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  return { success: true };
}

// ─── Remove item ──────────────────────────────────────────────────────────────

export async function removeOrderItemAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;
  const itemId = String(formData.get("itemId") ?? "").trim();

  if (!itemId) return { error: "ไม่พบรหัสรายการ" };

  const { data: item } = await admin
    .from("order_items")
    .select("order_id, product_id, quantity_in_base_unit, line_total")
    .eq("id", itemId)
    .single();

  if (!item) return { error: "ไม่พบรายการสินค้า" };

  const { data: order } = await admin
    .from("orders")
    .select("id, status, organization_id, total_amount, order_number")
    .eq("id", item.order_id)
    .single();

  if (!order || order.organization_id !== session.organizationId) return { error: "ไม่พบออเดอร์" };
  if (order.status !== "submitted") return { error: "แก้ไขได้เฉพาะออเดอร์สถานะ 'รับแล้ว'" };

  const qtyBase = Number(item.quantity_in_base_unit);
  const lineTotal = Number(item.line_total);

  await admin.from("order_items").delete().eq("id", itemId);
  await restoreItemStock(
    admin,
    session.organizationId,
    session.userId,
    item.product_id,
    qtyBase,
    `ลบรายการจากออเดอร์ ${order.order_number}`,
  );

  const newTotal = Math.max(0, Number(order.total_amount) - lineTotal);
  await admin
    .from("orders")
    .update({ subtotal_amount: newTotal, total_amount: newTotal })
    .eq("id", item.order_id);

  // Auto-cancel if no items remain
  const minAdmin = getSupabaseAdmin() as unknown as MinimalAdmin;
  const { data: remaining } = await minAdmin
    .from("order_items")
    .select("id")
    .eq("order_id", item.order_id);

  if (!remaining || remaining.length === 0) {
    await admin.from("orders").update({ status: "cancelled" }).eq("id", item.order_id);
  }

  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  return { success: true };
}

// ─── Update customer vehicle from incoming order list ─────────────────────────

export async function updateCustomerVehicleFromIncomingOrderAction(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin();
  const customerId = String(formData.get("customerId") ?? "").trim();
  const vehicleId = String(formData.get("vehicleId") ?? "").trim();

  if (!customerId || !vehicleId) {
    return { error: "กรุณาเลือกรถส่งของ" };
  }

  const { data: vehicle, error: vehicleError } = await admin
    .from("vehicles")
    .select("id")
    .eq("organization_id", session.organizationId)
    .eq("id", vehicleId)
    .eq("is_active", true)
    .maybeSingle();

  if (vehicleError || !vehicle) {
    return { error: "ไม่พบรถส่งของที่เลือก" };
  }

  const { error } = await admin
    .from("customers")
    .update({
      default_vehicle_id: vehicleId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", customerId)
    .eq("organization_id", session.organizationId)
    .eq("is_active", true);

  if (error) {
    return { error: error.message ?? "บันทึกรถส่งของไม่สำเร็จ" };
  }

  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  revalidatePath("/delivery");
  revalidatePath("/settings/customers");
  return { success: true };
}

// ─── Add item to existing order ───────────────────────────────────────────────

export async function addOrderItemAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;

  const orderId = String(formData.get("orderId") ?? "").trim();
  const productId = String(formData.get("productId") ?? "").trim();
  const productSaleUnitId = String(formData.get("productSaleUnitId") ?? "").trim();
  const quantity = Number(formData.get("quantity") ?? 0);
  const unitPrice = Number(formData.get("unitPrice") ?? 0);

  if (!orderId || !productId) return { error: "ข้อมูลสินค้าไม่ครบถ้วน" };
  if (!Number.isFinite(quantity) || quantity <= 0) return { error: "จำนวนสินค้าต้องมากกว่า 0" };
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return { error: "ราคาสินค้าต้องมากกว่า 0" };

  const { data: order } = await admin
    .from("orders")
    .select("id, customer_id, status, organization_id, total_amount, order_number")
    .eq("id", orderId)
    .single();

  if (!order || order.organization_id !== session.organizationId) return { error: "ไม่พบออเดอร์" };
  if (order.status !== "submitted") return { error: "แก้ไขได้เฉพาะออเดอร์สถานะรับแล้ว" };

  const { data: saleUnit } = productSaleUnitId
    ? await admin
        .from("product_sale_units")
        .select("id, product_id, unit_label, base_unit_quantity, is_default, cost_mode, fixed_cost_price")
        .eq("organization_id", session.organizationId)
        .eq("id", productSaleUnitId)
        .eq("is_active", true)
        .single()
    : await admin
        .from("product_sale_units")
        .select("id, product_id, unit_label, base_unit_quantity, is_default, cost_mode, fixed_cost_price")
        .eq("organization_id", session.organizationId)
        .eq("product_id", productId)
        .eq("is_active", true)
        .eq("is_default", true)
        .single();

  if (!saleUnit || saleUnit.product_id !== productId) {
    return { error: "ไม่พบหน่วยขายของสินค้านี้" };
  }

  const { data: product } = await admin
    .from("products")
    .select("stock_quantity, reserved_quantity, cost_price")
    .eq("organization_id", session.organizationId)
    .eq("id", productId)
    .single();

  if (!product) return { error: "ไม่พบสินค้า" };

  const saleUnitRatio = Number(saleUnit.base_unit_quantity) || 1;
  const effectiveCost = getEffectiveSaleUnitCost({
    baseCostPrice: Number(product.cost_price ?? 0),
    baseUnitQuantity: saleUnitRatio,
    costMode: saleUnit.cost_mode ?? null,
    fixedCostPrice:
      saleUnit.fixed_cost_price === null || saleUnit.fixed_cost_price === undefined
        ? null
        : Number(saleUnit.fixed_cost_price),
  });

  if (effectiveCost > 0 && unitPrice < effectiveCost) {
    return { error: `ราคาต่ำกว่าต้นทุน ฿${effectiveCost.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` };
  }

  const quantityInBaseUnit = quantity * saleUnitRatio;
  const lineTotal = quantity * unitPrice;

  const { error: priceError } = await admin.from("customer_product_prices").upsert(
    {
      customer_id: order.customer_id,
      organization_id: session.organizationId,
      product_id: productId,
      product_sale_unit_id: saleUnit.id,
      sale_price: unitPrice,
    },
    {
      onConflict: "organization_id,customer_id,product_sale_unit_id",
    },
  );

  if (priceError) {
    return { error: priceError.message ?? "บันทึกราคาสินค้าไม่สำเร็จ" };
  }

  await admin.from("order_items").insert({
    cost_price: Number(product.cost_price ?? 0),
    line_total: lineTotal,
    order_id: orderId,
    organization_id: session.organizationId,
    product_id: productId,
    product_sale_unit_id: saleUnit.id,
    quantity,
    quantity_in_base_unit: quantityInBaseUnit,
    sale_unit_label: saleUnit.unit_label,
    sale_unit_ratio: saleUnitRatio,
    unit_price: unitPrice,
  });
const stockBefore = Number(product.stock_quantity);
const stockAfter = stockBefore - quantityInBaseUnit;

await Promise.all([
  admin.from("products").update({ stock_quantity: stockAfter }).eq("id", productId),

    admin.from("inventory_movements").insert({
      created_by: session.userId,
      metadata: { order_id: orderId, source: "order_management" },
      movement_type: "issue",
      notes: `เพิ่มสินค้าในออเดอร์ ${order.order_number}`,
      organization_id: session.organizationId,
      product_id: productId,
      quantity_delta: -quantityInBaseUnit,
      stock_after: stockAfter,
      stock_before: stockBefore,
    }),
  ]);

  const nextTotal = Number(order.total_amount) + lineTotal;
  await admin
    .from("orders")
    .update({ subtotal_amount: nextTotal, total_amount: nextTotal })
    .eq("id", orderId);

  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  return { success: true };
}

export async function fetchCustomerPricesAction(
  customerId: string,
): Promise<Record<string, number>> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;

  const { data } = await admin
    .from("customer_product_prices")
    .select("product_sale_unit_id, product_id, sale_price")
    .eq("customer_id", customerId)
    .eq("organization_id", session.organizationId)
    .in("customer_id", [customerId]);

  const result: Record<string, number> = {};
  for (const row of data ?? []) {
    const key = row.product_sale_unit_id ?? row.product_id;
    result[key] = Number(row.sale_price);
  }
  return result;
}

export async function upsertCustomerPriceFromOrderModalAction(input: {
  customerId: string;
  productId: string;
  productSaleUnitId: string | null;
  salePrice: number;
}): Promise<{ success: true } | { error: string }> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;

  const customerId = String(input.customerId ?? "").trim();
  const productId = String(input.productId ?? "").trim();
  const salePrice = Number(input.salePrice);

  if (!customerId || !productId || !Number.isFinite(salePrice) || salePrice < 0) {
    return { error: "ข้อมูลราคาไม่ถูกต้อง" };
  }

  let productSaleUnitId = String(input.productSaleUnitId ?? "").trim();

  if (!productSaleUnitId) {
    const { data: defaultUnit, error: defaultUnitError } = await admin
      .from("product_sale_units")
      .select("id, product_id, unit_label, base_unit_quantity, is_default")
      .eq("organization_id", session.organizationId)
      .eq("product_id", productId)
      .eq("is_active", true)
      .eq("is_default", true)
      .single();

    if (defaultUnitError || !defaultUnit?.id) {
      return { error: "ไม่พบหน่วยขายหลักของสินค้า" };
    }

    productSaleUnitId = defaultUnit.id;
  }

  const { data: saleUnit, error: saleUnitError } = await admin
    .from("product_sale_units")
    .select("id, product_id, unit_label, base_unit_quantity, is_default")
    .eq("organization_id", session.organizationId)
    .eq("id", productSaleUnitId)
    .eq("is_active", true)
    .single();

  if (saleUnitError || !saleUnit) {
    return { error: "ไม่พบหน่วยขายที่ต้องการบันทึกราคา" };
  }

  const { error } = await admin.from("customer_product_prices").upsert(
    {
      customer_id: customerId,
      organization_id: session.organizationId,
      product_id: saleUnit.product_id,
      product_sale_unit_id: saleUnit.id,
      sale_price: salePrice,
    },
    {
      onConflict: "organization_id,customer_id,product_sale_unit_id",
    },
  );

  if (error) {
    return { error: error.message ?? "บันทึกราคาไม่สำเร็จ" };
  }

  revalidatePath("/orders/incoming");
  revalidatePath("/settings/customers/pricing");
  return { success: true };
}

// ─── Customer Order History (Updated: 2024-05-04 16:30) ──────────────────────
export async function fetchCustomerLastOrderItemsAction(
  customerId: string,
  orderDate: string,
): Promise<CustomerLastOrderSnapshot> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;

  if (!customerId) {
    return { items: [], orderCount: 0, sourceDate: getPreviousDate(orderDate) };
  }

  // Find the most recent order date before orderDate
  const { data: lastOrder } = await admin
    .from("orders")
    .select("order_date")
    .eq("organization_id", session.organizationId)
    .eq("customer_id", customerId)
    .lt("order_date", orderDate)
    .in("status", ["submitted", "confirmed"])
    .order("order_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sourceDate = lastOrder?.order_date ?? getPreviousDate(orderDate);

  const { data: orders } = await admin
    .from("orders")
    .select("id, customer_id, order_date")
    .eq("organization_id", session.organizationId)
    .eq("customer_id", customerId)
    .eq("order_date", sourceDate)
    .in("status", ["submitted", "confirmed"]);

  const orderIds = (orders ?? []).map((row) => row.id);
  if (orderIds.length === 0) {
    return { items: [], orderCount: 0, sourceDate };
  }

  const { data: orderItems } = await admin
    .from("order_items")
    .select("product_id, product_sale_unit_id, quantity, sale_unit_label, sale_unit_ratio, unit_price")
    .in("order_id", orderIds);

  const grouped = new Map<string, CustomerLastOrderItem>();

  for (const row of orderItems ?? []) {
    const saleUnitId = row.product_sale_unit_id;
    const key = `${row.product_id}__${saleUnitId ?? "__default__"}`;
    const quantity = Number(row.quantity);
    const saleUnitBaseQty = Number(row.sale_unit_ratio) || 1;
    const unitPrice = Number(row.unit_price) || 0;

    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += quantity;
      continue;
    }

    grouped.set(key, {
      productId: row.product_id,
      quantity,
      saleUnitBaseQty,
      saleUnitId,
      saleUnitLabel: row.sale_unit_label,
      unitPrice,
    });
  }

  return {
    items: Array.from(grouped.values()),
    orderCount: orderIds.length,
    sourceDate,
  };
}

// ─── Create manual order ──────────────────────────────────────────────────────

type ManualOrderItem = {
  productId: string;
  quantity: number;
  saleUnitBaseQty: number;
  saleUnitId: string | null;
  saleUnitLabel: string;
  unitPrice: number;
};

export async function createManualOrderAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;

  const customerId = String(formData.get("customerId") ?? "").trim();
  const channel = String(formData.get("channel") ?? "created").trim();
  const orderDate = String(formData.get("orderDate") ?? getTodayInBangkok()).trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const itemsJson = String(formData.get("items") ?? "[]");

  let items: ManualOrderItem[];
  try {
    items = JSON.parse(itemsJson) as ManualOrderItem[];
  } catch {
    return { error: "ข้อมูลสินค้าไม่ถูกต้อง" };
  }

  if (!customerId) return { error: "กรุณาเลือกลูกค้า" };
  if (items.length === 0) return { error: "กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ" };

  console.log(`[createManualOrderAction] Received Date: ${orderDate}, Customer: ${customerId}`);

  const { data: orderNumber } = await admin.rpc("next_order_number", {
    p_order_date: orderDate,
    p_organization_id: session.organizationId,
  });

  if (!orderNumber) return { error: "ไม่สามารถสร้างเลขออเดอร์ได้" };

  const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  const { data: newOrder, error: insertError } = await admin
    .from("orders")
    .insert({
      customer_id: customerId,
      fulfillment_status: "pending",
      metadata: { channel, source: "manual" },
      notes,
      order_date: orderDate,
      order_number: String(orderNumber),
      organization_id: session.organizationId,
      placed_by_user_id: session.userId,
      status: "submitted",
      subtotal_amount: totalAmount,
      total_amount: totalAmount,
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("[createManualOrderAction] Insert Error:", insertError);
    return { error: "ไม่สามารถสร้างออเดอร์ได้" };
  }
  
  if (!newOrder) return { error: "ไม่สามารถสร้างออเดอร์ได้" };

  const orderId = newOrder.id;
  console.log(`[createManualOrderAction] Order Created: ${orderId} for Date: ${orderDate}`);

  for (const item of items) {
    const qtyBase = item.quantity * item.saleUnitBaseQty;
    const lineTotal = item.quantity * item.unitPrice;

    await admin.from("order_items").insert({
      cost_price: 0,
      line_total: lineTotal,
      order_id: orderId,
      organization_id: session.organizationId,
      product_id: item.productId,
      product_sale_unit_id: item.saleUnitId,
      quantity: item.quantity,
      quantity_in_base_unit: qtyBase,
      sale_unit_label: item.saleUnitLabel,
      sale_unit_ratio: item.saleUnitBaseQty,
      unit_price: item.unitPrice,
    });

    if (qtyBase > 0) {
      const { data: product } = await admin
        .from("products")
        .select("stock_quantity")
        .eq("id", item.productId)
        .single();

      if (product) {
        const stockBefore = Number(product.stock_quantity);
        const stockAfter = stockBefore - qtyBase;
        await Promise.all([
          admin
            .from("products")
            .update({ stock_quantity: stockAfter })
            .eq("id", item.productId),
          admin.from("inventory_movements").insert({
            created_by: session.userId,
            metadata: { channel, order_id: orderId, source: "manual_order" },
            movement_type: "issue",
            notes: `ออเดอร์ manual: ${String(orderNumber)}`,
            organization_id: session.organizationId,
            product_id: item.productId,
            quantity_delta: -qtyBase,
            stock_after: stockAfter,
            stock_before: stockBefore,
          }),
        ]);
      }
    }
  }

  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  return { success: true, orderNumber: String(orderNumber) };
}

export async function linkPendingLineOrderAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const pendingOrderId = String(formData.get("pendingOrderId") ?? "").trim();
  const customerId = String(formData.get("customerId") ?? "").trim();

  if (!pendingOrderId || !customerId) {
    return { error: "กรุณาเลือกร้านค้าที่ต้องการผูก" };
  }

  const result = await linkLineCustomerAndConvertPendingOrders({
    customerId,
    organizationId: session.organizationId,
    pendingOrderId,
    userId: session.userId,
  });

  if ("error" in result) {
    return { error: result.error ?? "ผูกร้านค้าไม่สำเร็จ" };
  }

  return {
    receiptWarning: result.receiptErrors.length > 0
      ? `สร้างออเดอร์แล้ว แต่ส่งใบยืนยันไป LINE ไม่สำเร็จ: ${result.receiptErrors.join(" | ")}`
      : undefined,
    success: true,
    orderNumber: result.orderNumbers.join(", "),
  };
}

export async function updateIncomingOrderDateAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;
  const orderId = String(formData.get("orderId") ?? "").trim();
  const nextOrderDate = String(formData.get("orderDate") ?? "").trim();

  if (!orderId) {
    return { error: "ไม่พบเลขออเดอร์ที่ต้องการแก้ไข" };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(nextOrderDate)) {
    return { error: "รูปแบบวันที่ออเดอร์ไม่ถูกต้อง" };
  }

  const { data: order } = await admin
    .from("orders")
    .select("id, status, order_number, order_date, organization_id")
    .eq("id", orderId)
    .single();

  if (!order || order.organization_id !== session.organizationId) {
    return { error: "ไม่พบออเดอร์นี้" };
  }

  if (order.status === "cancelled") {
    return { error: "ออเดอร์ที่ยกเลิกแล้วไม่สามารถแก้ไขวันที่ได้" };
  }

  if (order.order_date === nextOrderDate) {
    return { success: true, orderDate: nextOrderDate, orderNumber: order.order_number };
  }

  const { data: nextOrderNumber, error: nextOrderNumberError } = await admin.rpc("next_order_number", {
    p_order_date: nextOrderDate,
    p_organization_id: session.organizationId,
  });

  if (nextOrderNumberError || !nextOrderNumber) {
    return { error: nextOrderNumberError?.message ?? "สร้างเลขออเดอร์ใหม่ไม่สำเร็จ" };
  }

  const { error: updateError } = await admin
    .from("orders")
    .update({
      order_date: nextOrderDate,
      order_number: String(nextOrderNumber),
    })
    .eq("id", orderId);

  if (updateError) {
    return { error: updateError.message ?? "บันทึกวันที่ออเดอร์ไม่สำเร็จ" };
  }

  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  revalidatePath("/delivery");

  return { success: true, orderDate: nextOrderDate, orderNumber: String(nextOrderNumber) };
}
