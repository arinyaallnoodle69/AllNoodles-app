import { requireAppRole } from "@/lib/auth/authorization";
import {
  getAllDeliveryNotesPrintDataForDate,
  getMergedDeliveryPrintData,
  type DeliveryNotePrintData,
} from "@/lib/delivery/print";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { DeliveryNoteLayout } from "@/components/print/delivery-note-layout";
import { AutoPrint, PrintButton } from "./print-button";

export const metadata = { title: "ปริ้นใบส่งของ" };

type Props = { searchParams: Promise<{ date?: string; endDate?: string; customer?: string; customers?: string; autoprint?: string }> };

export default async function DeliveryBatchPrintPage({ searchParams }: Props) {
  const session = await requireAppRole("admin");
  const params = await searchParams;
  const date = params.date ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
  const endDate = params.endDate || date;
  const customerId = params.customer ?? null;
  const customerIds = (params.customers ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const autoprint = params.autoprint === "1";

  const formatDateSafe = (d: string | undefined | null, formatType: "long" | "short" = "long") => {
    if (!d || d === "null") return "";
    try {
      return new Intl.DateTimeFormat("th-TH", {
        day: "numeric",
        month: formatType === "long" ? "long" : "short",
        year: formatType === "long" ? "numeric" : "2-digit",
        timeZone: "Asia/Bangkok"
      }).format(new Date(d + "T00:00:00"));
    } catch {
      return d;
    }
  };

  const dateLabel = date === endDate
    ? formatDateSafe(date)
    : `${formatDateSafe(date, "short")} - ${formatDateSafe(endDate, "short")}`;

  let dns: DeliveryNotePrintData[] = [];
  const supabase = getSupabaseAdmin();

  // Optimized batch query based on src/lib/delivery/print.ts
  const query = supabase
    .from("delivery_notes")
    .select(`
      id, delivery_number, delivery_date, total_amount, notes, customer_id,
      customers!inner(id, name, customer_code, address, default_vehicle_id, vehicles(id, name)),
      organizations!inner(name, metadata),
      orders(order_number),
      delivery_note_items(
        id, quantity_delivered, unit_price, line_total,
        products!inner(name, sku, unit)
      )
    `)
    .eq("organization_id", session.organizationId)
    .gte("delivery_date", date)
    .lte("delivery_date", endDate)
    .in("status", ["confirmed", "submitted"])
    .order("delivery_date", { ascending: true })
    .order("created_at", { ascending: true });

  const isAllCustomers = customerIds.length === 1 && customerIds[0].toLowerCase() === "all";

  if (isAllCustomers) {
    // No filter on customer_id, fetch all in range
  } else if (customerIds.length > 0) {
    query.in("customer_id", customerIds);
  } else if (customerId) {
    query.eq("customer_id", customerId);
  }

  const { data: allRows } = await query;

  if (allRows && allRows.length > 0) {
    const groupMap = new Map<string, unknown[]>();
    for (const row of allRows) {
      const cId = row.customer_id;
      const key = `${cId}_${row.delivery_date}`;
      if (!groupMap.has(key)) groupMap.set(key, []);
      (groupMap.get(key) as unknown[]).push(row);
    }

    dns = Array.from(groupMap.values()).map((rowsRaw) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = rowsRaw as any[]; 
      const base = rows[0] as any;
      const org = base.organizations;
      const organizationMetadata = (org?.metadata as Record<string, unknown>) || {};
      const cust = base.customers;
      const ord = Array.isArray(base.orders) ? base.orders[0] : base.orders;
      
      const itemMap = new Map<string, {
        id: string;
        lineNumber: number;
        productSku: string;
        productName: string;
        quantityDelivered: number;
        saleUnitLabel: string;
        unitPrice: number;
        lineTotal: number;
      }>();

      for (const row of rows) {
        const items = Array.isArray(row.delivery_note_items) ? row.delivery_note_items : [];
        for (const item of items) {
          const prod = item.products;
          const sku = (prod?.sku || "").trim();
          const name = (prod?.name || "").trim();
          const unitLabel = (prod?.unit || "").trim();
          const key = `${sku.toLowerCase() || name.toLowerCase()}||${unitLabel.toLowerCase()}`;
          
          if (itemMap.has(key)) {
            const existing = itemMap.get(key)!;
            existing.quantityDelivered += (Number(item.quantity_delivered) || 0);
            existing.lineTotal += (Number(item.line_total) || 0);
          } else {
            itemMap.set(key, {
              id: item.id,
              lineNumber: 0,
              productSku: sku,
              productName: name,
              quantityDelivered: Number(item.quantity_delivered) || 0,
              saleUnitLabel: unitLabel,
              unitPrice: Number(item.unit_price) || 0,
              lineTotal: Number(item.line_total) || 0,
            });
          }
        }
      }

      const mergedItems = Array.from(itemMap.values());
      mergedItems.forEach((it, i) => { it.lineNumber = i + 1; });

      const totalAmount = rows.reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
      const deliveryNumber = rows.length > 1 ? `${base.delivery_number} +${rows.length - 1}` : base.delivery_number;
      const mergedNotes = rows.map(r => r.notes).filter(Boolean).join(" / ") || null;

      const getVehName = (v: any) => {
        if (!v) return null;
        if (Array.isArray(v)) return v[0]?.name ?? null;
        return (v as { name: string }).name ?? null;
      };

      return {
        deliveryNumber,
        deliveryDate: base.delivery_date,
        orderNumber: ord?.order_number || null,
        totalAmount,
        notes: mergedNotes,
        organization: {
          name: org?.name || "T&Y Noodle",
          logoUrl: (organizationMetadata?.logo_url as string) || null,
          address: (organizationMetadata?.address as string) || null,
          phone: (organizationMetadata?.phone as string) || null,
        },
        customer: {
          name: cust?.name || "Unknown",
          code: cust?.customer_code || "Unknown",
          address: cust?.address || "Unknown",
          vehicleId: cust?.default_vehicle_id || null,
          vehicleName: getVehName(cust?.vehicles),
        },
        items: mergedItems,
      };
    });
  }

  return (
    <>
      <style>{`
        @media print { .no-print { display: none !important; } }
        @media screen { body { background: #e5e7eb; } }
      `}</style>

      {autoprint && <AutoPrint />}

      <div className="no-print mb-6 flex items-center gap-3 px-4 pt-4">
        <PrintButton />
        <span className="text-sm font-semibold text-slate-700">
          {dns.length} {customerId ? "ใบ" : "ร้าน"} · {dateLabel}
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
          <p className="text-lg font-semibold text-slate-500">ไม่มีใบส่งของในวันที่เลือก</p>
          <p className="text-sm text-slate-400">{dateLabel}</p>
        </div>
      ) : (
        <DeliveryNoteLayout dns={dns} />
      )}
    </>
  );
}
