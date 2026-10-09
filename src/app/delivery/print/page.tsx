import { getDeliveryExportVersions, assertDeliveryExportVersions, createDeliveryExportToken } from "@/lib/delivery/export-consistency";
import { requireAnyRole } from "@/lib/auth/authorization";
import { type DeliveryNotePrintData, sortDeliveryItems } from "@/lib/delivery/print";
import { sortDeliveryPrintRowsByCustomerOrder } from "@/lib/delivery/print-ordering";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DeliveryNoteLayout } from "@/components/print/delivery-note-layout";
import { PRINT_ORGANIZATION_NAME } from "@/components/print/print-shared";
import { ShareDeliveryPdfButton } from "@/components/print/share-delivery-pdf-button";
import { BatchDeliveryNotesImageButton } from "@/components/print/batch-delivery-notes-image-button";
import { AutoPrint, PrintButton } from "./print-button";

export const metadata = { title: "ปริ้นบิลส่งของ" };

type Props = {
  searchParams: Promise<{
    date?: string;
    endDate?: string;
    customer?: string;
    customers?: string;
    note_ids?: string;
    autoprint?: string;
    autosave?: string;
    show_amount?: string;
    price_mode?: string;
  }>;
};

type RawDeliveryPrintRow = {
  created_at: string | null;
  id: string;
  delivery_number: string;
  delivery_date: string;
  total_amount: number | string | null;
  notes: string | null;
  previous_outstanding: number | string | null;
  installment_paid: number | string | null;
  remaining_outstanding: number | string | null;
  is_installment_plan: boolean | null;
  customer_id: string;
  warehouse_id: string | null;
  vehicle_id: string | null;
  vehicles: { id: string; name: string } | { id: string; name: string }[] | null;
  customers: {
    id: string;
    name: string;
    customer_code: string;
    address: string | null;
    default_vehicle_id: string | null;
    vehicles: { id: string; name: string } | { id: string; name: string }[] | null;
  };
  organizations: {
    name: string | null;
    metadata: Record<string, unknown> | null;
  };
  orders:
    | {
        assigned_vehicle_id: string | null;
        assigned_vehicle: { id: string; name: string } | { id: string; name: string }[] | null;
        order_number: string | null;
        warehouses: { name: string | null } | null;
      }
    | {
        assigned_vehicle_id: string | null;
        assigned_vehicle: { id: string; name: string } | { id: string; name: string }[] | null;
        order_number: string | null;
        warehouses: { name: string | null } | null;
      }[]
    | null;
  delivery_note_items: {
    id: string;
    sale_unit_label: string;
    order_items: { is_replacement: boolean } | null;
    quantity_delivered: number | string | null;
    unit_price: number | string | null;
    line_total: number | string | null;
    products: {
      name: string;
      sku: string;
      unit: string;
      display_order?: number | null;
    };
  }[];
};

function toNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatDateSafe(value: string | undefined | null, formatType: "long" | "short" = "long") {
  if (!value || value === "null") return "";
  try {
    return new Intl.DateTimeFormat("th-TH", {
      day: "numeric",
      month: formatType === "long" ? "long" : "short",
      year: formatType === "long" ? "numeric" : "2-digit",
      timeZone: "Asia/Bangkok",
    }).format(new Date(`${value}T00:00:00`));
  } catch {
    return value;
  }
}

function getVehicleName(vehicle: RawDeliveryPrintRow["customers"]["vehicles"]) {
  if (!vehicle) return null;
  if (Array.isArray(vehicle)) return vehicle[0]?.name ?? null;
  return vehicle.name ?? null;
}

function getOrderNumber(order: RawDeliveryPrintRow["orders"]) {
  if (!order) return null;
  if (Array.isArray(order)) return order[0]?.order_number ?? null;
  return order.order_number ?? null;
}

function getWarehouseName(order: RawDeliveryPrintRow["orders"]) {
  if (!order) return null;
  if (Array.isArray(order)) return order[0]?.warehouses?.name ?? null;
  return order.warehouses?.name ?? null;
}

function getOrderVehicle(order: RawDeliveryPrintRow["orders"]) {
  const resolvedOrder = Array.isArray(order) ? order[0] : order;
  return {
    id: resolvedOrder?.assigned_vehicle_id ?? null,
    name: getVehicleName(resolvedOrder?.assigned_vehicle ?? null),
  };
}

function buildPrintData(rows: RawDeliveryPrintRow[]): DeliveryNotePrintData[] {
  const groupMap = new Map<string, RawDeliveryPrintRow[]>();

  for (const row of rows) {
    const key = `${row.customer_id}_${row.delivery_date}_${row.warehouse_id}`;
    const bucket = groupMap.get(key) ?? [];
    bucket.push(row);
    groupMap.set(key, bucket);
  }

  return Array.from(groupMap.values()).map((groupRows) => {
    const base = groupRows[0];
    const orderVehicle = getOrderVehicle(base.orders);
    const vehicleId = base.vehicle_id ?? orderVehicle.id ?? base.customers.default_vehicle_id;
    const vehicleName =
      getVehicleName(base.vehicles) ??
      orderVehicle.name ??
      getVehicleName(base.customers.vehicles);
    const organizationMetadata = base.organizations.metadata ?? {};
    const itemMap = new Map<
      string,
      {
        id: string;
        lineNumber: number;
        productSku: string;
        productName: string;
        quantityDelivered: number;
        saleUnitLabel: string;
        unitPrice: number;
        lineTotal: number;
        isReplacement?: boolean;
        display_order?: number | null;
      }
    >();

    for (const row of groupRows) {
      for (const item of row.delivery_note_items ?? []) {
        const sku = item.products.sku.trim();
        const name = item.products.name.trim();
        const unitLabel = item.sale_unit_label.trim();
        const isReplacement = item.order_items?.is_replacement === true;
        const key = `${sku.toLowerCase() || name.toLowerCase()}||${unitLabel.toLowerCase()}||${isReplacement}`;

        if (itemMap.has(key)) {
          const existing = itemMap.get(key)!;
          existing.quantityDelivered += toNumber(item.quantity_delivered);
          existing.lineTotal += toNumber(item.line_total);
          existing.unitPrice = existing.lineTotal / existing.quantityDelivered;
          continue;
        }

        itemMap.set(key, {
          id: item.id,
          lineNumber: 0,
          productSku: sku,
          productName: name,
          isReplacement,
          quantityDelivered: toNumber(item.quantity_delivered),
          saleUnitLabel: unitLabel,
          unitPrice: toNumber(item.unit_price),
          lineTotal: toNumber(item.line_total),
          display_order: item.products.display_order,
        });
      }
    }

    const items = sortDeliveryItems(Array.from(itemMap.values()));
    items.forEach((item, index) => {
      item.lineNumber = index + 1;
    });

    const totalAmount = groupRows.reduce((sum, row) => sum + toNumber(row.total_amount), 0);
    const deliveryNumber =
      groupRows.length > 1
        ? `${base.delivery_number} +${groupRows.length - 1}`
        : base.delivery_number;
    const notes = groupRows.map((row) => row.notes).filter(Boolean).join(" / ") || null;

    return {
      deliveryNumber,
      deliveryDate: base.delivery_date,
      createdAt: base.created_at,
      orderNumber: getOrderNumber(base.orders),
      warehouseName: getWarehouseName(base.orders),
      totalAmount,
      notes,
      previousOutstanding: toNumber(base.previous_outstanding),
      installmentPaid: toNumber(base.installment_paid),
      remainingOutstanding: toNumber(base.remaining_outstanding),
      isInstallmentPlan: !!base.is_installment_plan,
      organization: {
        name: PRINT_ORGANIZATION_NAME,
        logoUrl: (organizationMetadata.logo_url as string) || null,
        address: (organizationMetadata.address as string) || null,
        phone: (organizationMetadata.phone as string) || null,
      },
      customer: {
        name: base.customers.name || "Unknown",
        code: base.customers.customer_code || "Unknown",
        address: base.customers.address || "Unknown",
        vehicleId,
        vehicleName,
      },
      items,
    } satisfies DeliveryNotePrintData;
  });
}

export default async function DeliveryBatchPrintPage({ searchParams }: Props) {
  const session = await requireAnyRole(["admin", "member", "warehouse"]);
  const supabase = getSupabaseAdmin();
  
  // Load the current logo_url from organization metadata
  const { data: organization } = await supabase
    .from("organizations")
    .select("metadata")
    .eq("id", session.organizationId)
    .single();

  const organizationMetadata = (organization?.metadata as Record<string, unknown>) || {};
  const dbLogoUrl = (organizationMetadata.logo_url as string) || null;

  let logoDataUrl = dbLogoUrl || "";
  if (!logoDataUrl) {
    try {
      const fileBuffer = await readFile(join(process.cwd(), "public", "brand", "512x512.png"));
      logoDataUrl = `data:image/png;base64,${fileBuffer.toString("base64")}`;
    } catch (e) {
      console.error("Failed to load logo on server:", e);
    }
  }
  const params = await searchParams;
  const date = params.date ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
  const endDate = params.endDate || date;
  const customerId = params.customer ?? null;
  const customerIds = (params.customers ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const noteIds = (params.note_ids ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const autoprint = params.autoprint === "1";
  const autosave = params.autosave === "1";
  const priceModeParam = params.price_mode;
  let priceMode: "all" | "total_only" | "none" = "all";
  if (priceModeParam === "all" || priceModeParam === "total_only" || priceModeParam === "none") {
    priceMode = priceModeParam;
  } else if (params.show_amount === "0") {
    priceMode = "total_only";
  } else if (params.show_amount === "none") {
    priceMode = "none";
  }

  const dateLabel =
    date === endDate
      ? formatDateSafe(date)
      : `${formatDateSafe(date, "short")} - ${formatDateSafe(endDate, "short")}`;


  let query = supabase
    .from("delivery_notes")
    .select(`
      id, delivery_number, delivery_date, total_amount, notes, customer_id, warehouse_id, created_at, vehicle_id, vehicles(id, name),
      previous_outstanding, installment_paid, remaining_outstanding, is_installment_plan,
      customers!inner(id, name, customer_code, address, default_vehicle_id, vehicles(id, name)),
      organizations!inner(name, metadata),
      orders(order_number, assigned_vehicle_id, assigned_vehicle:assigned_vehicle_id(id, name), warehouses:warehouse_id(name)),
      delivery_note_items(
        id, quantity_delivered, sale_unit_label, unit_price, line_total, order_items(is_replacement),
        products!inner(name, sku, unit, display_order)
      )
    `)
    .eq("organization_id", session.organizationId)
    .in("status", ["confirmed", "submitted"]);

  if (noteIds.length > 0) {
    query = query.in("id", noteIds);
  } else {
    query = query.gte("delivery_date", date).lte("delivery_date", endDate);
    const isAllCustomers = customerIds.length === 1 && customerIds[0].toLowerCase() === "all";
    if (isAllCustomers) {
      // Keep legacy behavior for the explicit all mode.
    } else if (customerIds.length > 0) {
      query = query.in("customer_id", customerIds);
    } else if (customerId) {
      query = query.eq("customer_id", customerId);
    }
  }

  const before = await getDeliveryExportVersions(session.organizationId, noteIds.length ? noteIds : undefined);
  const { data: rows, error: printError } = await query
    .order("delivery_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (printError) throw new Error("โหลดบิลไม่สำเร็จ: " + printError.message);
  const ids = (rows ?? []).map((row) => row.id);
  if (noteIds.length && noteIds.some((id) => !ids.includes(id))) throw new Error("โหลดบิลที่เลือกไม่ครบ กรุณาโหลดข้อมูลใหม่");
  const current = ids.length ? await getDeliveryExportVersions(session.organizationId, ids) : [];
  if (ids.length) assertDeliveryExportVersions(before, current, ids);
  const sortedRows = rows && rows.length > 0
    ? sortDeliveryPrintRowsByCustomerOrder(rows as unknown as RawDeliveryPrintRow[])
    : [];
  const dns = sortedRows.length > 0 ? buildPrintData(sortedRows) : [];
  const exportTokens = ids.length ? [createDeliveryExportToken(session.organizationId, current)] : [];
  dns.forEach((dn) => { dn.exportTokens = exportTokens; });

  return (
    <>
      <style>{`
        @media print { .no-print { display: none !important; } }
        @media screen { body { background: #e5e7eb; } }
      `}</style>

      {autoprint && <AutoPrint />}

      <div className="no-print mb-6 flex flex-wrap items-center gap-3 px-4 pt-4">
        <PrintButton />
        <BatchDeliveryNotesImageButton autoStart={autosave} datePrefix={date} />
        <ShareDeliveryPdfButton fileName={`delivery-notes-${date}-to-${endDate}`} />
        <span className="text-sm font-semibold text-slate-700">
          {dns.length} {customerId || noteIds.length > 0 ? "ใบ" : "ร้าน"} · {dateLabel}
        </span>
        <a
          href="/delivery"
          className="ml-auto rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          กลับ
        </a>
      </div>

      {dns.length === 0 ? (
        <div className="no-print flex flex-col items-center gap-3 py-24 text-center">
          <p className="text-lg font-semibold text-slate-500">ไม่มีบิลส่งของในรายการที่เลือก</p>
          <p className="text-sm text-slate-400">{dateLabel}</p>
        </div>
      ) : (
        <DeliveryNoteLayout dns={dns} logoDataUrl={logoDataUrl} priceMode={priceMode} />
      )}
    </>
  );
}
