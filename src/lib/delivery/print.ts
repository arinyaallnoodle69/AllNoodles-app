import { PRINT_ORGANIZATION_NAME } from "@/components/print/print-shared";
import { sortDeliveryPrintDataByCustomerOrder } from "@/lib/delivery/print-ordering";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type DeliveryNotePrintData = {
  deliveryNumber: string;
  deliveryDate: string;
  createdAt?: string | null;
  orderNumber: string | null;
  warehouseName: string | null;
  totalAmount: number;
  notes: string | null;
  organization: {
    name: string;
    logoUrl: string | null;
    address: string | null;
    phone: string | null;
  };
  customer: {
    name: string;
    code: string;
    address: string;
    vehicleId: string | null;
    vehicleName: string | null;
  };
  items: Array<{
    id: string;
    lineNumber: number;
    productSku: string;
    productName: string;
    quantityDelivered: number;
    saleUnitLabel: string;
    unitPrice: number;
    lineTotal: number;
    display_order?: number | null;
  }>;
};

const skuCollator = new Intl.Collator("th", {
  numeric: true,
  sensitivity: "base",
});

export function sortDeliveryItems<T extends { productSku: string; productName: string; display_order?: number | null }>(
  items: T[]
): T[] {
  return [...items].sort((left, right) => {
    const orderA = left.display_order ?? 0;
    const orderB = right.display_order ?? 0;
    if (orderA !== orderB) return orderA - orderB;

    const skuComparison = skuCollator.compare(left.productSku, right.productSku);
    if (skuComparison !== 0) return skuComparison;

    return left.productName.localeCompare(right.productName, "th");
  });
}

/** One merged document per store for all DNs on a given date. */
export async function getAllDeliveryNotesPrintDataForDate(
  organizationId: string,
  date: string,
): Promise<DeliveryNotePrintData[]> {
  const supabase = getSupabaseAdmin();

  // Fetch all DN ids for the date, ordered by customer then created_at
  const { data: dns } = await supabase
    .from("delivery_notes")
    .select("id, customer_id")
    .eq("organization_id", organizationId)
    .eq("delivery_date", date)
    .in("status", ["confirmed", "submitted"])
    .order("customer_id", { ascending: true })
    .order("created_at", { ascending: true });

  if (!dns || (dns as { id: string; customer_id: string }[]).length === 0) return [];

  // Group DN ids by customer
  const byCustomer = new Map<string, string[]>();
  for (const dn of dns as { id: string; customer_id: string }[]) {
    const arr = byCustomer.get(dn.customer_id) ?? [];
    arr.push(dn.id);
    byCustomer.set(dn.customer_id, arr);
  }

  const results = await Promise.all(
    Array.from(byCustomer.values()).map((ids) =>
      getMergedDeliveryPrintData(organizationId, ids),
    ),
  );

  return sortDeliveryPrintDataByCustomerOrder(
    results.filter((r): r is DeliveryNotePrintData => r !== null),
  );
}

/** Merge all delivery notes (by ids) into a single printable document. */
export async function getMergedDeliveryPrintData(
  organizationId: string,
  deliveryNoteIds: string[],
): Promise<DeliveryNotePrintData | null> {
  if (deliveryNoteIds.length === 0) return null;

  // Fetch all DNs in parallel
  const parts = await Promise.all(
    deliveryNoteIds.map((id) => getDeliveryNotePrintData(organizationId, id)),
  );
  const valid = parts.filter((p): p is DeliveryNotePrintData => p !== null);
  if (valid.length === 0) return null;

  // Merge: first DN metadata, sum amounts, concatenate items & notes
  const base = valid[0];

  // Merge items with same product SKU + sale unit — sum qty and line total
  const itemMap = new Map<string, DeliveryNotePrintData["items"][0]>();
  for (const item of valid.flatMap((p) => p.items)) {
    const normalizedSku = item.productSku.trim().toLowerCase();
    const normalizedUnit = item.saleUnitLabel.trim().toLowerCase();
    const normalizedName = item.productName.trim().toLowerCase();
    const key = `${normalizedSku || normalizedName}||${normalizedUnit}`;
    const existing = itemMap.get(key);
    if (existing) {
      existing.quantityDelivered += item.quantityDelivered;
      existing.lineTotal += item.lineTotal;
      existing.unitPrice =
        existing.quantityDelivered > 0 ? existing.lineTotal / existing.quantityDelivered : existing.unitPrice;
    } else {
      itemMap.set(key, { ...item });
    }
  }
  const mergedItems = sortDeliveryItems(Array.from(itemMap.values()));
  // Re-number lines sequentially
  mergedItems.forEach((item, i) => { item.lineNumber = i + 1; });

  const mergedNotes = valid
    .map((p) => p.notes)
    .filter(Boolean)
    .join(" / ") || null;

  const totalAmount = valid.reduce((s, p) => s + p.totalAmount, 0);

  // Delivery number: first one (or "DN-001 + 1 more")
  const deliveryNumber =
    valid.length > 1
      ? `${base.deliveryNumber} +${valid.length - 1}`
      : base.deliveryNumber;

  return {
    ...base,
    deliveryNumber,
    totalAmount,
    notes: mergedNotes,
    items: mergedItems,
  };
}

export async function getDeliveryNotePrintData(
  organizationId: string,
  deliveryNoteId: string,
): Promise<DeliveryNotePrintData | null> {
  const supabase = getSupabaseAdmin();
  const headerSelect = `
      id, delivery_number, delivery_date, total_amount, notes, created_at, vehicle_id, vehicles(id, name),
      customers!inner(name, customer_code, address, default_vehicle_id, vehicles(id, name)),
      organizations!inner(name, metadata),
      orders(order_number, warehouse_id, assigned_vehicle_id, assigned_vehicle:assigned_vehicle_id(id, name), warehouses:warehouse_id(name))
    `;

  const fetchHeaderBy = async (field: "id" | "delivery_number") =>
    supabase.from("delivery_notes")
      .select(headerSelect)
      .eq(field, deliveryNoteId)
      .eq("organization_id", organizationId)
      .maybeSingle();

  // 1. DN header + customer + org
  const { data: dnById, error: dnByIdError } = await fetchHeaderBy("id");
  let dn = dnById;
  let dnError = dnByIdError;

  if (!dn) {
    const { data: dnByNumber, error: dnByNumberError } = await fetchHeaderBy("delivery_number");
    dn = dnByNumber;
    dnError = dnByNumberError;
  }

  if (dnError || !dn) return null;

  const header = dn as unknown as {
    created_at: string | null;
    customers: {
      address: string | null;
      customer_code: string;
      default_vehicle_id: string | null;
      name: string;
      vehicles: { id: string; name: string } | { id: string; name: string }[] | null;
    };
    delivery_date: string;
    delivery_number: string;
    id: string;
    notes: string | null;
    orders: {
      assigned_vehicle?: { id: string; name: string } | { id: string; name: string }[] | null;
      assigned_vehicle_id?: string | null;
      order_number: string | null;
      warehouses: { name: string } | null;
    } | Array<{
      assigned_vehicle?: { id: string; name: string } | { id: string; name: string }[] | null;
      assigned_vehicle_id?: string | null;
      order_number: string | null;
      warehouses: { name: string } | null;
    }> | null;
    organizations: { metadata: unknown };
    total_amount: number | string | null;
    vehicle_id: string | null;
    vehicles: { id: string; name: string } | { id: string; name: string }[] | null;
  };
  const relatedOrder = Array.isArray(header.orders) ? header.orders[0] : header.orders;
  const assignedOrder = relatedOrder as unknown as {
    assigned_vehicle_id?: string | null;
    assigned_vehicle?: { id: string; name: string } | { id: string; name: string }[] | null;
  } | null;
  const relationName = (
    relation: { id: string; name: string } | { id: string; name: string }[] | null | undefined,
  ) => Array.isArray(relation) ? relation[0]?.name ?? null : relation?.name ?? null;

  // 2. DN items with product details
  const { data: items, error: itemsError } = await supabase
    .from("delivery_note_items")
    .select(`
      id, quantity_delivered, sale_unit_label, unit_price, line_total,
      products!inner(name, sku, unit, display_order)
    `)
    .eq("delivery_note_id", header.id)
    .eq("organization_id", organizationId);

  if (itemsError || !items) return null;

  type RawItem = {
    id: string;
    quantity_delivered: number | string;
    sale_unit_label: string;
    unit_price: number | string;
    line_total: number | string;
    products: { name: string; sku: string; unit: string; display_order: number | null; };
  };

  const toNum = (v: number | string | null | undefined) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  };

  const meta =
    typeof header.organizations?.metadata === "object" && header.organizations.metadata !== null
      ? (header.organizations.metadata as Record<string, unknown>)
      : {} as Record<string, unknown>;

  const logoUrl = (meta.logo_url as string) ?? null;
  const orgAddress = (meta.address as string) ?? null;
  const orgPhone = (meta.phone as string) ?? null;

  return {
    deliveryNumber: header.delivery_number,
    deliveryDate: header.delivery_date,
    createdAt: header.created_at,
    orderNumber: relatedOrder?.order_number ?? null,
    warehouseName: relatedOrder?.warehouses?.name ?? null,
    totalAmount: toNum(header.total_amount),
    notes: header.notes ?? null,
    organization: {
      name: PRINT_ORGANIZATION_NAME,
      logoUrl,
      address: orgAddress,
      phone: orgPhone,
    },
    customer: {
      name: header.customers.name,
      code: header.customers.customer_code,
      address: header.customers.address ?? "-",
      vehicleId:
        header.vehicle_id ??
        assignedOrder?.assigned_vehicle_id ??
        header.customers.default_vehicle_id ??
        null,
      vehicleName:
        relationName(header.vehicles) ??
        relationName(assignedOrder?.assigned_vehicle) ??
        relationName(header.customers.vehicles),
    },
    items: sortDeliveryItems(
      (items as RawItem[]).map((item) => ({
        id: item.id,
        lineNumber: 0,
        productSku: item.products.sku,
        productName: item.products.name,
        quantityDelivered: toNum(item.quantity_delivered),
        saleUnitLabel: item.products.unit,
        unitPrice: toNum(item.unit_price),
        lineTotal: toNum(item.line_total),
        display_order: item.products.display_order,
      }))
    ).map((item, idx) => ({
      ...item,
      lineNumber: idx + 1,
    })),
  };
}
