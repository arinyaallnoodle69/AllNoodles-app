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

type DeliveryNoteRow = {
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
};

type DeliveryNoteItemRow = {
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
  order_items: { cost_price: number | string | null } | null;
};

type ProductSaleUnitRow = {
  id: string;
  product_id: string;
  base_unit_quantity: number | string | null;
  cost_mode: string | null;
  fixed_cost_price: number | string | null;
};

type ProductRow = {
  id: string;
  cost_price: number | string | null;
};

const QUERY_CHUNK_SIZE = 50;

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

  // 1. Fetch confirmed delivery notes in date range
  let notesQuery = supabase
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
      )
    `)
    .eq("organization_id", organizationId)
    .eq("status", "confirmed")
    .gte("delivery_date", fromDate)
    .lte("delivery_date", toDate)
    .order("delivery_date", { ascending: true })
    .order("delivery_number", { ascending: true });

  if (customerIds.length > 0) {
    notesQuery = notesQuery.in("customer_id", customerIds);
  }

  if (warehouseId) {
    notesQuery = notesQuery.eq("warehouse_id", warehouseId);
  }

  const { data: notesData, error: notesError } = await notesQuery;
  if (notesError) throw new Error(notesError.message);

  const notes = (notesData ?? []) as unknown as DeliveryNoteRow[];
  if (notes.length === 0) {
    return {
      stores: [],
      summary: { totalSales: 0, totalCost: 0, totalNetProfit: 0, totalItemsCount: 0, totalQuantity: 0, avgMarginPercent: 0 },
      insights: { topPerformingItem: null, lowestProfitMarginItem: null, topStore: null },
    };
  }

  const noteIds = notes.map((n) => n.id);
  const noteById = new Map<string, DeliveryNoteRow>(notes.map((n) => [n.id, n]));

  // 2. Fetch delivery note items in chunks to avoid oversized request URLs / fetch failures
  const typedItems: DeliveryNoteItemRow[] = [];
  for (let i = 0; i < noteIds.length; i += QUERY_CHUNK_SIZE) {
    const chunk = noteIds.slice(i, i + QUERY_CHUNK_SIZE);
    const { data: items, error: itemsError } = await supabase
      .from("delivery_note_items")
      .select(`
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
        )
      `)
      .in("delivery_note_id", chunk);

    if (itemsError) throw new Error(itemsError.message);
    if (items) {
      typedItems.push(...((items ?? []) as unknown as DeliveryNoteItemRow[]));
    }
  }

  // 3. Resolve cost structures for sale units and products
  const saleUnitIds = [
    ...new Set(
      typedItems
        .map((item) => item.product_sale_unit_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  const typedSaleUnits: ProductSaleUnitRow[] = [];
  if (saleUnitIds.length > 0) {
    for (let i = 0; i < saleUnitIds.length; i += QUERY_CHUNK_SIZE) {
      const chunk = saleUnitIds.slice(i, i + QUERY_CHUNK_SIZE);
      const { data: saleUnits, error: suError } = await supabase
        .from("product_sale_units")
        .select("id, product_id, base_unit_quantity, cost_mode, fixed_cost_price")
        .in("id", chunk);

      if (suError) throw new Error(suError.message);
      if (saleUnits) {
        typedSaleUnits.push(...(saleUnits as ProductSaleUnitRow[]));
      }
    }
  }

  const productIds = [
    ...new Set(
      typedSaleUnits
        .map((unit) => unit.product_id)
        .concat(
          typedItems
            .map((item) => item.products?.id)
            .filter((v): v is string => Boolean(v)),
        ),
    ),
  ];

  const typedProducts: ProductRow[] = [];
  if (productIds.length > 0) {
    for (let i = 0; i < productIds.length; i += QUERY_CHUNK_SIZE) {
      const chunk = productIds.slice(i, i + QUERY_CHUNK_SIZE);
      const { data: products, error: pError } = await supabase
        .from("products")
        .select("id, cost_price")
        .in("id", chunk);

      if (pError) throw new Error(pError.message);
      if (products) {
        typedProducts.push(...(products as ProductRow[]));
      }
    }
  }

  const productCostById = new Map(
    typedProducts.map((product) => [product.id, toNumber(product.cost_price)]),
  );

  const saleUnitCostById = new Map(
    typedSaleUnits.map((unit) => {
      const productCost = productCostById.get(unit.product_id) ?? 0;
      const baseQuantity = toNumber(unit.base_unit_quantity);
      const effectiveCost =
        unit.cost_mode === "fixed" && unit.fixed_cost_price != null
          ? toNumber(unit.fixed_cost_price)
          : productCost * baseQuantity;
      return [unit.id, effectiveCost];
    }),
  );

  // 4. Group & aggregate items by delivery note (customer + date + delivery number)
  // Map key: delivery_note_id
  const deliveryNoteMap = new Map<
    string,
    {
      customerId: string;
      customerCode: string;
      customerName: string;
      deliveryDate: string;
      deliveryNumber: string;
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

  for (const item of typedItems) {
    const note = noteById.get(item.delivery_note_id);
    if (!note) continue;

    const deliveryNoteId = note.id;
    const customerId = note.customer_id;
    const customerCode = note.customers?.customer_code ?? "-";
    const customerName = note.customers?.name ?? "ไม่ระบุชื่อร้าน";
    const deliveryDate = note.delivery_date;
    const deliveryNumber = note.delivery_number ?? "";

    const sku = item.products?.sku ?? "-";
    const name = item.products?.name ?? "-";
    const unit = item.sale_unit_label ?? item.products?.unit ?? "-";
    const qty = toNumber(item.quantity_delivered);
    const lineTotal = toNumber(item.line_total);

    // Cost calculation
    const orderItemCost = item.order_items ? toNumber(item.order_items.cost_price) : null;
    const unitCost = (orderItemCost !== null && orderItemCost > 0)
      ? orderItemCost
      : (item.product_sale_unit_id
          ? (saleUnitCostById.get(item.product_sale_unit_id) ?? 0)
          : (item.products?.id ? (productCostById.get(item.products.id) ?? 0) : 0));
    const lineCost = unitCost * qty;

    // Aggregate globally
    const globKey = `${sku}::${name}`;
    const globVal = productGlobalMap.get(globKey) ?? { name, sales: 0, cost: 0 };
    globVal.sales += lineTotal;
    globVal.cost += lineCost;
    productGlobalMap.set(globKey, globVal);

    // Aggregate store sales globally (for Top Store Insight)
    const stVal = storeSalesMap.get(customerId) ?? { name: customerName, sales: 0 };
    stVal.sales += lineTotal;
    storeSalesMap.set(customerId, stVal);

    // Aggregate inside delivery note group
    let noteData = deliveryNoteMap.get(deliveryNoteId);
    if (!noteData) {
      noteData = {
        customerId,
        customerCode,
        customerName,
        deliveryDate,
        deliveryNumber,
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

  // 5. Structure into detailed response types
  const stores: DetailedProfitStoreGroup[] = [];
  let totalSales = 0;
  let totalCost = 0;
  let totalNetProfit = 0;
  let totalQuantity = 0;
  const uniqueSkus = new Set<string>();

  for (const noteData of deliveryNoteMap.values()) {
    const items: DetailedProfitProductItem[] = [];
    let storeSales = 0;
    let storeCost = 0;
    let storeProfit = 0;
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

      storeSales += prod.salesAmount;
      storeCost += prod.totalCost;
      storeProfit += profit;
      storeQuantity += prod.quantity;
    }

    // Sort products by sku
    items.sort((a, b) => a.productSku.localeCompare(b.productSku));

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
      avgMarginPercent: storeSales > 0 ? (storeProfit / storeSales) * 100 : 0,
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

  // 6. Calculate Insights
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
