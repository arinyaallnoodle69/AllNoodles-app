import "server-only";

import { getTodayInBangkok } from "@/lib/orders/date";
import { getRecentDailyPerformance } from "@/lib/reports/sales-overview";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getStockDashboardData, type StockProductOption, type StockSupplierOption } from "@/lib/stock/admin";
import type { Json } from "@/types/database";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DashboardKpi = {
  todayOrderCount: number;
  todayOrderAmount: number;
  todayNetProfit: number;
  todayCost: number;
  submittedOrderCount: number;
  pendingDeliveryCount: number;
  pendingDeliveryAmount: number;
  monthDeliveredAmount: number;
  activeCustomerCount: number;
  lowStockCount: number;
};

export type RecentOrder = {
  id: string;
  orderNumber: string;
  orderDate: string;
  customerName: string;
  totalAmount: number;
  status: "draft" | "submitted" | "confirmed" | "cancelled";
};

export type DashboardDailyPerformanceRow = {
  isoDate: string;
  monthLabel: string;
  revenue: number;
  cost: number;
  profit: number;
  orderCount: number;
};

export type LineOrderOverviewItem = {
  id: string;
  orderNumber?: string | null;
  orderId: string | null;
  lineDisplayName: string | null;
  linePictureUrl: string | null;
  customerName: string | null;
  createdAt: string;
  status: "pending_link" | "converted";
  hasUnpricedItems?: boolean;
};

export type DashboardOverview = {
  kpi: DashboardKpi;
  recentOrders: RecentOrder[];
  dailyPerformanceRows: DashboardDailyPerformanceRow[];
  dailyPerformanceRangeStartDate: string | null;
  dailyPerformanceRangeEndDate: string | null;
  stockProducts: StockProductOption[];
  stockSuppliers: StockSupplierOption[];
  lineOrders: LineOrderOverviewItem[];
};

type DeliveryNoteRow = {
  id: string;
  total_amount: number | string | null;
};

type DeliveryNoteItemRow = {
  delivery_note_id: string;
  quantity_delivered: number | string | null;
  product_sale_unit_id: string | null;
  order_items?: { cost_price: number | string | null } | null;
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

type LinePendingOrderDashboardRow = {
  id: string;
  converted_customer_id: string | null;
  converted_order_id: string | null;
  created_at: string;
  line_display_name: string | null;
  line_picture_url: string | null;
  status: "pending_link" | "converted" | "cancelled";
};

type LineSourceOrderDashboardRow = {
  id: string;
  order_number: string | null;
  created_at: string;
  customer_id: string;
  customers: { line_user_id: string | null; name: string | null } | null;
  metadata: Json | null;
  order_items: { unit_price: number | string | null }[];
};

type LineCustomerProfileDashboardRow = {
  customer_id: string | null;
  line_display_name: string | null;
  line_picture_url: string | null;
  line_user_id: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function firstOfMonth(iso: string) {
  return iso.slice(0, 7) + "-01";
}



async function loadTodayNetProfit(
  organizationId: string,
  isoDate: string,
): Promise<{ netProfit: number; totalCost: number; totalRevenue: number }> {
  const supabase = getSupabaseAdmin();
  const { data: notes } = await supabase
    .from("delivery_notes")
    .select("id, total_amount")
    .eq("organization_id", organizationId)
    .eq("status", "confirmed")
    .eq("delivery_date", isoDate);

  const typedNotes = (notes ?? []) as DeliveryNoteRow[];
  if (typedNotes.length === 0) {
    return { netProfit: 0, totalCost: 0, totalRevenue: 0 };
  }

  const noteIds = typedNotes.map((note) => note.id);
  const { data: items } = await supabase
    .from("delivery_note_items")
    .select(`
      delivery_note_id,
      quantity_delivered,
      product_sale_unit_id,
      order_items(cost_price)
    `)
    .in("delivery_note_id", noteIds);

  const typedItems = (items ?? []) as DeliveryNoteItemRow[];
  const saleUnitIds = [
    ...new Set(
      typedItems
        .map((item) => item.product_sale_unit_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  const { data: saleUnits } =
    saleUnitIds.length > 0
      ? await supabase
          .from("product_sale_units")
          .select("id, product_id, base_unit_quantity, cost_mode, fixed_cost_price")
          .in("id", saleUnitIds)
      : { data: [] };

  const typedSaleUnits = (saleUnits ?? []) as ProductSaleUnitRow[];
  const productIds = [...new Set(typedSaleUnits.map((unit) => unit.product_id))];
  const { data: products } =
    productIds.length > 0
      ? await supabase.from("products").select("id, cost_price").in("id", productIds)
      : { data: [] };

  const productCostById = new Map(
    ((products ?? []) as ProductRow[]).map((product) => [product.id, toNum(product.cost_price)]),
  );

  const saleUnitCostById = new Map(
    typedSaleUnits.map((unit) => {
      const productCost = productCostById.get(unit.product_id) ?? 0;
      const baseQuantity = toNum(unit.base_unit_quantity);
      const effectiveCost =
        unit.cost_mode === "fixed" && unit.fixed_cost_price != null
          ? toNum(unit.fixed_cost_price)
          : productCost * baseQuantity;

      return [unit.id, effectiveCost];
    }),
  );

  const totalRevenue = typedNotes.reduce((sum, note) => sum + toNum(note.total_amount), 0);
  const totalCost = typedItems.reduce((sum, item) => {
    const quantity = toNum(item.quantity_delivered);
    const orderItemCost = item.order_items ? toNum(item.order_items.cost_price) : null;
    const unitCost = (orderItemCost !== null && orderItemCost > 0)
      ? orderItemCost
      : (item.product_sale_unit_id
          ? (saleUnitCostById.get(item.product_sale_unit_id) ?? 0)
          : 0);

    return sum + unitCost * quantity;
  }, 0);

  return { netProfit: totalRevenue - totalCost, totalCost, totalRevenue };
}

// ─── Query ────────────────────────────────────────────────────────────────────

export async function getDashboardOverview(organizationId: string): Promise<DashboardOverview> {
  const supabase = getSupabaseAdmin();
  const today = getTodayInBangkok();
  const monthStart = firstOfMonth(today);

  const [
    todayOrdersRes,
    pendingDeliveryRes,
    monthDeliveredRes,
    activeCustomerRes,
    recentOrdersRes,
    stockDashboardRes,
    recentDailyPerformance,
    todayProfitSnapshot,
    pendingLineOrdersRes,
    lineSourceOrdersRes,
  ] = await Promise.all([
    // 1. Today's submitted/confirmed orders
    supabase.from("orders")
      .select("id, total_amount")
      .eq("organization_id", organizationId)
      .eq("order_date", today)
      .in("status", ["submitted", "confirmed"]),

    // 3. Pending delivery notes
    supabase.from("delivery_notes")
      .select("id, total_amount")
      .eq("organization_id", organizationId)
      .eq("status", "confirmed")
      .eq("dispatch_status", "pending"),

    // 3. This month's delivered amount
    supabase.from("delivery_notes")
      .select("total_amount")
      .eq("organization_id", organizationId)
      .eq("status", "confirmed")
      .eq("dispatch_status", "delivered")
      .gte("delivery_date", monthStart)
      .lte("delivery_date", today),

    // 4. Active customers
    supabase.from("customers")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("is_active", true),

    // 5. Recent 5 orders
    supabase.from("orders")
      .select("id, order_number, order_date, total_amount, status, customers!inner(name)")
      .eq("organization_id", organizationId)
      .in("status", ["submitted", "confirmed"])
      .order("created_at", { ascending: false })
      .limit(5),

    // 8. Stock dashboard data (for low stock count)
    getStockDashboardData(organizationId, 0, 0),

    // 9. Recent daily performance for dashboard report section
    getRecentDailyPerformance(organizationId, 7, today),

    // 10. Today's profit snapshot
    loadTodayNetProfit(organizationId, today),

    // 11. Today's LINE orders that still need a store link
    supabase.from("line_pending_orders")
      .select("id, converted_customer_id, converted_order_id, line_display_name, line_picture_url, created_at, status")
      .eq("organization_id", organizationId)
      .eq("order_date", today)
      .eq("status", "pending_link"),

    // 12. Today's customer orders that came from the LINE ordering page
    supabase.from("orders")
      .select("id, order_number, customer_id, created_at, metadata, customers!inner(name, line_user_id), order_items(unit_price)")
      .eq("organization_id", organizationId)
      .eq("order_date", today)
      .in("status", ["submitted", "confirmed"]),
  ]);
  const { netProfit: todayNetProfit, totalCost: todayCost, totalRevenue: todayDeliveryRevenue } = todayProfitSnapshot;

  // ── Process core KPIs ──────────────────────────────────────────────────────

  const todayOrders = (todayOrdersRes.data ?? []) as { id: string; total_amount: unknown }[];
  const pendingDeliveries = (pendingDeliveryRes.data ?? []) as { id: string; total_amount: unknown }[];
  const monthDelivered = (monthDeliveredRes.data ?? []) as { total_amount: unknown }[];
  const recentRaw = (recentOrdersRes.data ?? []) as {
    id: string;
    order_number: string;
    order_date: string;
    total_amount: unknown;
    status: string;
    customers: { name: string };
  }[];
  const lineOrderRows = (pendingLineOrdersRes.data ?? []) as LinePendingOrderDashboardRow[];
  const lineSourceOrderRows = ((lineSourceOrdersRes.data ?? []) as LineSourceOrderDashboardRow[])
    .filter((row) => {
      const metadata = row.metadata;
      const source =
        typeof metadata === "object" &&
        metadata !== null &&
        !Array.isArray(metadata) &&
        typeof metadata.source === "string"
          ? metadata.source
          : "";
      const hasLinkedLineCustomer = Boolean(row.customers?.line_user_id?.trim());
      return source === "line" || source === "line_pending" || hasLinkedLineCustomer;
    });

  const kpi: DashboardKpi = {
    todayOrderCount: todayOrders.length,
    todayOrderAmount: todayDeliveryRevenue,
    todayNetProfit,
    todayCost,
    submittedOrderCount: lineOrderRows.length + lineSourceOrderRows.length,
    pendingDeliveryCount: pendingDeliveries.length,
    pendingDeliveryAmount: pendingDeliveries.reduce((s, r) => s + toNum(r.total_amount), 0),
    monthDeliveredAmount: monthDelivered.reduce((s, r) => s + toNum(r.total_amount), 0),
    activeCustomerCount: toNum(activeCustomerRes.count),
    lowStockCount: stockDashboardRes.lowStockCount,
  };

  const recentOrders: RecentOrder[] = recentRaw.map((r) => ({
    id: r.id,
    orderNumber: r.order_number,
    orderDate: r.order_date,
    customerName: r.customers?.name ?? "—",
    totalAmount: toNum(r.total_amount),
    status: r.status as RecentOrder["status"],
  }));

  const dailyPerformanceRows: DashboardDailyPerformanceRow[] = recentDailyPerformance.rows.map((row) => ({
    isoDate: row.isoDate,
    monthLabel: row.monthLabel,
    revenue: row.revenue,
    cost: row.cost,
    profit: row.profit,
    orderCount: row.orderCount,
  }));

  const convertedCustomerIds = [
    ...new Set(
      lineOrderRows
        .map((row) => row.converted_customer_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const convertedOrderIds = [
    ...new Set(
      lineOrderRows
        .map((row) => row.converted_order_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const linkedCustomerIds = [
    ...new Set(lineSourceOrderRows.map((row) => row.customer_id).filter(Boolean)),
  ];
  const linkedLineUserIds = [
    ...new Set(
      lineSourceOrderRows
        .map((row) => row.customers?.line_user_id?.trim() ?? "")
        .filter(Boolean),
    ),
  ];

  const [
    { data: convertedCustomers },
    { data: convertedOrders },
    { data: lineProfilesByCustomer },
    { data: lineProfilesByUser },
  ] = await Promise.all([
    convertedCustomerIds.length > 0
      ? supabase
          .from("customers")
          .select("id, name")
          .eq("organization_id", organizationId)
          .in("id", convertedCustomerIds)
      : Promise.resolve({ data: [] }),
    convertedOrderIds.length > 0
      ? supabase
          .from("orders")
          .select("id, order_number")
          .eq("organization_id", organizationId)
          .in("id", convertedOrderIds)
      : Promise.resolve({ data: [] }),
    linkedCustomerIds.length > 0
      ? supabase
          .from("line_order_customers")
          .select("customer_id, line_user_id, line_display_name, line_picture_url")
          .eq("organization_id", organizationId)
          .in("customer_id", linkedCustomerIds)
      : Promise.resolve({ data: [] }),
    linkedLineUserIds.length > 0
      ? supabase
          .from("line_order_customers")
          .select("customer_id, line_user_id, line_display_name, line_picture_url")
          .eq("organization_id", organizationId)
          .in("line_user_id", linkedLineUserIds)
      : Promise.resolve({ data: [] }),
  ]);

  const customerNameById = new Map(
    ((convertedCustomers ?? []) as Array<{ id: string; name: string | null }>).map((customer) => [
      customer.id,
      customer.name,
    ]),
  );
  const orderNumberById = new Map(
    ((convertedOrders ?? []) as Array<{ id: string; order_number: string | null }>).map((order) => [
      order.id,
      order.order_number,
    ]),
  );
  const lineProfileByCustomerId = new Map<string, LineCustomerProfileDashboardRow>();
  const lineProfileByUserId = new Map<string, LineCustomerProfileDashboardRow>();
  for (const profile of [
    ...((lineProfilesByCustomer ?? []) as LineCustomerProfileDashboardRow[]),
    ...((lineProfilesByUser ?? []) as LineCustomerProfileDashboardRow[]),
  ]) {
    if (profile.customer_id) {
      lineProfileByCustomerId.set(profile.customer_id, profile);
    }
    if (profile.line_user_id?.trim()) {
      lineProfileByUserId.set(profile.line_user_id.trim(), profile);
    }
  }

  const pendingLineOrders = lineOrderRows.map((row) => ({
    id: row.id,
    orderNumber: row.converted_order_id ? (orderNumberById.get(row.converted_order_id) ?? null) : null,
    orderId: row.converted_order_id,
    lineDisplayName: row.line_display_name,
    linePictureUrl: row.line_picture_url,
    customerName: row.converted_customer_id ? (customerNameById.get(row.converted_customer_id) ?? null) : null,
    createdAt: row.created_at,
    status: "pending_link" as const,
  }));

  const linkedLineOrders = lineSourceOrderRows.map((row) => {
    const lineProfile =
      lineProfileByCustomerId.get(row.customer_id) ??
      lineProfileByUserId.get(row.customers?.line_user_id?.trim() ?? "");

    const hasUnpricedItems = row.order_items?.some(
      (item) => item.unit_price === null || item.unit_price === undefined || Number(item.unit_price) <= 0
    ) ?? false;

    return {
      id: row.id,
      orderNumber: row.order_number,
      orderId: row.id,
      lineDisplayName: lineProfile?.line_display_name ?? null,
      linePictureUrl: lineProfile?.line_picture_url ?? null,
      customerName: row.customers?.name ?? null,
      createdAt: row.created_at,
      status: "converted" as const,
      hasUnpricedItems,
    };
  });

  const lineOrders = [...pendingLineOrders, ...linkedLineOrders].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return {
    kpi,
    recentOrders,
    dailyPerformanceRows,
    dailyPerformanceRangeStartDate: recentDailyPerformance.rangeStartDate,
    dailyPerformanceRangeEndDate: recentDailyPerformance.rangeEndDate,
    stockProducts: stockDashboardRes.products,
    stockSuppliers: stockDashboardRes.suppliers,
    lineOrders,
  };
}
