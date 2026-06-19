import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type DetailedProfitProductItem = {
  productSku: string;
  productName: string;
  quantity: number;
  unit: string;
  costPrice: number;
  salesAmount: number;
  profit: number;
  marginPercent: number;
};

export type DetailedProfitStoreGroup = {
  customerId: string;
  customerCode: string;
  customerName: string;
  deliveryDate: string;
  deliveryNumber: string;
  items: DetailedProfitProductItem[];
  totalQuantity: number;
  totalSales: number;
  totalCost: number;
  totalProfit: number;
  avgMarginPercent: number;
};

export type DetailedProfitSummary = {
  totalSales: number;
  totalCost: number;
  totalNetProfit: number;
  totalItemsCount: number; // unique active items
  totalQuantity: number; // total quantity across all notes
  avgMarginPercent: number;
};

export type DetailedProfitInsights = {
  topPerformingItem: {
    name: string;
    sales: number;
  } | null;
  lowestProfitMarginItem: {
    name: string;
    marginPercent: number;
  } | null;
  topStore: {
    name: string;
    contributionPercent: number;
  } | null;
};

export type DetailedProfitReportData = {
  stores: DetailedProfitStoreGroup[];
  summary: DetailedProfitSummary;
  insights: DetailedProfitInsights;
};

type QueryDeliveryNoteRow = {
  id: string;
  delivery_date: string;
  delivery_number: string;
  total_amount: number | string | null;
  customer_id: string;
  customers: {
    id: string;
    customer_code: string | null;
    name: string | null;
  } | null;
  delivery_note_items: Array<{
    id: string;
    delivery_note_id: string;
    quantity_delivered: number | string | null;
    product_sale_unit_id: string | null;
    line_total: number | string | null;
    sale_unit_label: string | null;
    products: {
      id: string;
      name: string | null;
      sku: string | null;
      unit: string | null;
      cost_price: number | string | null;
    } | null;
    order_items: {
      cost_price: number | string | null;
    } | null;
    product_sale_units: {
      id: string;
      product_id: string;
      base_unit_quantity: number | string | null;
      cost_mode: string | null;
      fixed_cost_price: number | string | null;
    } | null;
  }>;
};

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getDetailedProfitSalesReport(params: {
  organizationId: string;
  fromDate: string;
  toDate: string;
  customerIds?: string[];
  warehouseId?: string;
}): Promise<DetailedProfitReportData> {
  const { organizationId, fromDate, toDate, customerIds = [], warehouseId } = params;
  const supabase = getSupabaseAdmin();

  // 1. Fetch confirmed delivery notes and all their nested relations in batches to bypass the 1000-row limit
  const batchSize = 1000;
  const allNotes: QueryDeliveryNoteRow[] = [];
  let from = 0;
  let to = batchSize - 1;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from("delivery_notes")
      .select(`
        id,
        delivery_date,
        delivery_number,
        total_amount,
        customer_id,
        customers(
          id,
          customer_code,
          name
        ),
        delivery_note_items(
          id,
          delivery_note_id,
          quantity_delivered,
          product_sale_unit_id,
          line_total,
          sale_unit_label,
          products(
            id,
            name,
            sku,
            unit,
            cost_price
          ),
          order_items(
            cost_price
          ),
          product_sale_units(
            id,
            product_id,
            base_unit_quantity,
            cost_mode,
            fixed_cost_price
          )
        )
      `)
      .eq("organization_id", organizationId)
      .eq("status", "confirmed")
      .gte("delivery_date", fromDate)
      .lte("delivery_date", toDate)
      .order("delivery_date", { ascending: true })
      .order("delivery_number", { ascending: true })
      .range(from, to);

    if (customerIds.length > 0) {
      query = query.in("customer_id", customerIds);
    }

    if (warehouseId) {
      query = query.eq("warehouse_id", warehouseId);
    }

    const { data: notesData, error: notesError } = await query;
    if (notesError) throw new Error(notesError.message);

    const notes = (notesData ?? []) as unknown as QueryDeliveryNoteRow[];
    allNotes.push(...notes);

    if (notes.length < batchSize) {
      hasMore = false;
    } else {
      from += batchSize;
      to += batchSize;
    }
  }

  if (allNotes.length === 0) {
    return {
      stores: [],
      summary: { totalSales: 0, totalCost: 0, totalNetProfit: 0, totalItemsCount: 0, totalQuantity: 0, avgMarginPercent: 0 },
      insights: { topPerformingItem: null, lowestProfitMarginItem: null, topStore: null },
    };
  }

  // 2. Group & aggregate items by delivery note (customer + date + delivery number)
  // Map key: delivery_note_id
  const deliveryNoteMap = new Map<
    string,
    {
      customerId: string;
      customerCode: string;
      customerName: string;
      deliveryDate: string;
      deliveryNumber: string;
      totalAmount: number;
      // Map key: product_sku + "::" + sale_unit_label
      productMap: Map<
        string,
        {
          sku: string;
          name: string;
          unit: string;
          quantity: number;
          salesAmount: number;
          totalCost: number;
        }
      >;
    }
  >();

  // Global product sales and profit records for insights
  const productGlobalMap = new Map<string, { name: string; sales: number; cost: number }>();
  // Global customer sales records for store performance index
  const storeSalesMap = new Map<string, { name: string; sales: number }>();

  for (const note of allNotes) {
    const deliveryNoteId = note.id;
    const customerId = note.customer_id;
    const customerCode = note.customers?.customer_code ?? "-";
    const customerName = note.customers?.name ?? "ไม่ระบุชื่อร้าน";
    const deliveryDate = note.delivery_date;
    const deliveryNumber = note.delivery_number ?? "";
    const noteTotalAmount = toNumber(note.total_amount);

    // Aggregate store sales globally using the delivery note's total_amount (for Top Store Insight)
    const stVal = storeSalesMap.get(customerId) ?? { name: customerName, sales: 0 };
    stVal.sales += noteTotalAmount;
    storeSalesMap.set(customerId, stVal);

    const items = note.delivery_note_items ?? [];
    for (const item of items) {
      const sku = item.products?.sku ?? "-";
      const name = item.products?.name ?? "-";
      const unit = item.sale_unit_label ?? item.products?.unit ?? "-";
      const qty = toNumber(item.quantity_delivered);
      const lineTotal = toNumber(item.line_total);

      // Cost calculation aligned with the main report's SQL RPC calculation
      const orderItemCost = item.order_items ? toNumber(item.order_items.cost_price) : null;
      const psu = item.product_sale_units;
      const productCost = item.products ? toNumber(item.products.cost_price) : 0;
      
      const unitCost = (orderItemCost !== null && orderItemCost > 0)
        ? orderItemCost
        : (psu
            ? (psu.cost_mode === "fixed" && psu.fixed_cost_price != null
                ? toNumber(psu.fixed_cost_price)
                : productCost * toNumber(psu.base_unit_quantity))
            : 0); // Defaults to 0 when psu is null to match get_profit_sales_report RPC
      const lineCost = unitCost * qty;

      // Aggregate globally
      const globKey = `${sku}::${name}`;
      const globVal = productGlobalMap.get(globKey) ?? { name, sales: 0, cost: 0 };
      globVal.sales += lineTotal;
      globVal.cost += lineCost;
      productGlobalMap.set(globKey, globVal);

      // Aggregate inside delivery note group
      let noteData = deliveryNoteMap.get(deliveryNoteId);
      if (!noteData) {
        noteData = {
          customerId,
          customerCode,
          customerName,
          deliveryDate,
          deliveryNumber,
          totalAmount: noteTotalAmount,
          productMap: new Map(),
        };
        deliveryNoteMap.set(deliveryNoteId, noteData);
      }

      const prodKey = `${sku}::${unit}`;
      let prodData = noteData.productMap.get(prodKey);
      if (!prodData) {
        prodData = {
          sku,
          name,
          unit,
          quantity: 0,
          salesAmount: 0,
          totalCost: 0,
        };
        noteData.productMap.set(prodKey, prodData);
      }

      prodData.quantity += qty;
      prodData.salesAmount += lineTotal;
      prodData.totalCost += lineCost;
    }
  }

  // 3. Structure into detailed response types
  const stores: DetailedProfitStoreGroup[] = [];
  let totalSales = 0;
  let totalCost = 0;
  let totalNetProfit = 0;
  let totalQuantity = 0;
  const uniqueSkus = new Set<string>();

  for (const noteData of deliveryNoteMap.values()) {
    const items: DetailedProfitProductItem[] = [];
    let storeCost = 0;
    let storeQuantity = 0;

    for (const prod of noteData.productMap.values()) {
      const profit = prod.salesAmount - prod.totalCost;
      const marginPercent = prod.salesAmount > 0 ? (profit / prod.salesAmount) * 100 : 0;
      uniqueSkus.add(prod.sku);

      items.push({
        productSku: prod.sku,
        productName: prod.name,
        quantity: prod.quantity,
        unit: prod.unit,
        costPrice: prod.quantity > 0 ? prod.totalCost / prod.quantity : 0,
        salesAmount: prod.salesAmount,
        profit,
        marginPercent,
      });

      storeCost += prod.totalCost;
      storeQuantity += prod.quantity;
    }

    // Sort products by sku
    items.sort((a, b) => a.productSku.localeCompare(b.productSku));

    const storeSales = noteData.totalAmount; // Align sales to delivery_notes.total_amount
    const storeProfit = storeSales - storeCost;
    const avgMarginPercent = storeSales > 0 ? (storeProfit / storeSales) * 100 : 0;

    totalSales += storeSales;
    totalCost += storeCost;
    totalNetProfit += storeProfit;
    totalQuantity += storeQuantity;

    stores.push({
      customerId: noteData.customerId,
      customerCode: noteData.customerCode,
      customerName: noteData.customerName,
      deliveryDate: noteData.deliveryDate,
      deliveryNumber: noteData.deliveryNumber,
      items,
      totalQuantity: storeQuantity,
      totalSales: storeSales,
      totalCost: storeCost,
      totalProfit: storeProfit,
      avgMarginPercent,
    });
  }

  // Sort groups by date ascending, then customer code, then delivery number
  stores.sort((a, b) => {
    const dateCompare = a.deliveryDate.localeCompare(b.deliveryDate);
    if (dateCompare !== 0) return dateCompare;
    const codeCompare = a.customerCode.localeCompare(b.customerCode);
    if (codeCompare !== 0) return codeCompare;
    return a.deliveryNumber.localeCompare(b.deliveryNumber);
  });

  // 4. Calculate Insights
  // A. Top Performing Item (Sales)
  let topPerformingItem: { name: string; sales: number } | null = null;
  let bestSales = 0;

  // B. Lowest Profit Margin
  let lowestProfitMarginItem: { name: string; marginPercent: number } | null = null;
  let worstMargin = 999999;

  for (const glob of productGlobalMap.values()) {
    if (glob.sales > bestSales) {
      bestSales = glob.sales;
      topPerformingItem = { name: glob.name, sales: glob.sales };
    }

    const margin = glob.sales > 0 ? ((glob.sales - glob.cost) / glob.sales) * 100 : 0;
    if (glob.sales > 0 && margin < worstMargin) {
      worstMargin = margin;
      lowestProfitMarginItem = { name: glob.name, marginPercent: margin };
    }
  }

  // C. Top Store Contribution
  let topStore: { name: string; contributionPercent: number } | null = null;
  let highestStoreSales = 0;

  for (const st of storeSalesMap.values()) {
    if (st.sales > highestStoreSales) {
      highestStoreSales = st.sales;
      topStore = {
        name: st.name,
        contributionPercent: totalSales > 0 ? (st.sales / totalSales) * 100 : 0,
      };
    }
  }

  return {
    stores,
    summary: {
      totalSales,
      totalCost,
      totalNetProfit,
      totalItemsCount: uniqueSkus.size,
      totalQuantity,
      avgMarginPercent: totalSales > 0 ? (totalNetProfit / totalSales) * 100 : 0,
    },
    insights: {
      topPerformingItem,
      lowestProfitMarginItem,
      topStore,
    },
  };
}
