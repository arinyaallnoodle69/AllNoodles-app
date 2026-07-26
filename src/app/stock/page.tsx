import { requireAnyRole } from "@/lib/auth/authorization";
import { getStockDashboardData, getStockHistoryData } from "@/lib/stock/admin";
import { getStockIssueHistoryData } from "@/lib/stock/issues";
import { getActiveWarehouses } from "@/lib/warehouses";
import { UnifiedStockClient } from "@/components/settings/unified-stock-client";

export const metadata = {
  title: "จัดการสต็อก",
};

type SearchParams = Promise<{
  tab?: string;
  warehouse?: string;
  date?: string;
}>;

export default async function StockPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireAnyRole(["admin", "member"]);
  const params = await searchParams;
  const tab = params.tab || "stock";
  
  // Default to today's date in Thailand timezone if not provided
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
  const date = params.date || today;

  const [data, warehouses] = await Promise.all([
    getStockDashboardData(session.organizationId),
    getActiveWarehouses(session.organizationId),
  ]);

  const requestedWarehouseId = params.warehouse;
  const warehouseId =
    requestedWarehouseId && warehouses.some((warehouse) => warehouse.id === requestedWarehouseId)
      ? requestedWarehouseId
      : warehouses[0]?.id ?? "";

  const [initialHistory, initialIssues] = await Promise.all([
    tab === "history"
      ? getStockHistoryData(session.organizationId, 50, 0, warehouseId)
      : Promise.resolve(null),
    tab === "issues"
      ? getStockIssueHistoryData(session.organizationId, 50, 0, date, warehouseId)
      : Promise.resolve(null),
  ]);

  return (
    <>
      {data.setupHint ? (
        <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          {data.setupHint} กรุณารัน migration `202603161100_inventory_stock_receipts_and_movements.sql`
          ก่อนใช้งานหน้าสต็อก
        </div>
      ) : null}

      <UnifiedStockClient
        products={data.products}
        suppliers={data.suppliers}
        warehouses={warehouses}
        initialTab={tab as "stock" | "history" | "issues"}
        initialHistory={initialHistory}
        initialIssues={initialIssues}
        initialWarehouseId={warehouseId}
        initialDate={date}
        brands={data.brands}
      />
    </>
  );
}
