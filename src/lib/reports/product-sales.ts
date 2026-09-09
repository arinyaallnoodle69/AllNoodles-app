import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeSearch } from "@/lib/utils/search";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProductSalesStoreBreakdown = {
  customerId: string;
  customerCode: string;
  customerName: string;
  totalQty: number;
  unit: string;
  totalCost: number;
  totalRevenue: number;
  netProfit: number;
  margin: number;
};

export type ProductSalesRow = {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  imageUrl: string | null;
  totalQty: number;
  costPerUnit: number;
  avgUnitPrice: number;
  totalRevenue: number;
  totalCost: number;
  stores: ProductSalesStoreBreakdown[];
};

export type ProductSalesSummary = {
  totalRevenue: number;
  totalQty: number;
  totalCost: number;
  netProfit: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// ─── Customer list for filter ─────────────────────────────────────────────────

export type CustomerOption = { id: string; name: string; defaultVehicleId?: string | null };
export type ProductFilterOption = {
  categoryNames: string[];
  id: string;
  name: string;
  sku: string;
  imageUrl: string | null;
};

export async function getCustomersForFilter(
  organizationId: string,
): Promise<CustomerOption[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("customers")
    .select("id, name, default_vehicle_id, sort_order")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  return ((data ?? []) as { id: string; name: string; default_vehicle_id: string | null }[]).map((c) => ({
    id: c.id,
    name: c.name,
    defaultVehicleId: c.default_vehicle_id,
  }));
}

export async function getCategoriesForFilter(
  organizationId: string,
): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("product_categories")
    .select("name")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  return (data ?? []).map((c) => c.name);
}

export async function getProductsForFilter(
  organizationId: string,
): Promise<ProductFilterOption[]> {
  const supabase = getSupabaseAdmin();
  const [productsResult, categoriesResult, categoryItemsResult] = await Promise.all([
        supabase.from("products")
      .select("id, name, sku, display_order, product_images(public_url, sort_order)")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true }),
        supabase.from("product_categories")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
        supabase.from("product_category_items")
      .select("product_category_id, product_id")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true }),
  ]);

  const categoryNameById = new Map<string, string>(
    (((categoriesResult.data ?? []) as Array<{ id: string; name: string }>) ?? []).map(
      (category) => [category.id, category.name],
    ),
  );
  const categoryNamesByProductId = new Map<string, string[]>();

  for (const item of ((categoryItemsResult.data ?? []) as Array<{
    product_category_id: string;
    product_id: string;
  }>) ?? []) {
    const categoryName = categoryNameById.get(item.product_category_id);
    if (!categoryName) {
      continue;
    }

    const current = categoryNamesByProductId.get(item.product_id) ?? [];
    current.push(categoryName);
    categoryNamesByProductId.set(item.product_id, current);
  }

  return ((productsResult.data ?? []) as Array<{
    id: string;
    name: string;
    sku: string;
    product_images: Array<{ public_url: string; sort_order: number }> | null;
  }>).map((product) => {
    const sortedImages = [...(product.product_images ?? [])].sort(
      (a, b) => a.sort_order - b.sort_order,
    );

    return {
      categoryNames: categoryNamesByProductId.get(product.id) ?? [],
      id: product.id,
      name: product.name,
      sku: product.sku,
      imageUrl: sortedImages[0]?.public_url ?? null,
    };
  });
}

// ─── Main ranking query (source: delivered delivery_notes) ────────────────────

export async function getProductSalesRanking(params: {
  organizationId: string;
  fromDate: string;
  toDate: string;
  productSearch?: string;
  productIds?: string[];
  customerIds?: string[];
  warehouseId?: string;
  page?: number;
  pageSize?: number;
}): Promise<{
  rows: ProductSalesRow[];
  allRows: ProductSalesRow[];
  summary: ProductSalesSummary;
  total: number;
}> {
  const {
    organizationId,
    fromDate,
    toDate,
    productSearch = "",
    productIds = [],
    customerIds = [],
    warehouseId,
    page = 1,
    pageSize = 20,
  } = params;

  const supabase = getSupabaseAdmin();

    let query = supabase
    .from("delivery_notes")
    .select(`
      customer_id,
      customers(id, name, customer_code),
      delivery_note_items(
        quantity_delivered,
        quantity_in_base_unit,
        unit_price,
        line_total,
        sale_unit_label,
        products!inner(id, name, sku, unit, cost_price, product_images(public_url, sort_order)),
        order_items(cost_price)
      )
    `)
    .eq("organization_id", organizationId)
    .eq("status", "confirmed")
    .gte("delivery_date", fromDate)
    .lte("delivery_date", toDate);

  if (customerIds.length > 0) {
    query = query.in("customer_id", customerIds);
  }

  if (warehouseId) {
    query = query.eq("warehouse_id", warehouseId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  type RawDeliveryNote = {
    customer_id: string;
    customers: { id: string; name: string; customer_code: string } | { id: string; name: string; customer_code: string }[] | null;
    delivery_note_items: Array<{
      quantity_delivered: unknown;
      quantity_in_base_unit: unknown;
      unit_price: unknown;
      line_total: unknown;
      sale_unit_label: string;
      products: {
        id: string;
        name: string;
        sku: string;
        unit: string;
        cost_price: unknown;
        product_images: Array<{ public_url: string; sort_order: number }>;
      };
      order_items: { cost_price: unknown } | null;
    }>;
  };

  const rawNotes = (data ?? []) as RawDeliveryNote[];

  // Aggregate by product_id
  type ProductAggregate = {
    sku: string;
    name: string;
    unit: string;
    imageUrl: string | null;
    costPerUnit: number;
    totalQty: number;
    totalRevenue: number;
    totalCost: number;
    unitPriceSum: number;
    unitPriceCount: number;
    customerMap: Map<
      string,
      {
        customerId: string;
        customerCode: string;
        customerName: string;
        totalQty: number;
        totalCost: number;
        totalRevenue: number;
        unit: string;
      }
    >;
  };

  const productMap = new Map<string, ProductAggregate>();

  for (const note of rawNotes) {
    const customerObj = Array.isArray(note.customers) ? note.customers[0] : note.customers;
    const customerId = note.customer_id;
    const customerCode = customerObj?.customer_code || "-";
    const customerName = customerObj?.name || "ไม่ระบุชื่อร้าน";

    for (const item of note.delivery_note_items ?? []) {
      const product = item.products;
      if (!product) continue;

      const sortedImages = [...(product.product_images ?? [])].sort(
        (a, b) => a.sort_order - b.sort_order,
      );
      const imageUrl = sortedImages[0]?.public_url ?? null;

      const qty = toNum(item.quantity_in_base_unit) || toNum(item.quantity_delivered);
      const orderItemCost = item.order_items ? toNum(item.order_items.cost_price) : null;
      const costPerUnit = (orderItemCost !== null && orderItemCost > 0)
        ? orderItemCost
        : toNum(product.cost_price);
      const cost = costPerUnit * toNum(item.quantity_delivered);
      const revenue = toNum(item.line_total);
      const unitPrice = toNum(item.unit_price);

      let existing = productMap.get(product.id);
      if (!existing) {
        existing = {
          sku: product.sku,
          name: product.name,
          unit: product.unit,
          costPerUnit,
          imageUrl,
          totalQty: 0,
          totalRevenue: 0,
          totalCost: 0,
          unitPriceSum: 0,
          unitPriceCount: 0,
          customerMap: new Map(),
        };
        productMap.set(product.id, existing);
      }

      existing.totalQty += qty;
      existing.totalRevenue += revenue;
      existing.totalCost += cost;
      existing.unitPriceSum += unitPrice;
      existing.unitPriceCount += 1;

      let storeEntry = existing.customerMap.get(customerId);
      if (!storeEntry) {
        storeEntry = {
          customerId,
          customerCode,
          customerName,
          totalQty: 0,
          totalCost: 0,
          totalRevenue: 0,
          unit: product.unit,
        };
        existing.customerMap.set(customerId, storeEntry);
      }
      storeEntry.totalQty += qty;
      storeEntry.totalCost += cost;
      storeEntry.totalRevenue += revenue;
    }
  }

  // Convert to sorted array
  let allRows: ProductSalesRow[] = [...productMap.entries()]
    .map(([productId, v]) => {
      const stores: ProductSalesStoreBreakdown[] = Array.from(v.customerMap.values())
        .map((s) => {
          const netProfit = s.totalRevenue - s.totalCost;
          const margin = s.totalRevenue > 0 ? (netProfit / s.totalRevenue) * 100 : 0;
          return {
            customerId: s.customerId,
            customerCode: s.customerCode,
            customerName: s.customerName,
            totalQty: s.totalQty,
            unit: s.unit,
            totalCost: s.totalCost,
            totalRevenue: s.totalRevenue,
            netProfit,
            margin,
          };
        })
        .sort((a, b) => b.totalRevenue - a.totalRevenue || a.customerCode.localeCompare(b.customerCode, "th"));

      return {
        productId,
        sku: v.sku,
        name: v.name,
        unit: v.unit,
        imageUrl: v.imageUrl,
        costPerUnit: v.costPerUnit,
        totalQty: v.totalQty,
        avgUnitPrice: v.unitPriceCount > 0 ? v.unitPriceSum / v.unitPriceCount : 0,
        totalRevenue: v.totalRevenue,
        totalCost: v.totalCost,
        stores,
      };
    })
    .sort((a, b) => b.totalRevenue - a.totalRevenue);

  // Product name / SKU filter
  if (productSearch) {
    const term = normalizeSearch(productSearch);
    allRows = allRows.filter(
      (r) => normalizeSearch(r.name).includes(term) || normalizeSearch(r.sku).includes(term),
    );
  }

  if (productIds.length > 0) {
    const selectedProductIds = new Set(productIds);
    allRows = allRows.filter((row) => selectedProductIds.has(row.productId));
  }

  // Summary from all filtered rows
  const totalRevenue = allRows.reduce((s, r) => s + r.totalRevenue, 0);
  const totalQty = allRows.reduce((s, r) => s + r.totalQty, 0);
  const totalCost = allRows.reduce((s, r) => s + r.totalCost, 0);

  const summary: ProductSalesSummary = {
    totalRevenue,
    totalQty,
    totalCost,
    netProfit: totalRevenue - totalCost,
  };

  const total = allRows.length;
  const rows = allRows.slice((page - 1) * pageSize, page * pageSize);

  return { rows, allRows, summary, total };
}
