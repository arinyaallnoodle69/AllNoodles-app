import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SettingsShell } from "@/components/settings/settings-shell";
import { FreshReserveDashboard, type FreshReserveActivity, type FreshReserveRow } from "@/components/orders/fresh-reserve-dashboard";
import { requireAnyRole } from "@/lib/auth/authorization";
import { normalizeOrderDate } from "@/lib/orders/date";
import { getDailySpecialCatalog } from "@/lib/orders/daily-special-items";
import { FACTORY_ADJUSTMENT_SKUS, getDailyFactoryOrderAdjustments } from "@/lib/orders/factory-order-adjustments";
import { calculateFreshReserve } from "@/lib/orders/fresh-reserve-math";
import { getFactoryOrderSheetData } from "@/lib/orders/vehicle-product-summary";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const metadata = { title: "สำรองผลิตสดวันนี้" };

type ActivityRow = {
  product_id: string;
  quantity_in_base_unit: number;
  updated_at: string;
  orders: {
    warehouse_id: string | null;
    customers: { name: string; default_warehouse_id: string | null } | { name: string; default_warehouse_id: string | null }[] | null;
    delivery_notes: { warehouse_id: string | null; status: string; created_at: string }[];
  } | null;
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${date}T12:00:00+07:00`));
}

function formatTime(value: string | null) {
  if (!value) return "--:--";
  return new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" }).format(new Date(value));
}

export default async function FreshReservePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const session = await requireAnyRole(["admin", "member"]);
  const date = normalizeOrderDate((await searchParams).date);
  const [catalog, sheets, adjustments] = await Promise.all([
    getDailySpecialCatalog(session.organizationId),
    getFactoryOrderSheetData(session.organizationId, date, date, { applyAdjustments: false }),
    getDailyFactoryOrderAdjustments(session.organizationId, date),
  ]);

  const demandByProductId = new Map<string, number>();
  for (const sheet of sheets.filter((s) => s.warehouseName?.trim() === "คลังกรุงเทพ")) {
    sheet.products.forEach((product, index) => {
      const demand = (sheet.qty[index] ?? []).reduce((sum, quantity) => sum + Number(quantity ?? 0), 0);
      demandByProductId.set(product.id, (demandByProductId.get(product.id) ?? 0) + demand);
    });
  }

  const adjustmentByProductId = new Map(adjustments.map((adjustment) => [adjustment.productId, adjustment]));
  const rows: FreshReserveRow[] = catalog
    .filter((product) => FACTORY_ADJUSTMENT_SKUS.includes(product.sku.trim().toUpperCase() as typeof FACTORY_ADJUSTMENT_SKUS[number]))
    .sort((left, right) => FACTORY_ADJUSTMENT_SKUS.indexOf(left.sku.trim().toUpperCase() as typeof FACTORY_ADJUSTMENT_SKUS[number]) - FACTORY_ADJUSTMENT_SKUS.indexOf(right.sku.trim().toUpperCase() as typeof FACTORY_ADJUSTMENT_SKUS[number]))
    .map((product) => {
      const currentDemand = demandByProductId.get(product.id) ?? 0;
      const saved = adjustmentByProductId.get(product.id) ?? null;
      const reserve = calculateFreshReserve(saved, currentDemand);
      return {
        adjustedQuantity: saved?.adjustedQuantity ?? currentDemand,
        updatedAt: saved?.updatedAt ?? null,
        name: product.name,
        orderDemand: currentDemand,
        productId: product.id,
        remainingQuantity: saved?.remainingQuantity ?? 0,
        reserveQuantity: saved?.reserveQuantity ?? 0,
        sku: product.sku.trim().toUpperCase(),
        ...reserve,
        isConfigured: Boolean(saved),
      };
    });

  const updatedAtValues = adjustments.flatMap((item) => item.confirmedAt ? [item.confirmedAt] : []);
  const firstConfiguredAt = updatedAtValues.sort()[0] ?? null;
  let activities: FreshReserveActivity[] = [];
  if (firstConfiguredAt && rows.length) {
    const { data: warehouses, error: warehouseError } = await getSupabaseAdmin().from("warehouses")
      .select("id, name").eq("organization_id", session.organizationId);
    if (warehouseError) throw new Error("โหลดข้อมูลคลังไม่สำเร็จ");
    const bangkokId = warehouses?.find((warehouse) => warehouse.name.trim() === "คลังกรุงเทพ")?.id;
    const { data, error: activityError } = await getSupabaseAdmin()
      .from("order_items")
      .select("product_id, quantity_in_base_unit, updated_at, orders!inner(warehouse_id, customers(name, default_warehouse_id), delivery_notes!order_id(warehouse_id, status, created_at))")
      .eq("organization_id", session.organizationId)
      .eq("orders.order_date", date)
      .neq("orders.status", "cancelled")
      .in("product_id", rows.map((row) => row.productId))
      .gte("updated_at", firstConfiguredAt)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (activityError) throw new Error("โหลดรายการเปลี่ยนแปลงออเดอร์ไม่สำเร็จ");
    const skuById = new Map(rows.map((row) => [row.productId, row.sku]));
    activities = ((data ?? []) as unknown as ActivityRow[]).filter((item) => {
      const customer = Array.isArray(item.orders?.customers) ? item.orders.customers[0] : item.orders?.customers;
      const note = [...(item.orders?.delivery_notes ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)).find((entry) => entry.status !== "cancelled");
      const warehouseId = note?.warehouse_id ?? item.orders?.warehouse_id ?? customer?.default_warehouse_id;
      const confirmedAt = adjustmentByProductId.get(item.product_id)?.confirmedAt;
      return Boolean(bangkokId && warehouseId === bangkokId && confirmedAt && Date.parse(item.updated_at) >= Date.parse(confirmedAt));
    }).slice(0, 8).map((item) => {
      const customers = item.orders?.customers;
      return {
        customerName: (Array.isArray(customers) ? customers[0]?.name : customers?.name) ?? "ลูกค้า",
        quantity: Number(item.quantity_in_base_unit ?? 0),
        sku: skuById.get(item.product_id) ?? "สินค้า",
        time: formatTime(item.updated_at),
      };
    });
  }

  return (
    <SettingsShell title="สำรองผลิตสดวันนี้" floatingSubmit={false} fullWidthDesktop edgeToEdgeDesktop fullWidthMobile hideHeader>
      <Link
        href={`/orders/incoming?date=${date}`}
        aria-label="กลับหน้ารายการออเดอร์"
        className="sticky top-[68px] z-30 flex items-center gap-1.5 border-b border-[#E1E5EE] bg-white px-4 py-3 text-sm font-black text-[#4A148C] lg:hidden"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2.7} />
        กลับหน้ารายการออเดอร์
      </Link>
      <FreshReserveDashboard
        activities={activities}
        date={date}
        dateLabel={formatDate(date)}
        lastUpdatedLabel={formatTime(new Date().toISOString())}
        rows={rows}
      />
    </SettingsShell>
  );
}
