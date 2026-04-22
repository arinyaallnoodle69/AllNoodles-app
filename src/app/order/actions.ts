"use server";

import { revalidateTag } from "next/cache";
import { revalidatePath } from "next/cache";
import { isCustomerOrderEditableAtTime, isOrderOpenAtMinutes } from "@/lib/order-window";
import { getOrderWindowSettings } from "@/lib/order-window-server";
import { getEffectiveSaleUnitCost, normalizeSaleUnitCostMode } from "@/lib/products/sale-unit-cost";
import { notifyCustomerReceiptImage, notifyNewCustomerInquiry, notifyNewOrder } from "@/lib/line/notify";
import { sendNewCustomerInquiryPushNotification, sendNewOrderPushNotification } from "@/lib/push/web-push";
import { createCustomerInquiry } from "@/lib/customer-inquiries";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

// ─── Types ───────────────────────────────────────────────────────────────────

type Customer = Database["public"]["Tables"]["customers"]["Row"];

// line_user_id is added via migration 202603171500_customers_line_user_id.sql
// The generated types will reflect this once the migration is applied to the remote DB.
type CustomerWithLineId = Customer & { line_user_id?: string | null };

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

type FrequentProductSummary = {
  productId: string;
  productSaleUnitId: string | null;
  totalQuantity: number;
  orderCount: number;
  lastOrderedAt: string;
};

type OrderMutationItemInput = {
  productId: string;
  productSaleUnitId: string;
  quantity: number;
};

const RECEIPT_IMAGE_BUCKET = "product-images";
const LINE_USER_ID_PATTERN = /^U[0-9a-f]{32}$/i;

function normalizeLineUserId(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return LINE_USER_ID_PATTERN.test(normalized) ? normalized : "";
}

function resolveCustomerLineUserId(
  customerLineUserId: string | null | undefined,
  fallbackLineUserId: string | null | undefined,
) {
  const primary = normalizeLineUserId(customerLineUserId);
  if (primary) return primary;
  return normalizeLineUserId(fallbackLineUserId);
}

function parseImageDataUrl(input: string) {
  const match = input.match(/^data:(image\/png|image\/jpeg|image\/webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  const [, contentType, base64] = match;
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) return null;
  return { contentType, buffer };
}

function guessExtension(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

function buildClientOrderItems(
  orderItemsData: Array<{
    product_id: string;
    product_sale_unit_id: string;
    sale_unit_label: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>,
  productMap: Map<string, { id: string; name: string; sku: string; unit: string }>,
) {
  return orderItemsData.map((item, index) => {
    const product = productMap.get(item.product_id);
    return {
      id: `${item.product_id}:${item.product_sale_unit_id}:${index}`,
      product_sale_unit_id: item.product_sale_unit_id,
      sale_unit_label: item.sale_unit_label,
      quantity: item.quantity,
      unit_price: item.unit_price,
      line_total: item.line_total,
      products: {
        id: product?.id ?? item.product_id,
        name: product?.name ?? "-",
        sku: product?.sku ?? "-",
        unit: product?.unit ?? "-",
      },
    };
  });
}

function normalizeOrderForClient(order: Database["public"]["Tables"]["orders"]["Row"] & { order_items?: unknown[] | null }) {
  return {
    ...order,
    order_items: Array.isArray(order?.order_items) ? order.order_items : [],
  };
}

function getBangkokNowParts() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour ?? "0"),
    minute: Number(parts.minute ?? "0"),
    minutes: Number(parts.hour ?? "0") * 60 + Number(parts.minute ?? "0"),
  };
}

async function isCustomerOrderEditable(
  organizationId: string,
  orderDate: string,
  status: string | null | undefined,
) {
  const bangkokNow = getBangkokNowParts();
  const orderWindowSettings = await getOrderWindowSettings(organizationId);
  return isCustomerOrderEditableAtTime({
    allowOrderAfterCutoff: orderWindowSettings.allowOrderAfterCutoff,
    closeTime: orderWindowSettings.closeTime,
    currentDate: bangkokNow.date,
    currentMinutes: bangkokNow.minutes,
    orderDate,
    status,
  });
}

async function buildOrderItemData(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  organizationId: string,
  customerId: string,
  items: OrderMutationItemInput[],
) {
  const productIds = Array.from(new Set(items.map((item) => item.productId)));
  const productSaleUnitIds = Array.from(new Set(items.map((item) => item.productSaleUnitId)));
  const [
    { data: products, error: pError },
    { data: saleUnits, error: saleUnitError },
    { data: customerPrices, error: priceError },
  ] =
    await Promise.all([
      supabase
        .from("products")
        .select("id, name, sku, unit, cost_price")
        .in("id", productIds),
      supabase
        .from("product_sale_units")
        .select("id, product_id, unit_label, base_unit_quantity, cost_mode, fixed_cost_price, min_order_qty, step_order_qty")
        .in("id", productSaleUnitIds),
      supabase
        .from("customer_product_prices")
        .select("product_id, product_sale_unit_id, sale_price")
        .eq("organization_id", organizationId)
        .eq("customer_id", customerId)
        .in("product_sale_unit_id", productSaleUnitIds),
    ]);

  if (pError || !products) {
    console.error("[buildOrderItemData:fetchProducts]", pError);
    return { success: false as const, error: "ไม่สามารถเรียกข้อมูลสินค้าได้" };
  }

  if (priceError) {
    console.error("[buildOrderItemData:fetchCustomerPrices]", priceError);
    return { success: false as const, error: "ไม่สามารถเรียกราคาขายสำหรับร้านค้าได้" };
  }

  if (saleUnitError || !saleUnits) {
    console.error("[buildOrderItemData:fetchSaleUnits]", saleUnitError);
    return { success: false as const, error: "ไม่สามารถเรียกข้อมูลหน่วยขายได้" };
  }

  const productMap = new Map(products.map((product) => [product.id, product]));
  const saleUnitMap = new Map(saleUnits.map((saleUnit) => [saleUnit.id, saleUnit]));
  const priceMap = new Map(
    (customerPrices ?? []).map((price) => [price.product_sale_unit_id, Number(price.sale_price)]),
  );

  const invalidItem = items.find(
    (item) =>
      !productMap.has(item.productId) ||
      !saleUnitMap.has(item.productSaleUnitId) ||
      saleUnitMap.get(item.productSaleUnitId)?.product_id !== item.productId,
  );
  if (invalidItem) {
    return { success: false as const, error: "มีสินค้าบางรายการไม่ถูกต้อง" };
  }

  for (const item of items) {
    const saleUnit = saleUnitMap.get(item.productSaleUnitId);
    if (!saleUnit) continue;
    const minQty = Number(saleUnit.min_order_qty ?? 1);
    const stepQty: number | null = saleUnit.step_order_qty !== null && saleUnit.step_order_qty !== undefined
      ? Number(saleUnit.step_order_qty)
      : null;

    if (item.quantity < minQty) {
      return {
        success: false as const,
        error: `สินค้า "${saleUnit.unit_label}" ต้องสั่งขั้นต่ำ ${minQty} หน่วย`,
      };
    }
    if (stepQty !== null && (item.quantity - minQty) % stepQty !== 0) {
      return {
        success: false as const,
        error: `สินค้า "${saleUnit.unit_label}" ต้องสั่งเพิ่มทีละ ${stepQty} หน่วย`,
      };
    }
  }

  const orderItemsData = items.map((item) => {
    const saleUnit = saleUnitMap.get(item.productSaleUnitId);
    const unitPrice = priceMap.get(item.productSaleUnitId) ?? 0;
    const product = productMap.get(item.productId);
    const costPrice = getEffectiveSaleUnitCost({
      baseCostPrice: Number(product?.cost_price ?? 0),
      baseUnitQuantity: Number(saleUnit?.base_unit_quantity ?? 1),
      costMode: normalizeSaleUnitCostMode(String(saleUnit?.cost_mode ?? "derived")),
      fixedCostPrice:
        saleUnit?.fixed_cost_price === null || saleUnit?.fixed_cost_price === undefined
          ? null
          : Number(saleUnit.fixed_cost_price),
    });

    return {
      organization_id: organizationId,
      product_id: item.productId,
      product_sale_unit_id: item.productSaleUnitId,
      quantity: item.quantity,
      quantity_in_base_unit: item.quantity * Number(saleUnit?.base_unit_quantity ?? 1),
      sale_unit_label: saleUnit?.unit_label ?? product?.unit ?? "-",
      sale_unit_ratio: Number(saleUnit?.base_unit_quantity ?? 1),
      unit_price: unitPrice,
      line_total: item.quantity * unitPrice,
      cost_price: costPrice,
    };
  });

  return {
    success: true as const,
    data: {
      orderItemsData,
      productMap,
    },
  };
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/** Find the customer linked to a LINE user ID. */
export async function getCustomerByLineId(
  lineUserId: string
): Promise<ActionResult<CustomerWithLineId | null>> {
  if (!lineUserId?.trim()) {
    return { success: false, error: "LINE user ID is required." };
  }

  const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("customers")
    .select("*")
    .eq("line_user_id", lineUserId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("[getCustomerByLineId]", error);
    return { success: false, error: "ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่" };
  }

  return { success: true, data };
}

export type RegisterCustomerInput = {
  organizationId: string;
  lineUserId: string;
  lineDisplayName?: string;
  linePictureUrl?: string;
  name: string;
  phone?: string;
  address?: string;
  province?: string;
  district?: string;
  subdistrict?: string;
  postalCode?: string;
};

function getOptionalTrimmedText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function buildLineProfileMetadata(input: {
  displayName?: string;
  pictureUrl?: string;
}) {
  const displayName = getOptionalTrimmedText(input.displayName);
  const pictureUrl = getOptionalTrimmedText(input.pictureUrl);

  if (!displayName && !pictureUrl) {
    return {};
  }

  return {
    lineProfile: {
      displayName,
      pictureUrl,
      syncedAt: new Date().toISOString(),
    },
  };
}

/** Self-register: create a new customer record and link the LINE user ID (once). */
export async function registerLineCustomer(
  input: RegisterCustomerInput,
): Promise<ActionResult<CustomerWithLineId>> {
  const { organizationId, lineUserId, name } = input;
  if (!organizationId?.trim() || !lineUserId?.trim() || !name?.trim()) {
    return { success: false, error: "กรุณากรอกชื่อร้านค้า" };
  }

  const supabase = getSupabaseAdmin();

  // Guard: LINE ID already linked
    const { data: existing } = await supabase.from("customers")
    .select("id")
    .eq("line_user_id", lineUserId)
    .maybeSingle();

  if (existing) {
    return { success: false, error: "บัญชี LINE นี้ลงทะเบียนไว้แล้ว" };
  }

  // Generate next customer code via DB counter (race-condition safe)
    const { data: codeData, error: codeError } = await supabase
    .rpc("next_customer_code", { p_organization_id: organizationId });

  if (codeError || !codeData) {
    console.error("[registerLineCustomer] next_customer_code RPC failed", codeError);
    return { success: false, error: "ไม่สามารถสร้างรหัสร้านค้าได้ กรุณาลองใหม่" };
  }

  const customerCode = codeData as string;

  // Build address string from structured fields
  const addressParts = [
    input.address?.trim(),
    input.subdistrict ? `ตำบล${input.subdistrict.trim()}` : null,
    input.district ? `อำเภอ${input.district.trim()}` : null,
    input.province ? `จังหวัด${input.province.trim()}` : null,
    input.postalCode?.trim(),
  ].filter(Boolean);
  const address = addressParts.join(" ") || "-";

  const now = new Date().toISOString();

    const { data, error } = await supabase.from("customers")
    .insert({
      organization_id: organizationId,
      customer_code: customerCode,
      name: name.trim(),
      phone: input.phone?.trim() || null,
      address,
      province: input.province?.trim() || null,
      district: input.district?.trim() || null,
      subdistrict: input.subdistrict?.trim() || null,
      postal_code: input.postalCode?.trim() || null,
      line_user_id: lineUserId,
      metadata: buildLineProfileMetadata({
        displayName: input.lineDisplayName,
        pictureUrl: input.linePictureUrl,
      }),
      is_active: true,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error || !data) {
    console.error("[registerLineCustomer]", error);
    return { success: false, error: "ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่" };
  }

  revalidateTag(`settings-${organizationId}`, "max");
  revalidatePath("/settings");
  revalidatePath("/settings/customers");
  revalidatePath("/settings/customer-data");

  return { success: true, data };
}

/** Submit a new-customer inquiry (not yet an existing customer).
 *  Sends a LINE push notification to the admin group and a web push notification. */
export async function submitNewCustomerInquiry(
  organizationId: string,
  name: string,
  phone: string,
): Promise<ActionResult<null>> {
  if (!name?.trim() || !phone?.trim()) {
    return { success: false, error: "กรุณากรอกชื่อและเบอร์โทรศัพท์" };
  }
  let inquiryId = "";

  try {
    const inquiry = await createCustomerInquiry({
      organizationId,
      customerName: name.trim(),
      customerPhone: phone.trim(),
    });
    inquiryId = inquiry.id;
  } catch (error) {
    console.error("[submitNewCustomerInquiry:createCustomerInquiry]", error);
    return { success: false, error: "ยังส่งข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
  }

  void notifyNewCustomerInquiry(name.trim(), phone.trim());
  void sendNewCustomerInquiryPushNotification({
    inquiryId,
    organizationId,
    customerName: name.trim(),
    customerPhone: phone.trim(),
  });
  return { success: true, data: null };
}

/** Unlink the current LINE user ID from a customer before logging out/switching store. */
export async function unlinkLineIdFromCustomer(
  customerId: string,
  lineUserId: string
): Promise<ActionResult<null>> {
  if (!customerId?.trim() || !lineUserId?.trim()) {
    return { success: false, error: "ข้อมูลไม่ครบถ้วน" };
  }

  const supabase = getSupabaseAdmin();

  // Only allow unlinking when the row belongs to the current LINE account.
    const { error } = await supabase.from("customers")
    .update({ line_user_id: null })
    .eq("id", customerId)
    .eq("line_user_id", lineUserId);

  if (error) {
    console.error("[unlinkLineIdFromCustomer]", error);
    return { success: false, error: "ไม่สามารถยกเลิกการผูกร้านค้าได้" };
  }

  return { success: true, data: null };
}

/** Fetch order history for a specific customer. */
export async function getCustomerOrders(
  customerId: string
): Promise<ActionResult<unknown[]>> {
  if (!customerId?.trim()) {
    return { success: false, error: "Customer ID is required." };
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("orders")
    .select(`
      *,
      order_items (
        id,
        product_sale_unit_id,
        sale_unit_label,
        quantity,
        unit_price,
        line_total,
        products (
          id,
          name,
          sku,
          unit
        )
      )
    `)
    .eq("customer_id", customerId)
    .order("order_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getCustomerOrders]", error);
    return { success: false, error: "ไม่สามารถโหลดประวัติการสั่งซื้อได้" };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalizedOrders = (data ?? []).map((order) => normalizeOrderForClient(order as any));

  return { success: true, data: normalizedOrders };
}

/** Fetch frequently ordered products for a specific customer. */
export async function getFrequentlyOrderedProducts(
  customerId: string,
  limit = 8
): Promise<ActionResult<FrequentProductSummary[]>> {
  if (!customerId?.trim()) {
    return { success: false, error: "Customer ID is required." };
  }

  const supabase = getSupabaseAdmin();
  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("id, created_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (ordersError) {
    console.error("[getFrequentlyOrderedProducts:orders]", ordersError);
    return { success: false, error: "ไม่สามารถโหลดสินค้าที่สั่งบ่อยได้" };
  }

  const orderRows = orders ?? [];
  if (orderRows.length === 0) {
    return { success: true, data: [] };
  }

  const orderTimestampMap = new Map<string, string>(
    orderRows.map((order: { id: string; created_at: string }) => [order.id, order.created_at]),
  );

  const { data: orderItems, error: itemsError } = await supabase
    .from("order_items")
    .select("order_id, product_id, product_sale_unit_id, quantity")
    .in("order_id", orderRows.map((order: { id: string }) => order.id));

  if (itemsError) {
    console.error("[getFrequentlyOrderedProducts:items]", itemsError);
    return { success: false, error: "ไม่สามารถโหลดสินค้าที่สั่งบ่อยได้" };
  }

  const productMap = new Map<string, FrequentProductSummary>();

  for (const item of orderItems ?? []) {
    const productId = item.product_id as string | null;
    if (!productId) continue;
    const productSaleUnitId = (item.product_sale_unit_id as string | null) ?? null;
    const summaryKey = `${productId}:${productSaleUnitId ?? "default"}`;

    const lastOrderedAt = orderTimestampMap.get(item.order_id as string) ?? "";
    const quantity = Number(item.quantity) || 0;
    const existing = productMap.get(summaryKey);

    if (!existing) {
      productMap.set(summaryKey, {
        productId,
        productSaleUnitId,
        totalQuantity: quantity,
        orderCount: 1,
        lastOrderedAt,
      });
      continue;
    }

    existing.totalQuantity += quantity;
    existing.orderCount += 1;
    if (lastOrderedAt > existing.lastOrderedAt) {
      existing.lastOrderedAt = lastOrderedAt;
    }
  }

  const frequentProducts = Array.from(productMap.values())
    .sort((a, b) => {
      if (b.orderCount !== a.orderCount) return b.orderCount - a.orderCount;
      if (b.totalQuantity !== a.totalQuantity) return b.totalQuantity - a.totalQuantity;
      return b.lastOrderedAt.localeCompare(a.lastOrderedAt);
    })
    .slice(0, limit);

  return { success: true, data: frequentProducts };
}

export type DeliveredProductSummary = {
  productId: string;
  productName: string;
  saleUnitLabel: string;
  totalDelivered: number;
  orderCount: number;
  imageUrl: string | null;
};

/** Fetch actually-delivered product totals for a customer across all confirmed delivery notes. */
export async function getCustomerDeliveredSummary(
  customerId: string,
): Promise<ActionResult<DeliveredProductSummary[]>> {
  if (!customerId?.trim()) {
    return { success: false, error: "Customer ID is required." };
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("delivery_note_items")
    .select(`
      product_id,
      sale_unit_label,
      quantity_delivered,
      delivery_notes!inner (
        customer_id,
        status
      ),
      products (
        name,
        product_images ( public_url, sort_order )
      )
    `)
    .eq("delivery_notes.customer_id", customerId)
    .eq("delivery_notes.status", "confirmed");

  if (error) {
    console.error("[getCustomerDeliveredSummary]", error);
    return { success: false, error: "ไม่สามารถโหลดสรุปสินค้าได้" };
  }

  type Row = {
    product_id: string;
    sale_unit_label: string;
    quantity_delivered: number;
    products: {
      name: string;
      product_images: { public_url: string; sort_order: number | null }[];
    } | null;
  };

  const summaryMap = new Map<string, DeliveredProductSummary>();

  for (const row of (data ?? []) as Row[]) {
    const key = `${row.product_id}::${row.sale_unit_label}`;
    const existing = summaryMap.get(key);
    const qty = Number(row.quantity_delivered) || 0;

    if (existing) {
      existing.totalDelivered += qty;
      existing.orderCount += 1;
    } else {
      const images = (row.products?.product_images ?? []).toSorted(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
      );
      summaryMap.set(key, {
        productId: row.product_id,
        productName: row.products?.name ?? "-",
        saleUnitLabel: row.sale_unit_label,
        totalDelivered: qty,
        orderCount: 1,
        imageUrl: images[0]?.public_url ?? null,
      });
    }
  }

  const result = Array.from(summaryMap.values()).sort(
    (a, b) => b.totalDelivered - a.totalDelivered,
  );

  return { success: true, data: result };
}

/** Create a new order with items. */
export async function createOrder(
  organizationId: string,
  customerId: string,
  items: { productId: string; productSaleUnitId: string; quantity: number }[],
): Promise<ActionResult<unknown>> {
  if (!organizationId?.trim() || !customerId?.trim() || items.length === 0) {
    return { success: false, error: "ข้อมูลไม่ครบถ้วน หรือไม่มีสินค้าในตะกร้า" };
  }

  const orderWindowSettings = await getOrderWindowSettings(organizationId);
  const bangkokNow = getBangkokNowParts();
  if (
    !isOrderOpenAtMinutes({
      allowOrderAfterCutoff: orderWindowSettings.allowOrderAfterCutoff,
      closeTime: orderWindowSettings.closeTime,
      currentMinutes: bangkokNow.minutes,
      openTime: orderWindowSettings.openTime,
    })
  ) {
    return { success: false, error: "ขณะนี้ปิดรับออเดอร์แล้ว" };
  }

  const supabase = getSupabaseAdmin();

  // 1. Generate order number via atomic DB sequence (ORD + YYYYMMDD + 5-digit running)
  const orderDate = new Date().toISOString().slice(0, 10);
  const { data: orderNumber, error: seqError } = await supabase.rpc(
    "next_order_number",
    { p_organization_id: organizationId, p_order_date: orderDate },
  );
  if (seqError || !orderNumber) {
    console.error("[createOrder:orderNumber]", seqError);
    return { success: false, error: "ไม่สามารถสร้างเลขออเดอร์ได้" };
  }

  const builtItems = await buildOrderItemData(supabase, organizationId, customerId, items);
  if (!builtItems.success) {
    return { success: false, error: builtItems.error };
  }

  const { orderItemsData, productMap } = builtItems.data;

  const totalAmount = orderItemsData.reduce((sum, item) => sum + item.line_total, 0);

  // 3. Create the order
  const { data: order, error: oError } = await supabase.from("orders").insert({
    organization_id: organizationId,
    customer_id: customerId,
    order_number: orderNumber,
    status: "submitted",
    total_amount: totalAmount,
    subtotal_amount: totalAmount,
    order_date: orderDate,
  }).select().single();

  if (oError || !order) {
    console.error("[createOrder:insertOrder]", oError);
    return { success: false, error: "ไม่สามารถสร้างคำสั่งซื้อได้" };
  }

  // 4. Create order items
  const orderItemsPayload = orderItemsData.map((item) => ({
    ...item,
    order_id: order.id,
  }));

  const { error: itemsError } = await supabase.from("order_items").insert(orderItemsPayload);

  if (itemsError) {
    console.error("[createOrder:insertItems]", itemsError);
    // Ideally we'd rollback order creation, but Supabase/PostgREST doesn't support 
    // transactions across multiple inserts easily without RPC.
    return { success: false, error: "ไม่สามารถบันทึกรายการสินค้าได้" };
  }

  const clientOrderItems = buildClientOrderItems(orderItemsData, productMap);

  const receiptItems = orderItemsData.map((item) => ({
    name: productMap.get(item.product_id)?.name ?? "-",
    saleUnitLabel: item.sale_unit_label,
    quantity: item.quantity,
    unitPrice: item.unit_price,
    lineTotal: item.line_total,
  }));

  // 5. Fire LINE notifications (fire-and-forget — never block the order response)
  void (async () => {
    try {
      const { data: customer } = await supabase
        .from("customers")
        .select("name, line_user_id")
        .eq("id", customerId)
        .single();

      const notifyPayload = {
        customerName: customer?.name ?? customerId,
        orderNumber: order.order_number,
        totalAmount,
        items: receiptItems.map((item) => ({
          productName: item.name,
          saleUnitLabel: item.saleUnitLabel,
          quantity: item.quantity,
        })),
      };

      await notifyNewOrder(notifyPayload);
      await sendNewOrderPushNotification({
        organizationId,
        customerName: customer?.name ?? customerId,
        orderNumber: order.order_number,
      });

    } catch (err) {
      console.error("[createOrder:notify]", err);
    }
  })();

  return {
    success: true,
    data: {
      ...order,
      order_items: clientOrderItems,
      receiptItems,
    },
  };
}

export async function sendCustomerReceiptImage(
  organizationId: string,
  customerId: string,
  orderNumber: string,
  imageDataUrl: string,
  fallbackLineUserId?: string | null,
): Promise<ActionResult<{ imageUrl: string }>> {
  if (!organizationId?.trim() || !customerId?.trim() || !orderNumber?.trim() || !imageDataUrl?.trim()) {
    return { success: false, error: "ข้อมูลใบยืนยันไม่ครบถ้วน" };
  }

  const parsedImage = parseImageDataUrl(imageDataUrl);
  if (!parsedImage) {
    return { success: false, error: "รูปใบยืนยันไม่ถูกต้อง" };
  }

  if (parsedImage.buffer.byteLength > 8 * 1024 * 1024) {
    return { success: false, error: "ขนาดรูปใบยืนยันใหญ่เกินไป" };
  }

  const supabase = getSupabaseAdmin();
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("name, line_user_id")
    .eq("id", customerId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (customerError || !customer) {
    console.error("[sendCustomerReceiptImage:customer]", customerError);
    return { success: false, error: "ไม่พบข้อมูลร้านค้า" };
  }

  const lineUserId = resolveCustomerLineUserId(
    customer.line_user_id,
    fallbackLineUserId,
  );
  if (!lineUserId) {
    return { success: false, error: "ไม่พบ LINE ของลูกค้า" };
  }

  if (normalizeLineUserId(customer.line_user_id) !== lineUserId) {
    await supabase
      .from("customers")
      .update({ line_user_id: lineUserId })
      .eq("id", customerId)
      .eq("organization_id", organizationId);
  }

  const extension = guessExtension(parsedImage.contentType);
  const storagePath = `${organizationId}/line-receipts/${orderNumber}-${Date.now()}.${extension}`;

  const { data: buckets } = await supabase.storage.listBuckets();
  const hasBucket = (buckets ?? []).some((bucket) => bucket.name === RECEIPT_IMAGE_BUCKET);
  if (!hasBucket) {
    await supabase.storage.createBucket(RECEIPT_IMAGE_BUCKET, {
      public: true,
      fileSizeLimit: "10MB",
      allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
    });
  }

  const { error: uploadError } = await supabase.storage
    .from(RECEIPT_IMAGE_BUCKET)
    .upload(storagePath, parsedImage.buffer, {
      upsert: true,
      contentType: parsedImage.contentType,
      cacheControl: "31536000",
    });

  if (uploadError) {
    console.error("[sendCustomerReceiptImage:upload]", uploadError);
    return { success: false, error: "อัปโหลดรูปใบยืนยันไม่สำเร็จ" };
  }

  const {
    data: { publicUrl: imageUrl },
  } = supabase.storage.from(RECEIPT_IMAGE_BUCKET).getPublicUrl(storagePath);

  const pushed = await notifyCustomerReceiptImage(lineUserId, {
    customerName: customer.name ?? customerId,
    orderNumber,
    imageUrl,
  });

  if (!pushed) {
    return { success: false, error: "Failed to send receipt image to LINE." };
  }

  return { success: true, data: { imageUrl } };
}

export async function updateCustomerOrder(
  organizationId: string,
  customerId: string,
  orderId: string,
  items: OrderMutationItemInput[],
): Promise<ActionResult<unknown>> {
  if (!organizationId?.trim() || !customerId?.trim() || !orderId?.trim() || items.length === 0) {
    return { success: false, error: "ข้อมูลไม่ครบถ้วน หรือไม่มีสินค้าในคำสั่งซื้อ" };
  }

  const supabase = getSupabaseAdmin();
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, order_date, order_number, status")
    .eq("id", orderId)
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .single();

  if (orderError || !order) {
    console.error("[updateCustomerOrder:loadOrder]", orderError);
    return { success: false, error: "ไม่พบคำสั่งซื้อที่ต้องการแก้ไข" };
  }

  if (!(await isCustomerOrderEditable(organizationId, order.order_date, order.status))) {
    return { success: false, error: "คำสั่งซื้อนี้หมดเวลาแก้ไขแล้ว" };
  }

  const builtItems = await buildOrderItemData(supabase, organizationId, customerId, items);
  if (!builtItems.success) {
    return { success: false, error: builtItems.error };
  }

  const { orderItemsData, productMap } = builtItems.data;
  const totalAmount = orderItemsData.reduce((sum, item) => sum + item.line_total, 0);

  const { error: deleteItemsError } = await supabase
    .from("order_items")
    .delete()
    .eq("order_id", orderId)
    .eq("organization_id", organizationId);

  if (deleteItemsError) {
    console.error("[updateCustomerOrder:deleteItems]", deleteItemsError);
    return { success: false, error: "ไม่สามารถอัปเดตรายการสินค้าได้" };
  }

  const { error: insertItemsError } = await supabase
    .from("order_items")
    .insert(
      orderItemsData.map((item) => ({
        ...item,
        order_id: orderId,
      })),
    );

  if (insertItemsError) {
    console.error("[updateCustomerOrder:insertItems]", insertItemsError);
    return { success: false, error: "ไม่สามารถบันทึกรายการที่แก้ไขได้" };
  }

  const { data: updatedOrder, error: updateOrderError } = await supabase
    .from("orders")
    .update({
      subtotal_amount: totalAmount,
      total_amount: totalAmount,
    })
    .eq("id", orderId)
    .eq("organization_id", organizationId)
    .eq("customer_id", customerId)
    .select(`
      *,
      order_items (
        id,
        product_sale_unit_id,
        sale_unit_label,
        quantity,
        unit_price,
        line_total,
        products (
          id,
          name,
          sku,
          unit
        )
      )
    `)
    .single();

  if (updateOrderError || !updatedOrder) {
    console.error("[updateCustomerOrder:updateOrder]", updateOrderError);
    return { success: false, error: "ไม่สามารถบันทึกคำสั่งซื้อที่แก้ไขได้" };
  }

  revalidatePath("/order");
  revalidatePath("/orders");
  revalidatePath("/dashboard");
  revalidatePath("/delivery");

  return {
    success: true,
    data: normalizeOrderForClient({
      ...updatedOrder,
      receiptItems: orderItemsData.map((item) => ({
        name: productMap.get(item.product_id)?.name ?? "-",
        saleUnitLabel: item.sale_unit_label,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        lineTotal: item.line_total,
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any),
  };
}
