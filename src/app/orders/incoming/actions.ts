"use server";

import { revalidatePath } from "next/cache";
import { requireAppRole } from "@/lib/auth/authorization";
import { linkLineCustomerAndConvertPendingOrders } from "@/lib/orders/line-pending";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getTodayInBangkok } from "@/lib/orders/date";
import { getEffectiveSaleUnitCost } from "@/lib/products/sale-unit-cost";
import { getCustomersForOrder, getProductsForOrder, type OrderCustomerOption, type OrderProductOption } from "@/lib/orders/manage";
import { getOrderDetailById, type OrderDetailData } from "@/lib/orders/detail";
import { syncBillingSnapshotsForDeliveryNumbers } from "@/lib/billing/actions";
import { mergeItemsIntoOrder, type MergeableOrderItemInput } from "@/lib/orders/merge-order-items";
import { syncDeliveryNoteForOrder } from "@/lib/orders/sync-delivery-note";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { ActionResult, CustomerLastOrderSnapshot, CustomerLastOrderItem } from "./types";

// â”€â”€â”€ Internal Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type OrderIdRow = { id: string };

type ActionsAdmin = SupabaseClient<Database>;

// For the remaining-items check (need .eq().select() chain returning id array)
type SimpleSelectChain = {
  eq: (col: string, val: string) => Promise<{ data: OrderIdRow[] | null; error: unknown }>;
};
type MinimalAdmin = { from(table: string): { select: (cols: string) => SimpleSelectChain } };

type StockReductionMode = "return" | "lost";

function isEditableOrderStatus(status: string | null | undefined) {
  return status !== "cancelled";
}

function mergeOrderNotes(existingNotes: string | null, nextNotes: string | null) {
  const current = existingNotes?.trim() ?? "";
  const incoming = nextNotes?.trim() ?? "";

  if (!incoming) return current || null;
  if (!current) return incoming;
  if (current.includes(incoming)) return current;
  return `${current} / ${incoming}`;
}

export async function fetchIncomingOrderDetailAction(
  orderId: string,
): Promise<{ detail: OrderDetailData | null; error?: string }> {
  const session = await requireAppRole("admin");
  const id = orderId.trim();

  if (!id) {
    return { detail: null, error: "à¹„à¸¡à¹ˆà¸žà¸šà¸£à¸«à¸±à¸ªà¸­à¸­à¹€à¸”à¸­à¸£à¹Œ" };
  }

  const admin = getSupabaseAdmin() as ActionsAdmin;
  const { data, error } = await admin
    .from("orders")
    .select("id")
    .eq("id", id)
    .eq("organization_id", session.organizationId)
    .maybeSingle();

  if (error) {
    return { detail: null, error: error.message ?? "à¹‚à¸«à¸¥à¸”à¸£à¸²à¸¢à¸¥à¸°à¹€à¸­à¸µà¸¢à¸”à¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¹„à¸¡à¹ˆà¸ªà¸³à¹€à¸£à¹‡à¸ˆ" };
  }

  if (!data) {
    return { detail: null, error: "à¹„à¸¡à¹ˆà¸žà¸šà¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¸™à¸µà¹‰à¹ƒà¸™à¸­à¸‡à¸„à¹Œà¸à¸£à¸‚à¸­à¸‡à¸„à¸¸à¸“" };
  }

  const detail = await getOrderDetailById(session.organizationId, id);
  return { detail };
}

function getPreviousDate(isoDate: string) {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? isoDate : getTodayInBangkok();
  const [year, month, day] = safeDate.split("-").map((value) => Number(value));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

// â”€â”€â”€ Helper: restore stock on cancellation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  const stockAfter = stockBefore + qtyBase;

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

// â”€â”€â”€ Cancel order â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function cancelOrderAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;
  const orderId = String(formData.get("orderId") ?? "").trim();

  if (!orderId) return { error: "à¹„à¸¡à¹ˆà¸žà¸šà¸£à¸«à¸±à¸ªà¸­à¸­à¹€à¸”à¸­à¸£à¹Œ" };

  const { data: order } = await admin
    .from("orders")
    .select("id, status, order_number, organization_id")
    .eq("id", orderId)
    .eq("organization_id", session.organizationId)
    .single();

  if (!order) return { error: "à¹„à¸¡à¹ˆà¸žà¸šà¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¸™à¸µà¹‰" };
  if (order.status !== "submitted" && order.status !== "confirmed") return { error: "à¸¢à¸à¹€à¸¥à¸´à¸à¹„à¸”à¹‰à¹€à¸‰à¸žà¸²à¸°à¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¸ªà¸–à¸²à¸™à¸° 'à¸£à¸±à¸šà¹à¸¥à¹‰à¸§' à¸«à¸£à¸·à¸­ 'à¸¢à¸·à¸™à¸¢à¸±à¸™à¹à¸¥à¹‰à¸§' à¹€à¸—à¹ˆà¸²à¸™à¸±à¹‰à¸™" };

  // If confirmed, it might have delivery note items that deducted stock.
  // We need to clean them up.
  if (order.status === "confirmed") {
    // Delete delivery note items for this order and restore stock
    // Actually restoreItemStock already handles stock, but we should make sure we only restore what was DELIVERED if it's different.
    // In this system, we usually deliver 100% of order quantity.
  }

  const { data: items } = await admin
    .from("order_items")
    .select("product_id, quantity_in_base_unit")
    .eq("order_id", orderId);

  await Promise.all(
    (items ?? []).map((item) =>
      restoreItemStock(
        admin,
        session.organizationId,
        session.userId,
        item.product_id,
        Number(item.quantity_in_base_unit),
        `à¸¢à¸à¹€à¸¥à¸´à¸à¸­à¸­à¹€à¸”à¸­à¸£à¹Œ ${order.order_number}`,
      ),
    ),
  );

  // If there are delivery note items, delete them
  await admin.from("delivery_note_items").delete().eq("order_id", orderId);

  await admin.from("orders").update({ status: "cancelled", fulfillment_status: "pending" }).eq("id", orderId);

  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  return { success: true };
}

// â”€â”€â”€ Update item quantity â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function updateOrderItemQtyAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;
  const itemId = String(formData.get("itemId") ?? "").trim();
  const newQty = Number(formData.get("quantity"));

  if (!itemId || !Number.isFinite(newQty) || newQty <= 0) return { error: "à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¹„à¸¡à¹ˆà¸–à¸¹à¸à¸•à¹‰à¸­à¸‡" };

  const { data: item } = await admin
    .from("order_items")
    .select("order_id, product_id, quantity, quantity_in_base_unit, sale_unit_ratio, unit_price")
    .eq("id", itemId)
    .single();

  if (!item) return { error: "à¹„à¸¡à¹ˆà¸žà¸šà¸£à¸²à¸¢à¸à¸²à¸£à¸ªà¸´à¸™à¸„à¹‰à¸²" };

  const { data: order } = await admin
    .from("orders")
    .select("id, status, organization_id, total_amount, order_number")
    .eq("id", item.order_id)
    .single();

  if (!order || order.organization_id !== session.organizationId) return { error: "à¹„à¸¡à¹ˆà¸žà¸šà¸­à¸­à¹€à¸”à¸­à¸£à¹Œ" };
  if (!isEditableOrderStatus(order.status)) return { error: "à¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¸—à¸µà¹ˆà¸¢à¸à¹€à¸¥à¸´à¸à¹à¸¥à¹‰à¸§à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¹à¸à¹‰à¹„à¸‚à¹„à¸”à¹‰" };

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

  if (qtyDelta !== 0 && order.status === "submitted") {
    const { data: product } = await admin
      .from("products")
      .select("stock_quantity")
      .eq("id", item.product_id)
      .single();

    if (product) {
      const stockBefore = Number(product.stock_quantity);
      // qtyDelta > 0 means more items ordered -> deduct stock
      // qtyDelta < 0 means fewer items ordered -> restore stock
      const stockAfter = stockBefore - qtyDelta;

      await Promise.all([
        admin.from("products").update({ stock_quantity: stockAfter }).eq("id", item.product_id),
        admin.from("inventory_movements").insert({
          created_by: session.userId,
          metadata: { order_id: item.order_id, order_item_id: itemId, source: "order_management" },
          movement_type: qtyDelta > 0 ? "issue" : "adjustment",
          notes: `à¹à¸à¹‰à¹„à¸‚à¸ˆà¸³à¸™à¸§à¸™ à¸­à¸­à¹€à¸”à¸­à¸£à¹Œ ${order.order_number}`,
          organization_id: session.organizationId,
          product_id: item.product_id,
          quantity_delta: -qtyDelta,
          stock_after: stockAfter,
          stock_before: stockBefore,
        }),

      ]);
    }
  }

  if (order.status === "confirmed") {
    const syncRes = await syncOrderDeliveryNoteAction(item.order_id);
    if ("error" in syncRes) {
      return { error: "ปรับปรุงใบส่งของไม่สำเร็จ: " + syncRes.error };
    }
  }

  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  revalidatePath("/billing");
  return { success: true };
}

// â”€â”€â”€ Remove item â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function removeOrderItemAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;
  const itemId = String(formData.get("itemId") ?? "").trim();

  if (!itemId) return { error: "à¹„à¸¡à¹ˆà¸žà¸šà¸£à¸«à¸±à¸ªà¸£à¸²à¸¢à¸à¸²à¸£" };

  const { data: item } = await admin
    .from("order_items")
    .select("order_id, product_id, quantity_in_base_unit, line_total")
    .eq("id", itemId)
    .single();

  if (!item) return { error: "à¹„à¸¡à¹ˆà¸žà¸šà¸£à¸²à¸¢à¸à¸²à¸£à¸ªà¸´à¸™à¸„à¹‰à¸²" };

  const { data: order } = await admin
    .from("orders")
    .select("id, status, organization_id, total_amount, order_number")
    .eq("id", item.order_id)
    .single();

  if (!order || order.organization_id !== session.organizationId) return { error: "à¹„à¸¡à¹ˆà¸žà¸šà¸­à¸­à¹€à¸”à¸­à¸£à¹Œ" };
  if (!isEditableOrderStatus(order.status)) return { error: "à¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¸—à¸µà¹ˆà¸¢à¸à¹€à¸¥à¸´à¸à¹à¸¥à¹‰à¸§à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¹à¸à¹‰à¹„à¸‚à¹„à¸”à¹‰" };

  const qtyBase = Number(item.quantity_in_base_unit);
  const lineTotal = Number(item.line_total);

  await admin.from("order_items").delete().eq("id", itemId);
  if (order.status === "submitted") {
    await restoreItemStock(
      admin,
      session.organizationId,
      session.userId,
      item.product_id,
      qtyBase,
      `à¸¥à¸šà¸£à¸²à¸¢à¸à¸²à¸£à¸ˆà¸²à¸à¸­à¸­à¹€à¸”à¸­à¸£à¹Œ ${order.order_number}`,
    );
  }

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

  if (order.status === "confirmed") {
    const syncRes = await syncOrderDeliveryNoteAction(item.order_id);
    if ("error" in syncRes) {
      return { error: "ปรับปรุงใบส่งของไม่สำเร็จ: " + syncRes.error };
    }
  }

  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  revalidatePath("/billing");
  return { success: true };
}

// â”€â”€â”€ Update customer vehicle from incoming order list â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function updateCustomerVehicleFromIncomingOrderAction(
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin();
  const customerId = String(formData.get("customerId") ?? "").trim();
  const vehicleId = String(formData.get("vehicleId") ?? "").trim();
  const orderDate = String(formData.get("orderDate") ?? "").trim();

  if (!customerId || !vehicleId) {
    return { error: "à¸à¸£à¸¸à¸“à¸²à¹€à¸¥à¸·à¸­à¸à¸£à¸–à¸ªà¹ˆà¸‡à¸‚à¸­à¸‡" };
  }

  const { data: vehicle, error: vehicleError } = await admin
    .from("vehicles")
    .select("id")
    .eq("organization_id", session.organizationId)
    .eq("id", vehicleId)
    .eq("is_active", true)
    .maybeSingle();

  if (vehicleError || !vehicle) {
    return { error: "à¹„à¸¡à¹ˆà¸žà¸šà¸£à¸–à¸ªà¹ˆà¸‡à¸‚à¸­à¸‡à¸—à¸µà¹ˆà¹€à¸¥à¸·à¸­à¸" };
  }

  // 1. Update customer's default vehicle
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
    return { error: error.message ?? "à¸šà¸±à¸™à¸—à¸¶à¸à¸£à¸–à¸ªà¹ˆà¸‡à¸‚à¸­à¸‡à¹„à¸¡à¹ˆà¸ªà¸³à¹€à¸£à¹‡à¸ˆ" };
  }

  // 2. If orderDate is provided, also update existing delivery notes for this customer on that day
  if (orderDate && /^\d{4}-\d{2}-\d{2}$/.test(orderDate)) {
    await admin
      .from("delivery_notes")
      .update({ vehicle_id: vehicleId })
      .eq("customer_id", customerId)
      .eq("delivery_date", orderDate)
      .eq("organization_id", session.organizationId);
  }

  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  revalidatePath("/delivery");
  revalidatePath("/settings/customers");
  return { success: true };
}

// â”€â”€â”€ Add item to existing order â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function updateOrderItemsBatchAction(input: {
  orderId: string;
  removedIds: string[];
  updates: { itemId: string; quantity: number; reductionMode?: StockReductionMode }[];
  additions: {
    productId: string;
    productSaleUnitId: string | null;
    quantity: number;
    unitPrice: number;
  }[];
}): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;
  const { orderId, removedIds, updates, additions } = input;

  if (!orderId) return { error: "à¹„à¸¡à¹ˆà¸žà¸šà¹€à¸¥à¸‚à¸­à¸­à¹€à¸”à¸­à¸£à¹Œ" };

  // 1. Verify order
  const { data: order } = await admin
    .from("orders")
    .select("id, status, organization_id, order_number, total_amount")
    .eq("id", orderId)
    .single();

  if (!order || order.organization_id !== session.organizationId) return { error: "à¹„à¸¡à¹ˆà¸žà¸šà¸­à¸­à¹€à¸”à¸­à¸£à¹Œ" };
  if (!isEditableOrderStatus(order.status)) {
    return { error: "à¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¸—à¸µà¹ˆà¸¢à¸à¹€à¸¥à¸´à¸à¹à¸¥à¹‰à¸§à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¹à¸à¹‰à¹„à¸‚à¹„à¸”à¹‰" };
  }

  // 2. Parallel Data Gathering
  const itemIdsToFetch = [...removedIds, ...updates.map((u) => u.itemId)];
  const additionProductIds = additions.map((a) => a.productId);
  const additionSaleUnitIds = additions.map((a) => a.productSaleUnitId).filter(Boolean) as string[];

  const [itemsRes, additionProductsRes, additionSaleUnitsRes] = await Promise.all([
    itemIdsToFetch.length > 0
      ? admin.from("order_items").select("*").in("id", itemIdsToFetch)
      : Promise.resolve({ data: [] }),
    additionProductIds.length > 0
      ? admin.from("products").select("id, cost_price, stock_quantity").in("id", additionProductIds)
      : Promise.resolve({ data: [] }),
    additionSaleUnitIds.length > 0
      ? admin.from("product_sale_units").select("*").in("id", additionSaleUnitIds)
      : Promise.resolve({ data: [] }),
  ]);

  const itemsMap = new Map((itemsRes.data ?? []).map((i) => [i.id, i]));
  const productsMap = new Map((additionProductsRes.data ?? []).map((p) => [p.id, p]));
  const saleUnitsMap = new Map((additionSaleUnitsRes.data ?? []).map((s) => [s.id, s]));

  // Also need products for existing items to handle stock correctly
  const existingProductIds = Array.from(new Set((itemsRes.data ?? []).map((i) => i.product_id)));
  const missingProductIdsForStock = existingProductIds.filter((id) => !productsMap.has(id));
  if (missingProductIdsForStock.length > 0) {
    const { data: extraProducts } = await admin
      .from("products")
      .select("id, cost_price, stock_quantity")
      .in("id", missingProductIdsForStock);
    (extraProducts ?? []).forEach((p) => productsMap.set(p.id, p));
  }

  // Handle default sale units for additions that don't specify one
  const needsDefaultSaleUnit = additions.filter((a) => !a.productSaleUnitId).map((a) => a.productId);
  if (needsDefaultSaleUnit.length > 0) {
    const { data: defaultUnits } = await admin
      .from("product_sale_units")
      .select("*")
      .in("product_id", needsDefaultSaleUnit)
      .eq("is_default", true);
    (defaultUnits ?? []).forEach((s) => saleUnitsMap.set(`default-${s.product_id}`, s));
  }

  // 3. Prepare Batch Operations
  const itemsToUpdate: Database["public"]["Tables"]["order_items"]["Insert"][] = [];
  const itemsToInsert: Database["public"]["Tables"]["order_items"]["Insert"][] = [];
  const stockDeltas = new Map<string, number>(); // productId -> total qty_in_base_unit change (+ ordered, - ordered)
  const reductionChoiceMap = new Map<string, StockReductionMode>(
    updates
      .filter((update) => update.reductionMode === "return" || update.reductionMode === "lost")
      .map((update) => [update.itemId, update.reductionMode ?? "return"]),
  );
  const lossInBaseUnitByItemId = new Map<string, number>();

  // Removals
  for (const itemId of removedIds) {
    const item = itemsMap.get(itemId);
    if (item && order.status === "submitted") {
      const current = stockDeltas.get(item.product_id) || 0;
      stockDeltas.set(item.product_id, current - Number(item.quantity_in_base_unit));
    }
  }

  // Updates
  for (const update of updates) {
    const item = itemsMap.get(update.itemId);
    if (item && Number(item.quantity) !== update.quantity) {
      const ratio = Number(item.sale_unit_ratio) || 1;
      const newQtyBase = update.quantity * ratio;
      const oldQtyBase = Number(item.quantity_in_base_unit);
      const qtyDelta = newQtyBase - oldQtyBase;
      const newLineTotal = update.quantity * Number(item.unit_price);

      itemsToUpdate.push({
        id: item.id,
        order_id: item.order_id,
        organization_id: item.organization_id,
        product_id: item.product_id,
        sale_unit_label: item.sale_unit_label,
        unit_price: Number(item.unit_price),
        quantity: update.quantity,
        quantity_in_base_unit: newQtyBase,
        line_total: newLineTotal,
        product_sale_unit_id: item.product_sale_unit_id,
        sale_unit_ratio: Number(item.sale_unit_ratio),
        cost_price: Number(item.cost_price),
      });

      if (qtyDelta !== 0) {
        const reductionMode = reductionChoiceMap.get(item.id) ?? "return";
        if (qtyDelta < 0 && reductionMode === "lost") {
          lossInBaseUnitByItemId.set(item.id, Math.abs(qtyDelta));
        }

        if (order.status === "submitted") {
          const current = stockDeltas.get(item.product_id) || 0;
          const effectiveDelta = qtyDelta < 0 && reductionMode === "lost" ? 0 : qtyDelta;
          stockDeltas.set(item.product_id, current + effectiveDelta);
        }
      }
    }
  }

  // Additions
  for (const add of additions) {
    const saleUnit = add.productSaleUnitId
      ? saleUnitsMap.get(add.productSaleUnitId)
      : saleUnitsMap.get(`default-${add.productId}`);

    if (saleUnit) {
      const product = productsMap.get(add.productId);
      const ratio = Number(saleUnit.base_unit_quantity) || 1;
      const lineTotal = add.quantity * add.unitPrice;
      const qtyBase = add.quantity * ratio;

      itemsToInsert.push({
        order_id: orderId,
        organization_id: session.organizationId,
        product_id: add.productId,
        product_sale_unit_id: saleUnit.id,
        quantity: add.quantity,
        quantity_in_base_unit: qtyBase,
        unit_price: add.unitPrice,
        line_total: lineTotal,
        sale_unit_label: saleUnit.unit_label,
        sale_unit_ratio: ratio,
        cost_price: Number(product?.cost_price ?? 0),
      });

      if (order.status === "submitted") {
        const current = stockDeltas.get(add.productId) || 0;
        stockDeltas.set(add.productId, current + qtyBase);
      }
    }
  }

  // 4. Execution
  // Delete removed items
  if (removedIds.length > 0) {
    await admin.from("order_items").delete().in("id", removedIds);
  }

  // Upsert updated and new items
  if (itemsToUpdate.length > 0) {
    const { error: upsertError } = await admin.from("order_items").upsert(itemsToUpdate);
    if (upsertError) return { error: "à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¸›à¸£à¸±à¸šà¸›à¸£à¸¸à¸‡à¸£à¸²à¸¢à¸à¸²à¸£à¸ªà¸´à¸™à¸„à¹‰à¸²à¹„à¸”à¹‰: " + upsertError.message };
  }

  if (itemsToInsert.length > 0) {
    const { error: insertError } = await admin.from("order_items").insert(itemsToInsert);
    if (insertError) return { error: "ไม่สามารถเพิ่มรายการสินค้าได้: " + insertError.message };
  }

  // Update stocks and movements if needed
  if (stockDeltas.size > 0 && order.status === "submitted") {
    const movements: Database["public"]["Tables"]["inventory_movements"]["Insert"][] = [];
    for (const [productId, delta] of stockDeltas.entries()) {
      if (delta === 0) continue;
      const product = productsMap.get(productId);
      if (product) {
        const stockBefore = Number(product.stock_quantity);
        const stockAfter = stockBefore - delta;

        await admin.from("products").update({ stock_quantity: stockAfter }).eq("id", productId);
        movements.push({
          created_by: session.userId,
          metadata: { order_id: orderId, source: "order_management_batch_optimized" },
          movement_type: delta > 0 ? "issue" : "adjustment",
          notes: `à¸›à¸£à¸±à¸šà¸­à¸­à¹€à¸”à¸­à¸£à¹Œ ${order.order_number} (Batch Optimized)`,
          organization_id: session.organizationId,
          product_id: productId,
          quantity_delta: -delta,
          stock_after: stockAfter,
          stock_before: stockBefore,
        });
      }
    }
    if (movements.length > 0) {
      await admin.from("inventory_movements").insert(movements);
    }
  }

  // 5. Recalculate Order Total
  const { data: finalItems } = await admin.from("order_items").select("line_total").eq("order_id", orderId);
  const finalTotal = (finalItems ?? []).reduce((sum, i) => sum + Number(i.line_total), 0);

  await admin.from("orders").update({
    subtotal_amount: finalTotal,
    total_amount: finalTotal,
  }).eq("id", orderId);

  // 6. Sync Delivery Note if needed
  if (order.status === "confirmed") {
    const syncRes = await syncOrderDeliveryNoteAction(orderId, {
      lossInBaseUnitByItemId,
    });
    if ("error" in syncRes) return { error: "à¸›à¸£à¸±à¸šà¸›à¸£à¸¸à¸‡à¹ƒà¸šà¸ªà¹ˆà¸‡à¸‚à¸­à¸‡à¹„à¸¡à¹ˆà¸ªà¸³à¹€à¸£à¹‡à¸ˆ: " + syncRes.error };
  }

  revalidatePath("/orders/incoming");
  return { success: true };
}

export async function addOrderItemAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;

  const orderId = String(formData.get("orderId") ?? "").trim();
  const productId = String(formData.get("productId") ?? "").trim();
  const productSaleUnitId = String(formData.get("productSaleUnitId") ?? "").trim();
  const quantity = Number(formData.get("quantity") ?? 0);
  const unitPrice = Number(formData.get("unitPrice") ?? 0);

  if (!orderId || !productId) return { error: "à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸ªà¸´à¸™à¸„à¹‰à¸²à¹„à¸¡à¹ˆà¸„à¸£à¸šà¸–à¹‰à¸§à¸™" };
  if (!Number.isFinite(quantity) || quantity <= 0) return { error: "à¸ˆà¸³à¸™à¸§à¸™à¸ªà¸´à¸™à¸„à¹‰à¸²à¸•à¹‰à¸­à¸‡à¸¡à¸²à¸à¸à¸§à¹ˆà¸² 0" };
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return { error: "à¸£à¸²à¸„à¸²à¸ªà¸´à¸™à¸„à¹‰à¸²à¸•à¹‰à¸­à¸‡à¸¡à¸²à¸à¸à¸§à¹ˆà¸² 0" };

  const { data: order } = await admin
    .from("orders")
    .select("id, customer_id, status, organization_id, total_amount, order_number")
    .eq("id", orderId)
    .single();

  if (!order || order.organization_id !== session.organizationId) return { error: "à¹„à¸¡à¹ˆà¸žà¸šà¸­à¸­à¹€à¸”à¸­à¸£à¹Œ" };
  if (!isEditableOrderStatus(order.status)) return { error: "à¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¸—à¸µà¹ˆà¸¢à¸à¹€à¸¥à¸´à¸à¹à¸¥à¹‰à¸§à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¹à¸à¹‰à¹„à¸‚à¹„à¸”à¹‰" };

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
    return { error: "à¹„à¸¡à¹ˆà¸žà¸šà¸«à¸™à¹ˆà¸§à¸¢à¸‚à¸²à¸¢à¸‚à¸­à¸‡à¸ªà¸´à¸™à¸„à¹‰à¸²à¸™à¸µà¹‰" };
  }

  const { data: product } = await admin
    .from("products")
    .select("stock_quantity, reserved_quantity, cost_price")
    .eq("organization_id", session.organizationId)
    .eq("id", productId)
    .single();

  if (!product) return { error: "à¹„à¸¡à¹ˆà¸žà¸šà¸ªà¸´à¸™à¸„à¹‰à¸²" };

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
    return { error: `à¸£à¸²à¸„à¸²à¸•à¹ˆà¸³à¸à¸§à¹ˆà¸²à¸•à¹‰à¸™à¸—à¸¸à¸™ à¸¿${effectiveCost.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` };
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
    return { error: priceError.message ?? "à¸šà¸±à¸™à¸—à¸¶à¸à¸£à¸²à¸„à¸²à¸ªà¸´à¸™à¸„à¹‰à¸²à¹„à¸¡à¹ˆà¸ªà¸³à¹€à¸£à¹‡à¸ˆ" };
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
  if (order.status === "submitted") {
    const stockBefore = Number(product.stock_quantity);
    const stockAfter = stockBefore - quantityInBaseUnit;

    await Promise.all([
      admin.from("products").update({ stock_quantity: stockAfter }).eq("id", productId),

      admin.from("inventory_movements").insert({
        created_by: session.userId,
        metadata: { order_id: orderId, source: "order_management" },
        movement_type: "issue",
        notes: `à¹€à¸žà¸´à¹ˆà¸¡à¸ªà¸´à¸™à¸„à¹‰à¸²à¹ƒà¸™à¸­à¸­à¹€à¸”à¸­à¸£à¹Œ ${order.order_number}`,
        organization_id: session.organizationId,
        product_id: productId,
        quantity_delta: -quantityInBaseUnit,
        stock_after: stockAfter,
        stock_before: stockBefore,
      }),
    ]);
  }

  const nextTotal = Number(order.total_amount) + lineTotal;
  await admin
    .from("orders")
    .update({ subtotal_amount: nextTotal, total_amount: nextTotal })
    .eq("id", orderId);

  if (order.status === "confirmed") {
    const syncRes = await syncOrderDeliveryNoteAction(orderId);
    if ("error" in syncRes) {
      return { error: "ปรับปรุงใบส่งของไม่สำเร็จ: " + syncRes.error };
    }
  }

  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  revalidatePath("/billing");
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
    return { error: "à¸‚à¹‰à¸­à¸¡à¸¹à¸¥à¸£à¸²à¸„à¸²à¹„à¸¡à¹ˆà¸–à¸¹à¸à¸•à¹‰à¸­à¸‡" };
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
      return { error: "à¹„à¸¡à¹ˆà¸žà¸šà¸«à¸™à¹ˆà¸§à¸¢à¸‚à¸²à¸¢à¸«à¸¥à¸±à¸à¸‚à¸­à¸‡à¸ªà¸´à¸™à¸„à¹‰à¸²" };
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
    return { error: "à¹„à¸¡à¹ˆà¸žà¸šà¸«à¸™à¹ˆà¸§à¸¢à¸‚à¸²à¸¢à¸—à¸µà¹ˆà¸•à¹‰à¸­à¸‡à¸à¸²à¸£à¸šà¸±à¸™à¸—à¸¶à¸à¸£à¸²à¸„à¸²" };
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
    return { error: error.message ?? "à¸šà¸±à¸™à¸—à¸¶à¸à¸£à¸²à¸„à¸²à¹„à¸¡à¹ˆà¸ªà¸³à¹€à¸£à¹‡à¸ˆ" };
  }

  revalidatePath("/orders/incoming");
  revalidatePath("/settings/customers/pricing");
  return { success: true };
}

// â”€â”€â”€ Customer Order History (Updated: 2024-05-04 16:30) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€â”€ Create manual order â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type ManualOrderItem = {
  productId: string;
  quantity: number;
  saleUnitBaseQty: number;
  saleUnitId: string | null;
  saleUnitLabel: string;
  unitPrice: number;
};

function mapManualItemsToMergeableInputs(
  items: ManualOrderItem[],
): MergeableOrderItemInput[] {
  return items.map((item) => ({
    costPrice: 0,
    productId: item.productId,
    productSaleUnitId: item.saleUnitId,
    quantity: item.quantity,
    quantityInBaseUnit: item.quantity * item.saleUnitBaseQty,
    saleUnitLabel: item.saleUnitLabel,
    saleUnitRatio: item.saleUnitBaseQty,
    unitPrice: item.unitPrice,
  }));
}

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

  const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const { data: existingOrderRows, error: existingOrderError } = await admin
    .from("orders")
    .select("id, order_number, notes, subtotal_amount, total_amount, created_at, status")
    .eq("organization_id", session.organizationId)
    .eq("customer_id", customerId)
    .eq("order_date", orderDate)
    .order("created_at", { ascending: true });

  if (existingOrderError) {
    console.error("[createManualOrderAction] Existing Order Lookup Error:", existingOrderError);
    return { error: "ไม่สามารถตรวจสอบออเดอร์เดิมได้" };
  }

  const existingOrder = (existingOrderRows ?? []).find((row) => row.status !== "cancelled") ?? null;

  let orderId = existingOrder?.id ?? null;
  let effectiveOrderNumber = existingOrder?.order_number ?? null;

  if (!orderId || !effectiveOrderNumber) {
    const { data: nextOrderNumber } = await admin.rpc("next_order_number", {
      p_order_date: orderDate,
      p_organization_id: session.organizationId,
    });

    if (!nextOrderNumber) return { error: "ไม่สามารถสร้างเลขออเดอร์ได้" };

    const { data: newOrder, error: insertError } = await admin
      .from("orders")
      .insert({
        customer_id: customerId,
        fulfillment_status: "pending",
        metadata: { channel, source: "manual" },
        notes,
        order_date: orderDate,
        order_number: String(nextOrderNumber),
        organization_id: session.organizationId,
        placed_by_user_id: session.userId,
        status: "submitted",
        subtotal_amount: totalAmount,
        total_amount: totalAmount,
      })
      .select("id, order_number")
      .single();

    if (insertError || !newOrder) {
      console.error("[createManualOrderAction] Insert Error:", insertError);
      return { error: "ไม่สามารถสร้างออเดอร์ได้" };
    }

    orderId = newOrder.id;
    effectiveOrderNumber = newOrder.order_number;
    console.log(`[createManualOrderAction] Order Created: ${orderId} for Date: ${orderDate}`);
  } else {
    const currentOrder = existingOrder!;
    const mergedNotes = mergeOrderNotes(currentOrder.notes ?? null, notes);
    const updatePayload: Record<string, unknown> = {
      subtotal_amount: Number(currentOrder.subtotal_amount ?? 0) + totalAmount,
      total_amount: Number(currentOrder.total_amount ?? 0) + totalAmount,
    };

    if (mergedNotes !== (currentOrder.notes ?? null)) {
      updatePayload.notes = mergedNotes;
    }

    const { error: updateExistingOrderError } = await admin
      .from("orders")
      .update(updatePayload)
      .eq("id", orderId);

    if (updateExistingOrderError) {
      console.error("[createManualOrderAction] Existing Order Update Error:", updateExistingOrderError);
      return { error: "ไม่สามารถอัปเดตออเดอร์เดิมได้" };
    }

    console.log(`[createManualOrderAction] Merged Into Existing Order: ${orderId} for Date: ${orderDate}`);
  }

  const mergeResult = await mergeItemsIntoOrder(admin, {
    items: mapManualItemsToMergeableInputs(items),
    orderId,
    organizationId: session.organizationId,
  });

  if ("error" in mergeResult) {
    console.error("[createManualOrderAction] Merge Items Error:", mergeResult.error);
    return { error: mergeResult.error ?? "ไม่สามารถรวมรายการสินค้าในออเดอร์ได้" };
  }

  const { data: finalItems, error: finalItemsError } = await admin
    .from("order_items")
    .select("line_total")
    .eq("order_id", orderId);

  if (finalItemsError) {
    console.error("[createManualOrderAction] Final Items Error:", finalItemsError);
    return { error: "ไม่สามารถคำนวณยอดรวมออเดอร์ได้" };
  }

  const finalTotal = (finalItems ?? []).reduce((sum, item) => sum + Number(item.line_total ?? 0), 0);
  const { error: finalTotalUpdateError } = await admin
    .from("orders")
    .update({
      subtotal_amount: finalTotal,
      total_amount: finalTotal,
    })
    .eq("id", orderId);

  if (finalTotalUpdateError) {
    console.error("[createManualOrderAction] Final Total Update Error:", finalTotalUpdateError);
    return { error: "ไม่สามารถอัปเดตยอดรวมออเดอร์ได้" };
  }

  const syncResult = await syncDeliveryNoteForOrder(admin, {
    orderId,
    organizationId: session.organizationId,
    userId: session.userId,
  });

  if ("error" in syncResult) {
    console.error("[createManualOrderAction] Delivery Note Sync Error:", syncResult.error);
    return {
      success: true,
      orderNumber: String(effectiveOrderNumber),
      receiptWarning: `สร้างออเดอร์สำเร็จ แต่ไม่สามารถสร้างใบส่งของอัตโนมัติได้: ${syncResult.error}`,
    };
  }

  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  return {
    success: true,
    orderNumber: String(effectiveOrderNumber),
    deliveryNumber: String(syncResult.deliveryNumber),
  };
}

export async function linkPendingLineOrderAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const pendingOrderId = String(formData.get("pendingOrderId") ?? "").trim();
  const customerId = String(formData.get("customerId") ?? "").trim();

  if (!pendingOrderId || !customerId) {
    return { error: "à¸à¸£à¸¸à¸“à¸²à¹€à¸¥à¸·à¸­à¸à¸£à¹‰à¸²à¸™à¸„à¹‰à¸²à¸—à¸µà¹ˆà¸•à¹‰à¸­à¸‡à¸à¸²à¸£à¸œà¸¹à¸" };
  }

  const result = await linkLineCustomerAndConvertPendingOrders({
    customerId,
    organizationId: session.organizationId,
    pendingOrderId,
    userId: session.userId,
  });

  if ("error" in result) {
    return { error: result.error ?? "à¸œà¸¹à¸à¸£à¹‰à¸²à¸™à¸„à¹‰à¸²à¹„à¸¡à¹ˆà¸ªà¸³à¹€à¸£à¹‡à¸ˆ" };
  }

  return {
    receiptWarning: result.receiptErrors.length > 0
      ? `à¸ªà¸£à¹‰à¸²à¸‡à¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¹à¸¥à¹‰à¸§ à¹à¸•à¹ˆà¸ªà¹ˆà¸‡à¹ƒà¸šà¸¢à¸·à¸™à¸¢à¸±à¸™à¹„à¸› LINE à¹„à¸¡à¹ˆà¸ªà¸³à¹€à¸£à¹‡à¸ˆ: ${result.receiptErrors.join(" | ")}`
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
    return { error: "à¹„à¸¡à¹ˆà¸žà¸šà¹€à¸¥à¸‚à¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¸—à¸µà¹ˆà¸•à¹‰à¸­à¸‡à¸à¸²à¸£à¹à¸à¹‰à¹„à¸‚" };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(nextOrderDate)) {
    return { error: "à¸£à¸¹à¸›à¹à¸šà¸šà¸§à¸±à¸™à¸—à¸µà¹ˆà¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¹„à¸¡à¹ˆà¸–à¸¹à¸à¸•à¹‰à¸­à¸‡" };
  }

  const { data: order } = await admin
    .from("orders")
    .select("id, status, order_number, order_date, organization_id")
    .eq("id", orderId)
    .single();

  if (!order || order.organization_id !== session.organizationId) {
    return { error: "à¹„à¸¡à¹ˆà¸žà¸šà¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¸™à¸µà¹‰" };
  }

  if (order.status === "cancelled") {
    return { error: "à¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¸—à¸µà¹ˆà¸¢à¸à¹€à¸¥à¸´à¸à¹à¸¥à¹‰à¸§à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¹à¸à¹‰à¹„à¸‚à¸§à¸±à¸™à¸—à¸µà¹ˆà¹„à¸”à¹‰" };
  }

  if (order.order_date === nextOrderDate) {
    return { success: true, orderDate: nextOrderDate, orderNumber: order.order_number };
  }

  const { data: nextOrderNumber, error: nextOrderNumberError } = await admin.rpc("next_order_number", {
    p_order_date: nextOrderDate,
    p_organization_id: session.organizationId,
  });

  if (nextOrderNumberError || !nextOrderNumber) {
    return { error: nextOrderNumberError?.message ?? "à¸ªà¸£à¹‰à¸²à¸‡à¹€à¸¥à¸‚à¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¹ƒà¸«à¸¡à¹ˆà¹„à¸¡à¹ˆà¸ªà¸³à¹€à¸£à¹‡à¸ˆ" };
  }

  const { error: updateError } = await admin
    .from("orders")
    .update({
      order_date: nextOrderDate,
      order_number: String(nextOrderNumber),
    })
    .eq("id", orderId);

  if (updateError) {
    return { error: updateError.message ?? "à¸šà¸±à¸™à¸—à¸¶à¸à¸§à¸±à¸™à¸—à¸µà¹ˆà¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¹„à¸¡à¹ˆà¸ªà¸³à¹€à¸£à¹‡à¸ˆ" };
  }

  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  revalidatePath("/delivery");

  return { success: true, orderDate: nextOrderDate, orderNumber: String(nextOrderNumber) };
}
// â”€â”€â”€ Fetch data for Global Create Order Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function fetchOrderModalDataAction(): Promise<{
  customers: OrderCustomerOption[];
  products: OrderProductOption[];
  today: string;
}> {
  const session = await requireAppRole("admin");
  const [customers, products] = await Promise.all([
    getCustomersForOrder(session.organizationId),
    getProductsForOrder(session.organizationId),
  ]);

  return {
    customers,
    products,
    today: getTodayInBangkok(),
  };
}

export async function syncOrderDeliveryNoteAction(
  orderId: string,
  options?: {
    lossInBaseUnitByItemId?: Map<string, number>;
  },
): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;
  const syncResult = await syncDeliveryNoteForOrder(admin, {
    lossInBaseUnitByItemId: options?.lossInBaseUnitByItemId,
    orderId,
    organizationId: session.organizationId,
    userId: session.userId,
  });

  if ("error" in syncResult) {
    return { error: syncResult.error };
  }

  revalidatePath("/orders/incoming");
  return { success: true, deliveryNumber: String(syncResult.deliveryNumber) };
}

export async function deleteOrderAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;
  const orderId = String(formData.get("orderId") ?? "").trim();

  if (!orderId) {
    return { error: "à¹„à¸¡à¹ˆà¸žà¸šà¸£à¸«à¸±à¸ªà¸­à¸­à¹€à¸”à¸­à¸£à¹Œ" };
  }

  const { data: order } = await admin
    .from("orders")
    .select("id, status, order_number, organization_id, customer_id")
    .eq("id", orderId)
    .eq("organization_id", session.organizationId)
    .single();

  if (!order) {
    return { error: "à¹„à¸¡à¹ˆà¸žà¸šà¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¸™à¸µà¹‰" };
  }

  if (!isEditableOrderStatus(order.status)) {
    return { error: "à¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¸—à¸µà¹ˆà¸¢à¸à¹€à¸¥à¸´à¸à¹à¸¥à¹‰à¸§à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¸¥à¸šà¹„à¸”à¹‰" };
  }

  const { data: deliveryItems } = await admin
    .from("delivery_note_items")
    .select("delivery_note_id, product_id, quantity_in_base_unit")
    .eq("order_id", orderId);

  const restoreByProduct = new Map<string, number>();
  for (const item of deliveryItems ?? []) {
    restoreByProduct.set(
      item.product_id,
      (restoreByProduct.get(item.product_id) ?? 0) + Number(item.quantity_in_base_unit),
    );
  }

  if (restoreByProduct.size === 0) {
    const { data: orderItems } = await admin
      .from("order_items")
      .select("product_id, quantity_in_base_unit")
      .eq("order_id", orderId);

    for (const item of orderItems ?? []) {
      restoreByProduct.set(
        item.product_id,
        (restoreByProduct.get(item.product_id) ?? 0) + Number(item.quantity_in_base_unit),
      );
    }
  }

  await Promise.all(
    Array.from(restoreByProduct.entries()).map(([productId, quantityInBaseUnit]) =>
      restoreItemStock(
        admin,
        session.organizationId,
        session.userId,
        productId,
        quantityInBaseUnit,
        `à¸¥à¸šà¸­à¸­à¹€à¸”à¸­à¸£à¹Œ ${order.order_number}`,
      ),
    ),
  );

  const deliveryNoteIds = Array.from(new Set((deliveryItems ?? []).map((item) => item.delivery_note_id)));
  let deliveryNumbers: string[] = [];
  if (deliveryNoteIds.length > 0) {
    const { data: deliveryNotes } = await admin
      .from("delivery_notes")
      .select("id, delivery_number")
      .in("id", deliveryNoteIds);

    deliveryNumbers = Array.from(new Set((deliveryNotes ?? []).map((note) => String(note.delivery_number))));
  }

  if (deliveryItems && deliveryItems.length > 0) {
    const { error: deleteDeliveryItemsError } = await admin
      .from("delivery_note_items")
      .delete()
      .eq("order_id", orderId);

    if (deleteDeliveryItemsError) {
      return { error: deleteDeliveryItemsError.message ?? "à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¸¥à¸šà¸£à¸²à¸¢à¸à¸²à¸£à¹ƒà¸šà¸ªà¹ˆà¸‡à¸‚à¸­à¸‡à¹„à¸”à¹‰" };
    }
  }

  if (deliveryNoteIds.length > 0) {
    const { error: deleteDeliveryNotesError } = await admin
      .from("delivery_notes")
      .delete()
      .in("id", deliveryNoteIds);

    if (deleteDeliveryNotesError) {
      return { error: deleteDeliveryNotesError.message ?? "à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¸¥à¸šà¹ƒà¸šà¸ªà¹ˆà¸‡à¸‚à¸­à¸‡à¹„à¸”à¹‰" };
    }
  }

  const { error: deleteOrderItemsError } = await admin
    .from("order_items")
    .delete()
    .eq("order_id", orderId);

  if (deleteOrderItemsError) {
    return { error: deleteOrderItemsError.message ?? "à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¸¥à¸šà¸£à¸²à¸¢à¸à¸²à¸£à¸ªà¸´à¸™à¸„à¹‰à¸²à¹ƒà¸™à¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¹„à¸”à¹‰" };
  }

  const { error: deleteOrderError } = await admin
    .from("orders")
    .delete()
    .eq("id", orderId)
    .eq("organization_id", session.organizationId);

  if (deleteOrderError) {
    return { error: deleteOrderError.message ?? "à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¸¥à¸šà¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¹„à¸”à¹‰" };
  }

  if (deliveryNumbers.length > 0) {
    const billingSync = await syncBillingSnapshotsForDeliveryNumbers({
      organizationId: session.organizationId,
      customerId: order.customer_id,
      deliveryNumbers,
    });

    if (!billingSync.success) {
      return { error: billingSync.error };
    }
  }

  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  revalidatePath("/billing");
  return { success: true };
}

export async function deleteOrderCascadeAction(formData: FormData): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;
  const orderId = String(formData.get("orderId") ?? "").trim();

  if (!orderId) {
    return { error: "à¹„à¸¡à¹ˆà¸žà¸šà¸£à¸«à¸±à¸ªà¸­à¸­à¹€à¸”à¸­à¸£à¹Œ" };
  }

  const { data: order } = await admin
    .from("orders")
    .select("id, status, order_number, organization_id, customer_id")
    .eq("id", orderId)
    .eq("organization_id", session.organizationId)
    .single();

  if (!order) {
    return { error: "à¹„à¸¡à¹ˆà¸žà¸šà¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¸™à¸µà¹‰" };
  }

  if (!isEditableOrderStatus(order.status)) {
    return { error: "à¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¸—à¸µà¹ˆà¸¢à¸à¹€à¸¥à¸´à¸à¹à¸¥à¹‰à¸§à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¸¥à¸šà¹„à¸”à¹‰" };
  }

  const { data: orderItems, error: orderItemsError } = await admin
    .from("order_items")
    .select("id, order_id, product_id, quantity_in_base_unit")
    .eq("order_id", orderId);

  if (orderItemsError) {
    return { error: orderItemsError.message ?? "à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¹‚à¸«à¸¥à¸”à¸£à¸²à¸¢à¸à¸²à¸£à¸ªà¸´à¸™à¸„à¹‰à¸²à¹ƒà¸™à¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¹„à¸”à¹‰" };
  }

  const orderItemIds = (orderItems ?? []).map((item) => item.id);

  const { data: deliveryItems, error: deliveryItemsError } =
    orderItemIds.length > 0
      ? await admin
          .from("delivery_note_items")
          .select("id, delivery_note_id, order_item_id, product_id, quantity_in_base_unit, line_total")
          .in("order_item_id", orderItemIds)
      : { data: [], error: null };

  if (deliveryItemsError) {
    return { error: deliveryItemsError.message ?? "à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¹‚à¸«à¸¥à¸”à¸£à¸²à¸¢à¸à¸²à¸£à¹ƒà¸šà¸ªà¹ˆà¸‡à¸‚à¸­à¸‡à¸—à¸µà¹ˆà¹€à¸à¸µà¹ˆà¸¢à¸§à¸‚à¹‰à¸­à¸‡à¹„à¸”à¹‰" };
  }

  const restoreByProduct = new Map<string, number>();
  for (const item of deliveryItems ?? []) {
    restoreByProduct.set(
      item.product_id,
      (restoreByProduct.get(item.product_id) ?? 0) + Number(item.quantity_in_base_unit),
    );
  }

  if (restoreByProduct.size === 0) {
    for (const item of orderItems ?? []) {
      restoreByProduct.set(
        item.product_id,
        (restoreByProduct.get(item.product_id) ?? 0) + Number(item.quantity_in_base_unit),
      );
    }
  }

  await Promise.all(
    Array.from(restoreByProduct.entries()).map(([productId, quantityInBaseUnit]) =>
      restoreItemStock(
        admin,
        session.organizationId,
        session.userId,
        productId,
        quantityInBaseUnit,
        `à¸¥à¸šà¸­à¸­à¹€à¸”à¸­à¸£à¹Œ ${order.order_number}`,
      ),
    ),
  );

  const deliveryNoteIds = Array.from(new Set((deliveryItems ?? []).map((item) => item.delivery_note_id)));
  let deliveryNumbers: string[] = [];
  if (deliveryNoteIds.length > 0) {
    const { data: deliveryNotes } = await admin
      .from("delivery_notes")
      .select("id, delivery_number")
      .in("id", deliveryNoteIds);

    deliveryNumbers = Array.from(new Set((deliveryNotes ?? []).map((note) => String(note.delivery_number))));
  }

  if (deliveryItems && deliveryItems.length > 0) {
    const { error: deleteDeliveryItemsError } = await admin
      .from("delivery_note_items")
      .delete()
      .in(
        "id",
        deliveryItems.map((item) => item.id),
      );

    if (deleteDeliveryItemsError) {
      return { error: deleteDeliveryItemsError.message ?? "à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¸¥à¸šà¸£à¸²à¸¢à¸à¸²à¸£à¹ƒà¸šà¸ªà¹ˆà¸‡à¸‚à¸­à¸‡à¹„à¸”à¹‰" };
    }
  }

  for (const deliveryNoteId of deliveryNoteIds) {
    const { data: remainingDeliveryItems, error: remainingDeliveryItemsError } = await admin
      .from("delivery_note_items")
      .select("id, line_total, order_item_id")
      .eq("delivery_note_id", deliveryNoteId);

    if (remainingDeliveryItemsError) {
      return { error: remainingDeliveryItemsError.message ?? "à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¸•à¸£à¸§à¸ˆà¸ªà¸­à¸šà¸£à¸²à¸¢à¸à¸²à¸£à¹ƒà¸šà¸ªà¹ˆà¸‡à¸‚à¸­à¸‡à¸„à¸‡à¹€à¸«à¸¥à¸·à¸­à¹„à¸”à¹‰" };
    }

    if (!remainingDeliveryItems || remainingDeliveryItems.length === 0) {
      const { error: deleteDeliveryNoteError } = await admin
        .from("delivery_notes")
        .delete()
        .eq("id", deliveryNoteId);

      if (deleteDeliveryNoteError) {
        return { error: deleteDeliveryNoteError.message ?? "à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¸¥à¸šà¹ƒà¸šà¸ªà¹ˆà¸‡à¸‚à¸­à¸‡à¹„à¸”à¹‰" };
      }

      continue;
    }

    const nextTotalAmount = remainingDeliveryItems.reduce(
      (sum, item) => sum + Number(item.line_total),
      0,
    );

    const remainingOrderItemIds = remainingDeliveryItems
      .map((item) => item.order_item_id)
      .filter((value): value is string => Boolean(value));

    let replacementOrderId: string | null = null;
    if (remainingOrderItemIds.length > 0) {
      const { data: remainingOrderItems, error: remainingOrderItemsError } = await admin
        .from("order_items")
        .select("id, order_id")
        .in("id", remainingOrderItemIds);

      if (remainingOrderItemsError) {
        return { error: remainingOrderItemsError.message ?? "à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¸«à¸²à¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¸­à¹‰à¸²à¸‡à¸­à¸´à¸‡à¹ƒà¸šà¸ªà¹ˆà¸‡à¸‚à¸­à¸‡à¹„à¸”à¹‰" };
      }

      replacementOrderId = remainingOrderItems?.[0]?.order_id ?? null;
    }

    const updatePayload: { total_amount: number; order_id?: string } = {
      total_amount: nextTotalAmount,
    };

    if (replacementOrderId) {
      updatePayload.order_id = replacementOrderId;
    }

    const { error: updateDeliveryNoteError } = await admin
      .from("delivery_notes")
      .update(updatePayload)
      .eq("id", deliveryNoteId);

    if (updateDeliveryNoteError) {
      return { error: updateDeliveryNoteError.message ?? "à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¸­à¸±à¸›à¹€à¸”à¸•à¹ƒà¸šà¸ªà¹ˆà¸‡à¸‚à¸­à¸‡à¸«à¸¥à¸±à¸‡à¸¥à¸šà¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¹„à¸”à¹‰" };
    }
  }

  const { error: deleteOrderItemsError } = await admin
    .from("order_items")
    .delete()
    .eq("order_id", orderId);

  if (deleteOrderItemsError) {
    return { error: deleteOrderItemsError.message ?? "à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¸¥à¸šà¸£à¸²à¸¢à¸à¸²à¸£à¸ªà¸´à¸™à¸„à¹‰à¸²à¹ƒà¸™à¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¹„à¸”à¹‰" };
  }

  const { error: deleteOrderError } = await admin
    .from("orders")
    .delete()
    .eq("id", orderId)
    .eq("organization_id", session.organizationId);

  if (deleteOrderError) {
    return { error: deleteOrderError.message ?? "à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¸¥à¸šà¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¹„à¸”à¹‰" };
  }

  if (deliveryNumbers.length > 0) {
    const billingSync = await syncBillingSnapshotsForDeliveryNumbers({
      organizationId: session.organizationId,
      customerId: order.customer_id,
      deliveryNumbers,
    });

    if (!billingSync.success) {
      return { error: billingSync.error };
    }
  }

  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  revalidatePath("/billing");
  return { success: true };
}

export async function deleteOrderCascadeActionV2(formData: FormData): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;
  const orderId = String(formData.get("orderId") ?? "").trim();

  if (!orderId) {
    return { error: "à¹„à¸¡à¹ˆà¸žà¸šà¸£à¸«à¸±à¸ªà¸­à¸­à¹€à¸”à¸­à¸£à¹Œ" };
  }

  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, status, order_number, organization_id, customer_id")
    .eq("id", orderId)
    .eq("organization_id", session.organizationId)
    .single();

  if (orderError || !order) {
    return { error: orderError?.message ?? "à¹„à¸¡à¹ˆà¸žà¸šà¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¸™à¸µà¹‰" };
  }

  if (!isEditableOrderStatus(order.status)) {
    return { error: "à¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¸—à¸µà¹ˆà¸¢à¸à¹€à¸¥à¸´à¸à¹à¸¥à¹‰à¸§à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¸¥à¸šà¹„à¸”à¹‰" };
  }

  const { data: orderItems, error: orderItemsError } = await admin
    .from("order_items")
    .select("id, order_id, product_id, quantity_in_base_unit")
    .eq("order_id", orderId);

  if (orderItemsError) {
    return { error: orderItemsError.message ?? "à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¹‚à¸«à¸¥à¸”à¸£à¸²à¸¢à¸à¸²à¸£à¸ªà¸´à¸™à¸„à¹‰à¸²à¹ƒà¸™à¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¹„à¸”à¹‰" };
  }

  const orderItemIds = (orderItems ?? []).map((item) => item.id);

  const { data: deliveryItems, error: deliveryItemsError } =
    orderItemIds.length > 0
      ? await admin
          .from("delivery_note_items")
          .select("id, delivery_note_id, order_item_id, product_id, quantity_in_base_unit, line_total")
          .in("order_item_id", orderItemIds)
      : { data: [], error: null };

  if (deliveryItemsError) {
    return { error: deliveryItemsError.message ?? "ไม่สามารถโหลดรายการใบจัดส่งที่เกี่ยวข้องได้" };
  }

  const restoreByProduct = new Map<string, number>();
  for (const item of deliveryItems ?? []) {
    restoreByProduct.set(
      item.product_id,
      (restoreByProduct.get(item.product_id) ?? 0) + Number(item.quantity_in_base_unit),
    );
  }

  if (restoreByProduct.size === 0) {
    for (const item of orderItems ?? []) {
      restoreByProduct.set(
        item.product_id,
        (restoreByProduct.get(item.product_id) ?? 0) + Number(item.quantity_in_base_unit),
      );
    }
  }

  await Promise.all(
    Array.from(restoreByProduct.entries()).map(([productId, quantityInBaseUnit]) =>
      restoreItemStock(
        admin,
        session.organizationId,
        session.userId,
        productId,
        quantityInBaseUnit,
        `à¸¥à¸šà¸­à¸­à¹€à¸”à¸­à¸£à¹Œ ${order.order_number}`,
      ),
    ),
  );

  const deliveryNoteIds = Array.from(new Set((deliveryItems ?? []).map((item) => item.delivery_note_id)));
  let deliveryNumbers: string[] = [];

  if (deliveryNoteIds.length > 0) {
    const { data: deliveryNotes, error: deliveryNotesError } = await admin
      .from("delivery_notes")
      .select("id, delivery_number")
      .in("id", deliveryNoteIds);

    if (deliveryNotesError) {
      return { error: deliveryNotesError.message ?? "à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¹‚à¸«à¸¥à¸”à¹ƒà¸šà¸ˆà¸±à¸”à¸ªà¹ˆà¸‡à¸—à¸µà¹ˆà¹€à¸à¸µà¹ˆà¸¢à¸§à¸‚à¹‰à¸­à¸‡à¹„à¸”à¹‰" };
    }

    deliveryNumbers = Array.from(new Set((deliveryNotes ?? []).map((note) => String(note.delivery_number))));
  }

  if (deliveryItems && deliveryItems.length > 0) {
    const { error: deleteDeliveryItemsError } = await admin
      .from("delivery_note_items")
      .delete()
      .in(
        "id",
        deliveryItems.map((item) => item.id),
      );

    if (deleteDeliveryItemsError) {
      return { error: deleteDeliveryItemsError.message ?? "à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¸¥à¸šà¸£à¸²à¸¢à¸à¸²à¸£à¹ƒà¸šà¸ˆà¸±à¸”à¸ªà¹ˆà¸‡à¹„à¸”à¹‰" };
    }
  }

  for (const deliveryNoteId of deliveryNoteIds) {
    const { data: remainingDeliveryItems, error: remainingDeliveryItemsError } = await admin
      .from("delivery_note_items")
      .select("id, line_total, order_item_id")
      .eq("delivery_note_id", deliveryNoteId);

    if (remainingDeliveryItemsError) {
      return { error: remainingDeliveryItemsError.message ?? "à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¸•à¸£à¸§à¸ˆà¸ªà¸­à¸šà¸£à¸²à¸¢à¸à¸²à¸£à¹ƒà¸šà¸ˆà¸±à¸”à¸ªà¹ˆà¸‡à¸„à¸‡à¹€à¸«à¸¥à¸·à¸­à¹„à¸”à¹‰" };
    }

    if (!remainingDeliveryItems || remainingDeliveryItems.length === 0) {
      const { error: deleteDeliveryNoteError } = await admin
        .from("delivery_notes")
        .delete()
        .eq("id", deliveryNoteId);

      if (deleteDeliveryNoteError) {
        return { error: deleteDeliveryNoteError.message ?? "à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¸¥à¸šà¹ƒà¸šà¸ˆà¸±à¸”à¸ªà¹ˆà¸‡à¹„à¸”à¹‰" };
      }

      continue;
    }

    const nextTotalAmount = remainingDeliveryItems.reduce((sum, item) => sum + Number(item.line_total), 0);
    const remainingOrderItemIds = remainingDeliveryItems
      .map((item) => item.order_item_id)
      .filter((value): value is string => Boolean(value));

    let replacementOrderId: string | null = null;

    if (remainingOrderItemIds.length > 0) {
      const { data: remainingOrderItems, error: remainingOrderItemsError } = await admin
        .from("order_items")
        .select("id, order_id")
        .in("id", remainingOrderItemIds);

      if (remainingOrderItemsError) {
        return { error: remainingOrderItemsError.message ?? "à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¸«à¸²à¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¸­à¹‰à¸²à¸‡à¸­à¸´à¸‡à¸‚à¸­à¸‡à¹ƒà¸šà¸ˆà¸±à¸”à¸ªà¹ˆà¸‡à¹„à¸”à¹‰" };
      }

      replacementOrderId = remainingOrderItems?.[0]?.order_id ?? null;
    }

    const updatePayload: { total_amount: number; order_id?: string } = {
      total_amount: nextTotalAmount,
    };

    if (replacementOrderId) {
      updatePayload.order_id = replacementOrderId;
    }

    const { error: updateDeliveryNoteError } = await admin
      .from("delivery_notes")
      .update(updatePayload)
      .eq("id", deliveryNoteId);

    if (updateDeliveryNoteError) {
      return { error: updateDeliveryNoteError.message ?? "à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¸­à¸±à¸›à¹€à¸”à¸•à¹ƒà¸šà¸ˆà¸±à¸”à¸ªà¹ˆà¸‡à¸«à¸¥à¸±à¸‡à¸¥à¸šà¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¹„à¸”à¹‰" };
    }
  }

  const { error: deleteOrderItemsError } = await admin
    .from("order_items")
    .delete()
    .eq("order_id", orderId);

  if (deleteOrderItemsError) {
    return { error: deleteOrderItemsError.message ?? "à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¸¥à¸šà¸£à¸²à¸¢à¸à¸²à¸£à¸ªà¸´à¸™à¸„à¹‰à¸²à¹ƒà¸™à¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¹„à¸”à¹‰" };
  }

  const { error: deleteOrderError } = await admin
    .from("orders")
    .delete()
    .eq("id", orderId)
    .eq("organization_id", session.organizationId);

  if (deleteOrderError) {
    return { error: deleteOrderError.message ?? "à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¸¥à¸šà¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¹„à¸”à¹‰" };
  }

  if (deliveryNumbers.length > 0) {
    const billingSync = await syncBillingSnapshotsForDeliveryNumbers({
      organizationId: session.organizationId,
      customerId: order.customer_id,
      deliveryNumbers,
    });

    if (!billingSync.success) {
      return { error: billingSync.error };
    }
  }

  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  revalidatePath("/billing");
  return { success: true };
}

export async function deleteOrderCascadeActionV3(formData: FormData): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;
  const orderId = String(formData.get("orderId") ?? "").trim();

  if (!orderId) {
    return { error: "à¹„à¸¡à¹ˆà¸žà¸šà¸£à¸«à¸±à¸ªà¸­à¸­à¹€à¸”à¸­à¸£à¹Œ" };
  }

  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, status, order_number, organization_id, customer_id, order_date")
    .eq("id", orderId)
    .eq("organization_id", session.organizationId)
    .single();

  if (orderError || !order) {
    return { error: orderError?.message ?? "à¹„à¸¡à¹ˆà¸žà¸šà¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¸™à¸µà¹‰" };
  }

  if (!isEditableOrderStatus(order.status)) {
    return { error: "à¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¸—à¸µà¹ˆà¸¢à¸à¹€à¸¥à¸´à¸à¹à¸¥à¹‰à¸§à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¸¥à¸šà¹„à¸”à¹‰" };
  }

  const { data: orderItems, error: orderItemsError } = await admin
    .from("order_items")
    .select("id, product_id, quantity_in_base_unit")
    .eq("order_id", orderId);

  if (orderItemsError) {
    return { error: orderItemsError.message ?? "à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¹‚à¸«à¸¥à¸”à¸£à¸²à¸¢à¸à¸²à¸£à¸ªà¸´à¸™à¸„à¹‰à¸²à¹ƒà¸™à¸­à¸­à¹€à¸”à¸­à¸£à¹Œà¹„à¸”à¹‰" };
  }

  const orderItemIds = (orderItems ?? []).map((item) => item.id);

  const { data: deliveryItems, error: deliveryItemsError } =
    orderItemIds.length > 0
      ? await admin
          .from("delivery_note_items")
          .select("id, delivery_note_id, order_item_id, product_id, quantity_in_base_unit, line_total")
          .in("order_item_id", orderItemIds)
      : { data: [], error: null };

  if (deliveryItemsError) {
    return { error: deliveryItemsError.message ?? "à¹„à¸¡à¹ˆà¸ªà¸²à¸¡à¸²à¸£à¸–à¹‚à¸«à¸¥à¸”à¸£à¸²à¸¢à¸à¸²à¸£à¹ƒà¸šà¸ˆà¸±à¸”à¸ªà¹ˆà¸‡à¸—à¸µà¹ˆà¹€à¸à¸µà¹ˆà¸¢à¸§à¸‚à¹‰à¸­à¸‡à¹„à¸”à¹‰" };
  }

  const { data: primaryDeliveryNotes, error: primaryDeliveryNotesError } = await admin
    .from("delivery_notes")
    .select("id, delivery_number, customer_id, delivery_date")
    .eq("organization_id", session.organizationId)
    .eq("order_id", orderId);

  if (primaryDeliveryNotesError) {
    return { error: primaryDeliveryNotesError.message ?? "ไม่สามารถโหลดใบจัดส่งของออเดอร์นี้ได้" };
  }

  const restoreByProduct = new Map<string, number>();
  for (const item of deliveryItems ?? []) {
    restoreByProduct.set(
      item.product_id,
      (restoreByProduct.get(item.product_id) ?? 0) + Number(item.quantity_in_base_unit),
    );
  }

  if (restoreByProduct.size === 0) {
    for (const item of orderItems ?? []) {
      restoreByProduct.set(
        item.product_id,
        (restoreByProduct.get(item.product_id) ?? 0) + Number(item.quantity_in_base_unit),
      );
    }
  }

  await Promise.all(
    Array.from(restoreByProduct.entries()).map(([productId, quantityInBaseUnit]) =>
      restoreItemStock(
        admin,
        session.organizationId,
        session.userId,
        productId,
        quantityInBaseUnit,
        `ลบออเดอร์ ${order.order_number}`,
      ),
    ),
  );

  const deliveryNoteMap = new Map(
    (primaryDeliveryNotes ?? []).map((note) => [note.id, note] as const),
  );
  const deliveryNoteIds = Array.from(
    new Set([
      ...(deliveryItems ?? []).map((item) => item.delivery_note_id),
      ...(primaryDeliveryNotes ?? []).map((note) => note.id),
    ]),
  );
  let deliveryNumbers = Array.from(
    new Set((primaryDeliveryNotes ?? []).map((note) => String(note.delivery_number))),
  );

  if (deliveryNoteIds.length > 0 && deliveryNumbers.length === 0) {
    const { data: deliveryNotesById } = await admin
      .from("delivery_notes")
      .select("delivery_number")
      .in("id", deliveryNoteIds);

    deliveryNumbers = Array.from(
      new Set((deliveryNotesById ?? []).map((note) => String(note.delivery_number))),
    );
  }

  if ((deliveryItems ?? []).length > 0) {
    const { error: deleteDeliveryItemsError } = await admin
      .from("delivery_note_items")
      .delete()
      .in(
        "id",
        (deliveryItems ?? []).map((item) => item.id),
      );

    if (deleteDeliveryItemsError) {
      return { error: deleteDeliveryItemsError.message ?? "ไม่สามารถลบรายการใบจัดส่งได้" };
    }
  }

  for (const deliveryNoteId of deliveryNoteIds) {
    const { data: remainingDeliveryItems, error: remainingDeliveryItemsError } = await admin
      .from("delivery_note_items")
      .select("id, line_total, order_item_id")
      .eq("delivery_note_id", deliveryNoteId);

    if (remainingDeliveryItemsError) {
      return { error: remainingDeliveryItemsError.message ?? "ไม่สามารถตรวจสอบรายการใบจัดส่งคงเหลือได้" };
    }

    if (!remainingDeliveryItems || remainingDeliveryItems.length === 0) {
      const { error: deleteDeliveryNoteError } = await admin
        .from("delivery_notes")
        .delete()
        .eq("id", deliveryNoteId);

      if (deleteDeliveryNoteError) {
        return { error: deleteDeliveryNoteError.message ?? "ไม่สามารถลบใบจัดส่งได้" };
      }

      continue;
    }

    const nextTotalAmount = remainingDeliveryItems.reduce((sum, item) => sum + Number(item.line_total), 0);
    const remainingOrderItemIds = remainingDeliveryItems
      .map((item) => item.order_item_id)
      .filter((value): value is string => Boolean(value));

    let replacementOrderId: string | null = null;

    if (remainingOrderItemIds.length > 0) {
      const { data: remainingOrderItems, error: remainingOrderItemsError } = await admin
        .from("order_items")
        .select("id, order_id")
        .in("id", remainingOrderItemIds);

      if (remainingOrderItemsError) {
        return { error: remainingOrderItemsError.message ?? "ไม่สามารถหาออเดอร์อ้างอิงของใบจัดส่งได้" };
      }

      replacementOrderId = remainingOrderItems?.[0]?.order_id ?? null;
    }

    if (!replacementOrderId) {
      const knownNote = deliveryNoteMap.get(deliveryNoteId);
      const { data: fallbackDeliveryNote, error: fallbackDeliveryNoteError } = knownNote
        ? { data: knownNote, error: null }
        : await admin
            .from("delivery_notes")
            .select("id, customer_id, delivery_date")
            .eq("id", deliveryNoteId)
            .single();

      if (fallbackDeliveryNoteError || !fallbackDeliveryNote) {
        return { error: fallbackDeliveryNoteError?.message ?? "ไม่สามารถโหลดข้อมูลใบจัดส่งที่เหลืออยู่ได้" };
      }

      const { data: siblingOrders, error: siblingOrdersError } = await admin
        .from("orders")
        .select("id")
        .eq("organization_id", session.organizationId)
        .eq("customer_id", fallbackDeliveryNote.customer_id)
        .eq("order_date", fallbackDeliveryNote.delivery_date)
        .neq("id", orderId)
        .limit(1);

      if (siblingOrdersError) {
        return { error: siblingOrdersError.message ?? "ไม่สามารถหาออเดอร์อ้างอิงใหม่ได้" };
      }

      replacementOrderId = siblingOrders?.[0]?.id ?? null;
    }

    if (!replacementOrderId) {
      const orphanDeliveryItemIds = remainingDeliveryItems.map((item) => item.id);
      const { error: deleteOrphanItemsError } = await admin
        .from("delivery_note_items")
        .delete()
        .in("id", orphanDeliveryItemIds);

      if (deleteOrphanItemsError) {
        return { error: deleteOrphanItemsError.message ?? "ไม่สามารถลบรายการใบจัดส่งค้างได้" };
      }

      const { error: deleteOrphanDeliveryNoteError } = await admin
        .from("delivery_notes")
        .delete()
        .eq("id", deliveryNoteId);

      if (deleteOrphanDeliveryNoteError) {
        return { error: deleteOrphanDeliveryNoteError.message ?? "ไม่สามารถลบใบจัดส่งค้างได้" };
      }

      continue;
    }

    const { error: updateDeliveryNoteError } = await admin
      .from("delivery_notes")
      .update({
        total_amount: nextTotalAmount,
        order_id: replacementOrderId,
      })
      .eq("id", deliveryNoteId);

    if (updateDeliveryNoteError) {
      return { error: updateDeliveryNoteError.message ?? "ไม่สามารถอัปเดตใบจัดส่งหลังลบออเดอร์ได้" };
    }
  }

  const { error: deleteOrderItemsError } = await admin
    .from("order_items")
    .delete()
    .eq("order_id", orderId);

  if (deleteOrderItemsError) {
    return { error: deleteOrderItemsError.message ?? "ไม่สามารถลบรายการสินค้าในออเดอร์ได้" };
  }

  const { error: deleteOrderError } = await admin
    .from("orders")
    .delete()
    .eq("id", orderId)
    .eq("organization_id", session.organizationId);

  if (deleteOrderError) {
    return { error: deleteOrderError.message ?? "ไม่สามารถลบออเดอร์ได้" };
  }

  if (deliveryNumbers.length > 0) {
    const billingSync = await syncBillingSnapshotsForDeliveryNumbers({
      organizationId: session.organizationId,
      customerId: order.customer_id,
      deliveryNumbers,
    });

    if (!billingSync.success) {
      return { error: billingSync.error };
    }
  }

  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  revalidatePath("/billing");
  return { success: true };
}

