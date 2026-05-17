import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type ProfitSalesRow = {
  isoDate: string;
  orderCount: number;
  sales: number;
  cost: number;
  netProfit: number;
  marginPercent: number;
};

export type ProfitSalesSummary = {
  totalSales: number;
  totalCost: number;
  totalNetProfit: number;
  totalOrders: number;
  avgMarginPercent: number;
};

export type ProfitSalesReportData = {
  rows: ProfitSalesRow[];
  summary: ProfitSalesSummary;
};

type DeliveryNoteRow = {
  id: string;
  delivery_date: string;
  total_amount: number | string | null;
};

type DeliveryNoteItemRow = {
  delivery_note_id: string;
  quantity_delivered: number | string | null;
  product_sale_unit_id: string | null;
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

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function loadNoteCosts(noteIds: string[]) {
  if (noteIds.length === 0) return new Map<string, number>();

  const supabase = getSupabaseAdmin();
  const { data: items } = await supabase
    .from("delivery_note_items")
    .select("delivery_note_id, quantity_delivered, product_sale_unit_id")
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
    ((products ?? []) as ProductRow[]).map((product) => [product.id, toNumber(product.cost_price)]),
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

  const noteCostById = new Map<string, number>();
  for (const item of typedItems) {
    const quantity = toNumber(item.quantity_delivered);
    const unitCost = item.product_sale_unit_id
      ? (saleUnitCostById.get(item.product_sale_unit_id) ?? 0)
      : 0;
    noteCostById.set(
      item.delivery_note_id,
      (noteCostById.get(item.delivery_note_id) ?? 0) + unitCost * quantity,
    );
  }

  return noteCostById;
}

export async function getProfitSalesReport(params: {
  organizationId: string;
  fromDate: string;
  toDate: string;
  customerIds?: string[];
}): Promise<ProfitSalesReportData> {
  const { organizationId, fromDate, toDate, customerIds = [] } = params;
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("delivery_notes")
    .select("id, delivery_date, total_amount")
    .eq("organization_id", organizationId)
    .eq("status", "confirmed")
    .gte("delivery_date", fromDate)
    .lte("delivery_date", toDate)
    .order("delivery_date", { ascending: true });

  if (customerIds.length > 0) {
    query = query.in("customer_id", customerIds);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const notes = (data ?? []) as DeliveryNoteRow[];
  const noteCostById = notes.length > 0 ? await loadNoteCosts(notes.map((note) => note.id)) : new Map<string, number>();
  const buckets = new Map<string, { sales: number; cost: number; orderCount: number }>();

  for (const note of notes) {
    const bucket = buckets.get(note.delivery_date) ?? { sales: 0, cost: 0, orderCount: 0 };
    bucket.sales += toNumber(note.total_amount);
    bucket.cost += noteCostById.get(note.id) ?? 0;
    bucket.orderCount += 1;
    buckets.set(note.delivery_date, bucket);
  }

  const rows: ProfitSalesRow[] = [];
  const currentDate = new Date(fromDate + "T00:00:00Z");
  const lastDate = new Date(toDate + "T00:00:00Z");

  while (currentDate <= lastDate) {
    const isoDate = currentDate.toISOString().slice(0, 10);
    const bucket = buckets.get(isoDate) ?? { sales: 0, cost: 0, orderCount: 0 };
    const netProfit = bucket.sales - bucket.cost;
    rows.push({
      isoDate,
      orderCount: bucket.orderCount,
      sales: bucket.sales,
      cost: bucket.cost,
      netProfit,
      marginPercent: bucket.sales > 0 ? (netProfit / bucket.sales) * 100 : 0,
    });
    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
  }

  const summary = rows.reduce<ProfitSalesSummary>(
    (acc, row) => {
      acc.totalSales += row.sales;
      acc.totalCost += row.cost;
      acc.totalNetProfit += row.netProfit;
      acc.totalOrders += row.orderCount;
      return acc;
    },
    {
      totalSales: 0,
      totalCost: 0,
      totalNetProfit: 0,
      totalOrders: 0,
      avgMarginPercent: 0,
    },
  );
  summary.avgMarginPercent =
    summary.totalSales > 0 ? (summary.totalNetProfit / summary.totalSales) * 100 : 0;

  return {
    rows,
    summary,
  };
}
