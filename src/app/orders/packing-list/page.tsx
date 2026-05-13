import { requireAnyRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { PackingListLayout, type PackingListData, type PackingListVehicle, type PackingListStore } from "@/components/print/packing-list-layout";
import { AutoPrint, PackingListPrintButton } from "./preview/print-button";
import { Suspense } from "react";
import { PageLoader } from "@/components/page-loader";

export const metadata = { title: "ใบจัดของ" };

type Props = { searchParams: Promise<{ date?: string; endDate?: string; autoprint?: string }> };

type OrderWithRelations = {
  id: string;
  order_number: string;
  order_date: string;
  total_amount: number | string;
  metadata: unknown;
  status: string;
  customers: {
    id: string;
    name: string;
    customer_code: string;
    address: string;
    default_vehicle_id: string | null;
    vehicles: unknown;
  };
  delivery_notes: unknown;
  order_items: Array<{
    id: string;
    product_id: string;
    quantity: number | string;
    sale_unit_label: string;
    unit_price: number | string;
    line_total: number | string;
    products: {
      name: string;
      sku: string;
    };
  }>;
};

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
  const autoprint = params.autoprint === "1";
  const date = params.date ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
  const endDate = params.endDate || date;

  const admin = getSupabaseAdmin();
  const ordersQueryBase = admin
    .from("orders")
    .select(`
      id, order_number, order_date, total_amount, metadata, status,
      customers!inner(id, name, customer_code, address, default_vehicle_id, vehicles(id, name)),
      delivery_notes!order_id(vehicle_id, status, vehicles(id, name)),
      order_items(
        id, product_id, quantity, sale_unit_label, unit_price, line_total,
        products!inner(name, sku)
      )
    `)
    .eq("organization_id", session.organizationId)
    .neq("status", "cancelled");

  const filteredQuery = endDate && endDate !== date
    ? ordersQueryBase.gte("order_date", date).lte("order_date", endDate)
    : ordersQueryBase.eq("order_date", date);

  const [vehicleRows, ordersResult] = await Promise.all([
    admin
      .from("vehicles")
      .select("id, name")
      .eq("organization_id", session.organizationId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    filteredQuery.order("order_date", { ascending: true }).order("created_at", { ascending: true }),
  ]);

  const vehicles: PackingListVehicle[] = (vehicleRows.data ?? []).map(
    (v: { id: string; name: string }) => ({ id: v.id, name: v.name })
  );

  const rawOrders = (ordersResult.data ?? []) as OrderWithRelations[];
  const ordersByDate = new Map<string, OrderWithRelations[]>();
  
  for (const o of rawOrders) {
    const d = o.order_date;
    if (!ordersByDate.has(d)) ordersByDate.set(d, []);
    ordersByDate.get(d)!.push(o);
  }

  const allPackingData: PackingListData[] = Array.from(ordersByDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([d, dateOrders]) => {
      let dateLabel = d;
      try {
        dateLabel = new Intl.DateTimeFormat("th-TH", {
          day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok",
        }).format(new Date(d + "T00:00:00"));
      } catch {
        console.error("Invalid date for packing list:", d);
      }

      // Process orders for this specific date
      const groupMap = new Map<string, {
        customer: { id: string; name: string; customer_code: string; default_vehicle_id: string | null; vehicles: unknown };
        vehicleId: string | null;
        vehicleName: string | null;
        items: Map<string, number>;
      }>();

      for (const o of dateOrders) {
        const cust = o.customers;
        const dnArray = Array.isArray(o.delivery_notes) ? o.delivery_notes : (o.delivery_notes ? [o.delivery_notes] : []);
        const dns = dnArray.filter((dn: { status: string }) => dn.status !== "cancelled");
        const dn = dns.length > 0 ? dns[0] : null;

        const getVehName = (v: unknown) => {
          if (!v) return null;
          if (Array.isArray(v)) return (v[0] as { name: string })?.name ?? null;
          return (v as { name: string }).name ?? null;
        };

        const vId = (dn && (dn as { vehicle_id: string | null }).vehicle_id) ? (dn as { vehicle_id: string }).vehicle_id : cust.default_vehicle_id;
        const vName = (dn && (dn as { vehicle_id: string | null }).vehicle_id) ? getVehName((dn as { vehicles: unknown }).vehicles) : getVehName(cust.vehicles);
        const finalVehName = vName || (vId ? vehicles.find(v => v.id === vId)?.name : null) || null;
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
        const orderItems = (o.order_items as Array<{
          products: { sku: string; name: string };
          sale_unit_label: string;
          quantity: number;
        }>) ?? [];

        for (const item of orderItems) {
          const key = `${item.products.sku.trim().toLowerCase()}||${item.sale_unit_label.trim().toLowerCase()}`;
          const current = group.items.get(key) ?? 0;
          group.items.set(key, current + Number(item.quantity ?? 0));
        }
      }

      const stores = Array.from(groupMap.values()).sort((a, b) => {
        const idxA = a.vehicleId ? vehicles.map(v => v.id).indexOf(a.vehicleId) : 999;
        const idxB = b.vehicleId ? vehicles.map(v => v.id).indexOf(b.vehicleId) : 999;
        const vSort = (idxA === -1 ? 998 : idxA) - (idxB === -1 ? 998 : idxB);
        if (vSort !== 0) return vSort;
        return a.customer.customer_code.localeCompare(b.customer.customer_code);
      }).map(g => ({
        id: g.customer.customer_code,
        name: g.customer.name,
        vehicleId: g.vehicleId,
        vehicleName: g.vehicleName,
        consolidatedItems: g.items,
      }));

      const productMap = new Map<string, {
        sku: string;
        name: string;
        unit: string;
        total: number;
        byStore: Map<string, number>;
      }>();
      for (const s of stores) {
        for (const key of s.consolidatedItems.keys()) {
          if (!productMap.has(key)) {
            const orderItem = dateOrders
              .flatMap(o => (o.order_items as Array<{ products: { sku: string, name: string }, sale_unit_label: string }>) ?? [])
              .find(it => `${it.products.sku.trim().toLowerCase()}||${it.sale_unit_label.trim().toLowerCase()}` === key);
            if (orderItem) {
              productMap.set(key, {
                sku: orderItem.products.sku,
                name: orderItem.products.name,
                unit: orderItem.sale_unit_label,
                total: 0,
                byStore: new Map(),
              });
            }
          }
        }
      }

      const products = Array.from(productMap.entries())
        .map(([key, p]) => ({ 
          key, 
          sku: p.sku, 
          name: p.name, 
          unit: p.unit 
        }))
        .sort((a, b) => a.sku.localeCompare(b.sku) || a.name.localeCompare(b.name));

      const qty = products.map((product) =>
        stores.map((s) => s.consolidatedItems.get(product.key) ?? 0)
      );

      return {
        date: d,
        dateLabel,
        organizationName: "T&Y Noodle",
        stores,
        products,
        qty,
        vehicles,
      };
    });

  const totalStores = allPackingData.reduce((sum, d) => sum + d.stores.length, 0);
  const mainDateLabel = allPackingData.length > 1 
    ? `${allPackingData[0].dateLabel} - ${allPackingData[allPackingData.length - 1].dateLabel}`
    : (allPackingData[0]?.dateLabel ?? "");

  const unassignedStores = allPackingData.flatMap(d => 
    d.stores.filter((s: PackingListStore) => s.vehicleId === null).map((s: PackingListStore) => s.name)
  );

  return (
    <>
      {autoprint && <AutoPrint />}
      <div className="no-print" style={{
        display: "flex", gap: "12px", alignItems: "center",
        background: "white", padding: "12px 16px", borderRadius: "16px",
        boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
        position: "fixed", top: "12px", left: "50%", transform: "translateX(-50%)",
        zIndex: 100, fontFamily: "Sarabun, sans-serif",
        width: "max-content", maxWidth: "calc(100vw - 24px)",
        border: "1px solid rgba(0,0,0,0.05)",
      }}>
        <span style={{ fontSize: "14px", fontWeight: 800, color: "#003366" }}>
          ใบจัดของ
        </span>
        <span className="hidden sm:inline" style={{ fontSize: "12px", color: "#64748b", fontWeight: 500 }}>
          {mainDateLabel} · {totalStores} ร้าน
        </span>
        <PackingListPrintButton unassignedStores={unassignedStores} />
        <a href="/orders/incoming" style={{ 
          fontSize: "13px", fontWeight: 700, color: "#ef4444", 
          textDecoration: "none", marginLeft: "4px",
          padding: "6px 12px", borderRadius: "8px", background: "#fef2f2"
        }}>
          กลับ
        </a>
      </div>

      {allPackingData.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", paddingTop: "120px", fontFamily: "Sarabun, sans-serif" }}>
          <p style={{ fontSize: "18px", fontWeight: 600, color: "#64748b" }}>ไม่มีออเดอร์ในช่วงที่เลือก</p>
          <a href="/orders/incoming" style={{ marginTop: "8px", color: "#1e3a5f", fontSize: "14px" }}>กลับหน้าออเดอร์</a>
        </div>
      ) : (
        <div style={{ paddingTop: "60px" }}>
          {allPackingData.map(data => (
            <PackingListLayout key={data.date} data={data} />
          ))}
        </div>
      )}
    </>
  );
}
