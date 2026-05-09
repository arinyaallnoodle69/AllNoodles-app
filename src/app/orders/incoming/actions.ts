"use server";

import { revalidatePath } from "next/cache";
import { requireAppRole } from "@/lib/auth/authorization";
import { linkLineCustomerAndConvertPendingOrders } from "@/lib/orders/line-pending";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getTodayInBangkok } from "@/lib/orders/date";
import { getEffectiveSaleUnitCost } from "@/lib/products/sale-unit-cost";
import { getCustomersForOrder, getProductsForOrder, type OrderCustomerOption, type OrderProductOption } from "@/lib/orders/manage";
import { getOrderDetailById, type OrderDetailData } from "@/lib/orders/detail";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { ActionResult, CustomerLastOrderSnapshot, CustomerLastOrderItem } from "./types";

// ─── Internal Types ──────────────────────────────────────────────────────────

type OrderIdRow = { id: string };

type ActionsAdmin = SupabaseClient<Database>;

// For the remaining-items check (need .eq().select() chain returning id array)
type SimpleSelectChain = {
  eq: (col: string, val: string) => Promise<{ data: OrderIdRow[] | null; error: unknown }>;
};
type MinimalAdmin = { from(table: string): { select: (cols: string) => SimpleSelectChain } };

export async function fetchIncomingOrderDetailAction(
  orderId: string,
): Promise<{ detail: OrderDetailData | null; error?: string }> {
  const session = await requireAppRole("admin");
  const id = orderId.trim();

  if (!id) {
    return { detail: null, error: "ไม่พบรหัสออเดอร์" };
  }

  const admin = getSupabaseAdmin() as ActionsAdmin;
  const { data, error } = await admin
    .from("orders")
    .select("id")
    .eq("id", id)
    .eq("organization_id", session.organizationId)
    .maybeSingle();

  if (error) {
    return { detail: null, error: error.message ?? "โหลดรายละเอียดออเดอร์ไม่สำเร็จ" };
  }

  if (!data) {
    return { detail: null, error: "ไม่พบออเดอร์นี้ในองค์กรของคุณ" };
  }

  const detail = await getOrderDetailById(id);
  return { detail };
}

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
  if (order.status !== "submitted" && order.status !== "confirmed") return { error: "ยกเลิกได้เฉพาะออเดอร์สถานะ 'รับแล้ว' หรือ 'ยืนยันแล้ว' เท่านั้น" };

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
        `ยกเลิกออเดอร์ ${order.order_number}`,
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
  if (order.status !== "submitted" && order.status !== "confirmed") return { error: "แก้ไขได้เฉพาะออเดอร์สถานะ 'รับแล้ว' หรือ 'ยืนยันแล้ว'" };

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
  if (order.status !== "submitted" && order.status !== "confirmed") return { error: "แก้ไขได้เฉพาะออเดอร์สถานะ 'รับแล้ว' หรือ 'ยืนยันแล้ว'" };

  const qtyBase = Number(item.quantity_in_base_unit);
  const lineTotal = Number(item.line_total);

  // If confirmed, update associated DN total before the DN item is deleted by cascade
  if (order.status === "confirmed") {
    const { data: dnItem } = await admin
      .from("delivery_note_items")
      .select("delivery_note_id, line_total")
      .eq("order_item_id", itemId)
      .maybeSingle();

    if (dnItem) {
      const { data: dn } = await admin
        .from("delivery_notes")
        .select("total_amount")
        .eq("id", dnItem.delivery_note_id)
        .single();

      if (dn) {
        const nextDnTotal = Math.max(0, Number(dn.total_amount) - Number(dnItem.line_total));
        await admin
          .from("delivery_notes")
          .update({ total_amount: nextDnTotal })
          .eq("id", dnItem.delivery_note_id);
      }
    }
  }

  await admin.from("order_items").delete().eq("id", itemId);
  if (order.status === "submitted") {
    await restoreItemStock(
      admin,
      session.organizationId,
      session.userId,
      item.product_id,
      qtyBase,
      `ลบรายการจากออเดอร์ ${order.order_number}`,
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
  const orderDate = String(formData.get("orderDate") ?? "").trim();

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
    return { error: error.message ?? "บันทึกรถส่งของไม่สำเร็จ" };
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

// ─── Add item to existing order ───────────────────────────────────────────────

export async function updateOrderItemsBatchAction(input: {
  orderId: string;
  removedIds: string[];
  updates: { itemId: string; quantity: number }[];
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

  if (!orderId) return { error: "ไม่พบเลขออเดอร์" };

  // 1. Verify order
  const { data: order } = await admin
    .from("orders")
    .select("id, status, organization_id, order_number, total_amount")
    .eq("id", orderId)
    .single();

  if (!order || order.organization_id !== session.organizationId) return { error: "ไม่พบออเดอร์" };
  if (order.status !== "submitted" && order.status !== "confirmed") {
    return { error: "สามารถแก้ไขได้เฉพาะออเดอร์ที่ยังไม่จัดส่ง" };
  }

  // 2. Process Removals
  if (removedIds.length > 0) {
    for (const itemId of removedIds) {
      const { data: item } = await admin
        .from("order_items")
        .select("product_id, quantity_in_base_unit")
        .eq("id", itemId)
        .single();

      if (item) {
        await admin.from("order_items").delete().eq("id", itemId);
        if (order.status === "submitted") {
          await restoreItemStock(
            admin,
            session.organizationId,
            session.userId,
            item.product_id,
            Number(item.quantity_in_base_unit),
            `ลบรายการจากออเดอร์ ${order.order_number} (Batch)`
          );
        }
      }
    }
  }

  // 3. Process Updates
  if (updates.length > 0) {
    for (const update of updates) {
      const { data: item } = await admin
        .from("order_items")
        .select("id, product_id, quantity, quantity_in_base_unit, sale_unit_ratio, unit_price")
        .eq("id", update.itemId)
        .single();

      if (item && Number(item.quantity) !== update.quantity) {
        const ratio = Number(item.sale_unit_ratio) || 1;
        const newQtyBase = update.quantity * ratio;
        const oldQtyBase = Number(item.quantity_in_base_unit);
        const qtyDelta = newQtyBase - oldQtyBase;
        const newLineTotal = update.quantity * Number(item.unit_price);

        await admin.from("order_items").update({
          quantity: update.quantity,
          quantity_in_base_unit: newQtyBase,
          line_total: newLineTotal
        }).eq("id", update.itemId);

        if (qtyDelta !== 0 && order.status === "submitted") {
          const { data: product } = await admin.from("products").select("stock_quantity").eq("id", item.product_id).single();
          if (product) {
            const stockBefore = Number(product.stock_quantity);
            const stockAfter = Math.max(0, stockBefore - qtyDelta);
            await admin.from("products").update({ stock_quantity: stockAfter }).eq("id", item.product_id);
            await admin.from("inventory_movements").insert({
              created_by: session.userId,
              metadata: { order_id: orderId, source: "order_management_batch" },
              movement_type: qtyDelta > 0 ? "issue" : "adjustment",
              notes: `ปรับจำนวนในออเดอร์ ${order.order_number}`,
              organization_id: session.organizationId,
              product_id: item.product_id,
              quantity_delta: -qtyDelta,
              stock_after: stockAfter,
              stock_before: stockBefore
            });
          }
        }
      }
    }
  }

  // 4. Process Additions
  if (additions.length > 0) {
    for (const add of additions) {
      let saleUnit;
      if (add.productSaleUnitId) {
        const res = await admin
          .from("product_sale_units")
          .select("id, product_id, unit_label, base_unit_quantity")
          .eq("id", add.productSaleUnitId)
          .single();
        saleUnit = res.data;
      }

      if (!saleUnit) {
        const res = await admin
          .from("product_sale_units")
          .select("id, product_id, unit_label, base_unit_quantity")
          .eq("product_id", add.productId)
          .eq("is_default", true)
          .single();
        saleUnit = res.data;
      }

      if (saleUnit) {
        const ratio = Number(saleUnit.base_unit_quantity) || 1;
        const lineTotal = add.quantity * add.unitPrice;
        const qtyBase = add.quantity * ratio;

        const { data: product } = await admin.from("products").select("cost_price, stock_quantity").eq("id", add.productId).single();

        await admin.from("order_items").insert({
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
          cost_price: Number(product?.cost_price ?? 0)
        });

        if (order.status === "submitted" && product) {
          const stockBefore = Number(product.stock_quantity);
          const stockAfter = stockBefore - qtyBase;
          await admin.from("products").update({ stock_quantity: stockAfter }).eq("id", add.productId);
          await admin.from("inventory_movements").insert({
            created_by: session.userId,
            metadata: { order_id: orderId, source: "order_management_batch" },
            movement_type: "issue",
            notes: `เพิ่มสินค้าในออเดอร์ ${order.order_number}`,
            organization_id: session.organizationId,
            product_id: add.productId,
            quantity_delta: -qtyBase,
            stock_after: stockAfter,
            stock_before: stockBefore
          });
        }
      }
    }
  }

  // 5. Recalculate Order Total
  const { data: finalItems } = await admin.from("order_items").select("line_total").eq("order_id", orderId);
  const finalTotal = (finalItems ?? []).reduce((sum: number, i: { line_total: number }) => sum + Number(i.line_total), 0);

  await admin.from("orders").update({
    subtotal_amount: finalTotal,
    total_amount: finalTotal
  }).eq("id", orderId);

  // 6. Sync Delivery Note if needed
  if (order.status === "confirmed") {
    const syncRes = await syncOrderDeliveryNoteAction(orderId);
    if ("error" in syncRes) return { error: "ปรับปรุงใบส่งของไม่สำเร็จ: " + syncRes.error };
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

  if (!orderId || !productId) return { error: "ข้อมูลสินค้าไม่ครบถ้วน" };
  if (!Number.isFinite(quantity) || quantity <= 0) return { error: "จำนวนสินค้าต้องมากกว่า 0" };
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return { error: "ราคาสินค้าต้องมากกว่า 0" };

  const { data: order } = await admin
    .from("orders")
    .select("id, customer_id, status, organization_id, total_amount, order_number")
    .eq("id", orderId)
    .single();

  if (!order || order.organization_id !== session.organizationId) return { error: "ไม่พบออเดอร์" };
  if (order.status !== "submitted" && order.status !== "confirmed") return { error: "แก้ไขได้เฉพาะออเดอร์สถานะ 'รับแล้ว' หรือ 'ยืนยันแล้ว'" };

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
  if (order.status === "submitted") {
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
  }

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

  // 1. Fetch customer's default vehicle
  const { data: customer } = await admin
    .from("customers")
    .select("default_vehicle_id")
    .eq("id", customerId)
    .single();

  const vehicleId = customer?.default_vehicle_id || null;

  // 2. Batch insert order items and get their IDs
  const { data: insertedItems, error: itemsError } = await admin
    .from("order_items")
    .insert(
      items.map((item: ManualOrderItem) => ({
        cost_price: 0,
        line_total: item.quantity * item.unitPrice,
        order_id: orderId,
        organization_id: session.organizationId,
        product_id: item.productId,
        product_sale_unit_id: item.saleUnitId,
        quantity: item.quantity,
        quantity_in_base_unit: item.quantity * item.saleUnitBaseQty,
        sale_unit_label: item.saleUnitLabel,
        sale_unit_ratio: item.saleUnitBaseQty,
        unit_price: item.unitPrice,
      }))
    )
    .select();

  if (itemsError || !insertedItems || insertedItems.length === 0) {
    console.error("[createManualOrderAction] Items Insert Error:", itemsError);
    return { error: "ไม่สามารถเพิ่มสินค้าในออเดอร์ได้" };
  }

  // 3. Automatically create and confirm delivery note via RPC
  // This RPC handles stock deduction and inventory movements internally.
  const payloadItems = (insertedItems as { id: string; product_id: string; product_sale_unit_id: string | null; quantity: number; sale_unit_label: string; sale_unit_ratio: number; unit_price: number }[]).map((oi) => ({
    orderItemId: oi.id,
    productId: oi.product_id,
    productSaleUnitId: oi.product_sale_unit_id,
    quantityDelivered: Number(oi.quantity),
    saleUnitLabel: oi.sale_unit_label,
    saleUnitRatio: Number(oi.sale_unit_ratio),
    unitPrice: Number(oi.unit_price),
  }));

  const { data: deliveryNumber, error: deliveryError } = await admin.rpc("create_store_delivery_note", {
    p_organization_id: session.organizationId,
    p_order_ids: [orderId],
    p_customer_id: customerId,
    p_vehicle_id: (vehicleId || null) as unknown as string,
    p_delivery_date: orderDate,
    p_notes: (notes || null) as unknown as string,
    p_created_by: session.userId,
    p_items: payloadItems,
  });

  if (deliveryError) {
    console.error("[createManualOrderAction] Delivery Note Creation Error:", deliveryError);
    // Even if delivery note fails, the order is created.
    // However, the user expects a delivery number.
    return {
      success: true,
      orderNumber: String(orderNumber),
      receiptWarning: "สร้างออเดอร์สำเร็จ แต่ไม่สามารถสร้างใบส่งของอัตโนมัติได้: " + deliveryError.message
    };
  }

  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  return {
    success: true,
    orderNumber: String(orderNumber),
    deliveryNumber: String(deliveryNumber)
  };
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
// ─── Fetch data for Global Create Order Modal ───────────────────────────────
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

export async function syncOrderDeliveryNoteAction(orderId: string): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as ActionsAdmin;

  // 1. Fetch order details
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, customer_id, order_date, notes")
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    console.error(`[syncOrderDeliveryNoteAction] Order not found for ID: ${orderId}`, orderError);
    return { error: `ไม่พบข้อมูลออเดอร์ (ID: ${orderId.slice(0, 8)}...) ${orderError?.message ?? ""}` };
  }

  // 1.1 Fetch customer's default vehicle (since vehicle_id is not in orders table)
  const { data: customer } = await admin
    .from("customers")
    .select("default_vehicle_id")
    .eq("id", order.customer_id)
    .single();

  const vehicleId = customer?.default_vehicle_id || null;

  // 1.2 Fetch order items separately (safer than joined select)
  const { data: orderItems, error: itemsError } = await admin
    .from("order_items")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });

  if (itemsError) return { error: "ไม่สามารถโหลดรายการสินค้าในออเดอร์ได้" };
  const items = orderItems ?? [];

  // 1.5 Robust cleanup: find and remove existing DN items for this order to avoid duplicates.
  // We must restore stock for these items because the RPC will re-deduct it.
  const orderItemIds = items.map((oi: { id: string }) => oi.id);
  if (orderItemIds.length > 0) {
    const { data: existingDnItems } = await admin
      .from("delivery_note_items")
      .select("id, delivery_note_id, product_id, quantity_in_base_unit, line_total")
      .in("order_item_id", orderItemIds);

    if (existingDnItems && existingDnItems.length > 0) {
      const dnId = existingDnItems[0].delivery_note_id;
      let totalRemovedAmount = 0;

      for (const dni of existingDnItems) {
        await restoreItemStock(
          admin,
          session.organizationId,
          session.userId,
          dni.product_id,
          Number(dni.quantity_in_base_unit),
          `ปรับปรุงออเดอร์ ${orderId} (คืนสต็อกก่อนลงใหม่)`,
        );
        totalRemovedAmount += Number(dni.line_total);
      }

      // Delete the items
      await admin.from("delivery_note_items").delete().in("id", existingDnItems.map((d: { id: string }) => d.id));

      // Subtract from DN total (RPC will add it back)
      const { data: dn } = await admin.from("delivery_notes").select("total_amount").eq("id", dnId).single();
      if (dn) {
        const nextTotal = Math.max(0, Number(dn.total_amount) - totalRemovedAmount);
        await admin.from("delivery_notes").update({ total_amount: nextTotal }).eq("id", dnId);
      }
    }
  }

  // 2. Prepare items payload for RPC
  const payloadItems = items.map((oi: { id: string; product_id: string; product_sale_unit_id: string | null; quantity: number; sale_unit_label: string; sale_unit_ratio: number; unit_price: number }) => ({
    orderItemId: oi.id,
    productId: oi.product_id,
    productSaleUnitId: oi.product_sale_unit_id,
    quantityDelivered: Number(oi.quantity),
    saleUnitLabel: oi.sale_unit_label,
    saleUnitRatio: Number(oi.sale_unit_ratio),
    unitPrice: Number(oi.unit_price),
  }));

  // 3. Call RPC to update/create delivery note
  const { data: deliveryNumber, error: deliveryError } = await admin.rpc("create_store_delivery_note", {
    p_organization_id: session.organizationId,
    p_order_ids: [order.id],
    p_customer_id: order.customer_id,
    p_vehicle_id: (vehicleId || null) as unknown as string,
    p_delivery_date: order.order_date,
    p_notes: (order.notes || null) as unknown as string,
    p_created_by: session.userId,
    p_items: payloadItems,
  });

  if (deliveryError) return { error: "ปรับปรุงใบส่งของไม่สำเร็จ: " + deliveryError.message };

  revalidatePath("/orders/incoming");
  return { success: true, deliveryNumber: String(deliveryNumber) };
}
