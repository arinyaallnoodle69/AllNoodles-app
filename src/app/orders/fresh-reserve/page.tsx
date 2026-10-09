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

  const { data, error: activityError } = await getSupabaseAdmin()
    .from("fresh_reserve_activity")
    .select("customer_name,product_id,before_quantity,after_quantity,demand_change,reserve_change,available_after,reason,updated_at")
    .eq("organization_id", session.organizationId).eq("order_date", date)
    .order("updated_at", { ascending: false }).limit(8);
  if (activityError) throw new Error("โหลดประวัติการใช้สำรองไม่สำเร็จ");
  const productById = new Map(rows.map((row) => [row.productId, row]));
  const activities: FreshReserveActivity[] = (data ?? []).map((item) => ({
    customerName: item.customer_name,
    productName: productById.get(item.product_id)?.name ?? "สินค้า",
    beforeQuantity: item.before_quantity,
    afterQuantity: item.after_quantity,
    demandChange: item.demand_change,
    reserveChange: item.reserve_change,
    remaining: item.available_after,
    reason: item.reason,
    time: formatTime(item.updated_at),
  }));

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
