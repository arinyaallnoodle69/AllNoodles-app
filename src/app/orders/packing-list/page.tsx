import { requireAnyRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { PackingListLayout, type PackingListData, type PackingListVehicle, type PackingListStore } from "@/components/print/packing-list-layout";
import { PackingListPrintButton } from "./preview/print-button";
import { Suspense } from "react";
import { PageLoader } from "@/components/page-loader";

export const metadata = { title: "ใบจัดของ" };

type Props = { searchParams: Promise<{ date?: string }> };

export default async function PackingListWrapper({ searchParams }: Props) {
  return (
    <Suspense fallback={<PageLoader />}>
      <PackingListPage searchParams={searchParams} />
    </Suspense>
  );
}

async function PackingListPage({ searchParams }: Props) {
  const session = await requireAnyRole(["admin", "warehouse"]);
  const params = await searchParams;
  const date = params.date ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });

  const dateLabel = new Intl.DateTimeFormat("th-TH", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok",
  }).format(new Date(date + "T00:00:00"));

  const [vehicleRows, orders] = await Promise.all([
    getSupabaseAdmin()
      .from("vehicles")
      .select("id, name")
      .eq("organization_id", session.organizationId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    getSupabaseAdmin()
      .from("orders")
      .select(`
        id, order_number, total_amount, metadata, status,
        customers!inner(id, name, customer_code, address, default_vehicle_id, vehicles(id, name)),
        delivery_notes!order_id(vehicle_id, status, vehicles(id, name)),
        order_items(
          id, product_id, quantity, sale_unit_label, unit_price, line_total,
          products!inner(name, sku)
        )
      `)
      .eq("organization_id", session.organizationId)
      .eq("order_date", date)
      .neq("status", "cancelled")
      .order("created_at", { ascending: true }),
  ]);

  const vehicles: PackingListVehicle[] = (vehicleRows.data ?? []).map(
    (v: { id: string; name: string }) => ({ id: v.id, name: v.name })
  );

  // ─── Build matrix ──────────────────────────────────────────────────────────

  // Define local interfaces for type safety
  interface RawOrderItem {
    id: string;
    product_id: string;
    quantity: number | string;
    sale_unit_label: string;
    unit_price: number | string;
    line_total: number | string;
    products: { name: string; sku: string };
  }

  interface RawCustomer {
    id: string;
    name: string;
    customer_code: string;
    address: string;
    default_vehicle_id: string | null;
    vehicles: { id: string; name: string } | null;
  }

  interface RawOrder {
    id: string;
    order_number: string;
    status: string;
    total_amount: number | string;
    metadata: unknown;
    customers: unknown;
    delivery_notes?: { vehicle_id: string | null; status: string; vehicles: { name: string } | null } | { vehicle_id: string | null; status: string; vehicles: { name: string } | null }[];
    order_items: unknown;
  }

  const rawOrders = (orders.data ?? []) as unknown as RawOrder[];

  // 1. Group by vehicle + customer code to prevent merging stores that are split across vehicles
  const groupMap = new Map<string, {
    customer: RawCustomer;
    vehicleId: string | null;
    vehicleName: string | null;
    items: Map<string, number>;
  }>();

  for (const o of rawOrders) {
    const cust = o.customers as RawCustomer;
    const dnArray = Array.isArray(o.delivery_notes) ? o.delivery_notes : (o.delivery_notes ? [o.delivery_notes] : []);
    // Pick the most relevant delivery note (active over cancelled)
    const dns = dnArray.filter(dn => dn.status !== "cancelled");
    const dn = dns.length > 0 ? dns[0] : null;

    const getVehName = (v: unknown) => {
      if (!v) return null;
      if (Array.isArray(v)) return (v[0] as { name?: string })?.name ?? null;
      return (v as { name?: string }).name ?? null;
    };

    // Use vehicle from delivery note if present, otherwise customer's default
    const vId = (dn && dn.vehicle_id) ? dn.vehicle_id : cust.default_vehicle_id;
    const vName = (dn && dn.vehicle_id) ? getVehName(dn.vehicles) : getVehName(cust.vehicles);
    
    // Fallback: If we have an ID but no name from the join, try finding it in our vehicles list
    const finalVehName = vName || (vId ? vehicles.find(v => v.id === vId)?.name : null) || null;

    // UNIQUE KEY is critical: (Customer ID + Vehicle ID)
    const gKey = `${cust.id}_${vId ?? "none"}`;

    if (!groupMap.has(gKey)) {
      groupMap.set(gKey, {
        customer: cust,
        vehicleId: vId,
        vehicleName: finalVehName,
        items: new Map(),
      });
    }

    const group = groupMap.get(gKey)!;
    const items = o.order_items as RawOrderItem[];
    for (const item of items ?? []) {
      const key = `${item.products.sku.trim().toLowerCase()}||${item.sale_unit_label.trim().toLowerCase()}`;
      const current = group.items.get(key) ?? 0;
      group.items.set(key, current + Number(item.quantity ?? 0));
    }
  }

  // 2. Flatten into stores list for the Matrix, sorted by Vehicle Sort Order -> Vehicle Name -> Customer Code
  const stores: (PackingListStore & { consolidatedItems: Map<string, number> })[] = [];
  
  const vehicleSortOrder = vehicles.map(v => v.id);
  
  const sortedGroups = Array.from(groupMap.values()).sort((a, b) => {
    // 1. Sort by Vehicle
    const idxA = a.vehicleId ? vehicleSortOrder.indexOf(a.vehicleId) : 999;
    const idxB = b.vehicleId ? vehicleSortOrder.indexOf(b.vehicleId) : 999;
    
    // Vehicles in list first (idx 0..N), then unknown vehicles (998), then unassigned (999)
    const vSort = (idxA === -1 ? 998 : idxA) - (idxB === -1 ? 998 : idxB);
    if (vSort !== 0) return vSort;
    
    // If same vehicle ID (e.g. both null), sort by vehicle name just in case
    const nameSort = (a.vehicleName || "").localeCompare(b.vehicleName || "", "th");
    if (nameSort !== 0) return nameSort;

    // 2. Sort by Customer Code
    return a.customer.customer_code.localeCompare(b.customer.customer_code);
  });

  for (const g of sortedGroups) {
    stores.push({
      id: g.customer.customer_code,
      name: g.customer.name,
      vehicleId: g.vehicleId,
      vehicleName: g.vehicleName,
      consolidatedItems: g.items,
    });
  }

  // 3. Collect unique products from ALL consolidated stores
  const productMap = new Map<string, { sku: string; name: string; unit: string }>();
  for (const s of stores) {
    for (const key of s.consolidatedItems.keys()) {
      if (!productMap.has(key)) {
        const orderItem = rawOrders
          .flatMap(o => (o.order_items as RawOrderItem[]) ?? [])
          .find(it => `${it.products.sku.trim().toLowerCase()}||${it.sale_unit_label.trim().toLowerCase()}` === key);
        
        if (orderItem) {
          productMap.set(key, {
            sku: orderItem.products.sku,
            name: orderItem.products.name,
            unit: orderItem.sale_unit_label,
          });
        }
      }
    }
  }

  const products = Array.from(productMap.entries())
    .map(([key, p]) => ({ key, ...p }))
    .sort((a, b) => a.sku.localeCompare(b.sku) || a.name.localeCompare(b.name));

  // 4. Build qty matrix [productIdx][storeIdx]
  const qty: number[][] = products.map((product) =>
    stores.map((s) => s.consolidatedItems.get(product.key) ?? 0)
  );

  const unassignedStores = stores
    .filter((s) => s.vehicleId === null)
    .map((s) => s.name);

  const data: PackingListData = {
    date,
    dateLabel,
    organizationName: "T&Y Noodle",
    stores,
    products,
    qty,
    vehicles,
  };

  return (
    <>
      <div className="no-print" style={{
        display: "flex", gap: "12px", alignItems: "center",
        background: "white", padding: "10px 16px", borderRadius: "12px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
        position: "absolute", top: "16px", left: "50%", transform: "translateX(-50%)",
        zIndex: 50, fontFamily: "Sarabun, sans-serif",
      }}>
        <span style={{ fontSize: "13px", fontWeight: 700, color: "#1e3a5f" }}>
          ใบจัดของ
        </span>
        <span style={{ fontSize: "12px", color: "#64748b" }}>
          {dateLabel} · {stores.length} ร้าน · {products.length} รายการ
        </span>
        <PackingListPrintButton unassignedStores={unassignedStores} />
        <a href="/orders/incoming" style={{ fontSize: "13px", color: "#475569", textDecoration: "none" }}>
          กลับ
        </a>
      </div>

      {stores.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", paddingTop: "80px", fontFamily: "Sarabun, sans-serif" }}>
          <p style={{ fontSize: "18px", fontWeight: 600, color: "#64748b" }}>ไม่มีออเดอร์ในวันที่เลือก</p>
          <p style={{ fontSize: "14px", color: "#94a3b8" }}>{dateLabel}</p>
          <a href="/orders/incoming" style={{ marginTop: "8px", color: "#1e3a5f", fontSize: "14px" }}>กลับหน้าออเดอร์</a>
        </div>
      ) : (
        <div style={{ marginTop: "0" }}>
          <PackingListLayout data={data} />
        </div>
      )}
    </>
  );
}
