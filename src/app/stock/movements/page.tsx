import { StockMobileReceiveButton } from "@/components/settings/stock-list";
import { StockReceiveForm } from "@/components/settings/stock-receive-form";
import { StockTabs } from "@/components/settings/stock-tabs";
import { DailyStockReportClient } from "@/components/settings/daily-stock-report-client";
import { requireAnyRole } from "@/lib/auth/authorization";
import { getStockDashboardData } from "@/lib/stock/admin";
import { getDailyMovementReport } from "@/lib/stock/daily-movement-data";
import { getActiveWarehouses } from "@/lib/warehouses";
import { Box, CalendarDays } from "lucide-react";

export const metadata = { title: "รายงานความเคลื่อนไหวสินค้า" };

type Params = { from?: string; to?: string; warehouse?: string; product?: string; receive?: string };

function todayInBangkok() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Bangkok",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function validDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export default async function StockMovementsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await requireAnyRole(["admin", "member"]);
  const params = await searchParams;
  const defaultTo = todayInBangkok();
  const defaultFrom = new Date(new Date(`${defaultTo}T00:00:00Z`).getTime() - 6 * 86400000).toISOString().slice(0, 10);
  const from = validDate(params.from) ? params.from : defaultFrom;
  const to = validDate(params.to) ? params.to : defaultTo;
  const days = (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000;
  const dateError = days < 0 ? "วันเริ่มต้นต้องไม่อยู่หลังวันสิ้นสุด" : days > 61 ? "เลือกช่วงเวลาได้สูงสุด 62 วัน" : null;
  const activeWarehouses = await getActiveWarehouses(session.organizationId);
  const warehouseName = (name: string) => name.replace(/\s+/g, "");
  const warehouses = activeWarehouses
    .filter((warehouse) => ["คลังกรุงเทพ", "คลังกรุงเทพฯ", "คลังต่างจังหวัด"].includes(warehouseName(warehouse.name))
      || ["main", "bangkok", "provincial"].includes(warehouse.slug));
  const defaultWarehouse = warehouses.find((warehouse) => warehouseName(warehouse.name).startsWith("คลังกรุงเทพ"))
    ?? warehouses.find((warehouse) => warehouse.slug === "bangkok" || warehouse.slug === "main");
  const warehouseId = warehouses.find((warehouse) => warehouse.id === params.warehouse)?.id
    ?? defaultWarehouse?.id ?? warehouses[0]?.id;
  const [report, receiveData] = await Promise.all([
    dateError || !warehouseId ? Promise.resolve(null) : getDailyMovementReport(session.organizationId, from, to, warehouseId),
    params.receive === "1" ? getStockDashboardData(session.organizationId, 0) : Promise.resolve(null),
  ]);

  return (
    <>
      <StockTabs current="movements" />
      <div className="mx-auto w-full max-w-[1540px] bg-[#f7f8fc] pb-24 lg:rounded-2xl lg:shadow-xl">
      <div className="hidden rounded-t-2xl bg-linear-to-r from-[#4b218c] via-[#6841b8] to-[#4d278f] px-5 py-5 text-white sm:px-8 lg:flex lg:min-h-[104px] lg:items-center lg:justify-between lg:gap-8">
        <div className="flex items-center gap-4">
          <Box className="hidden h-12 w-12 stroke-[2.5] text-white sm:block" aria-hidden="true" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-[32px]">รายงานความเคลื่อนไหวสินค้า</h1>
            <p className="mt-1 text-sm text-purple-100 sm:text-base">รายงานสรุปสต็อกสินค้ารายวัน พร้อมดูรายละเอียดการขายรายร้าน</p>
          </div>
        </div>

        <form method="get" className="mt-4 grid gap-2 rounded-xl bg-[#43217b]/55 p-3 lg:mt-0 lg:grid-cols-[auto_145px_auto_145px_180px_auto] lg:items-center">
          <CalendarDays className="hidden h-6 w-6 lg:block" aria-hidden="true" />
          <label className="text-xs text-purple-100"><span className="lg:hidden">ตั้งแต่วันที่</span>
            <input name="from" type="date" defaultValue={from} className="mt-1 block h-9 w-full rounded-md border border-white/20 bg-white/10 px-2 text-sm font-semibold text-white scheme-dark lg:mt-0" />
          </label>
          <span className="hidden text-purple-200 lg:block">–</span>
          <label className="text-xs text-purple-100"><span className="lg:hidden">ถึงวันที่</span>
            <input name="to" type="date" defaultValue={to} className="mt-1 block h-9 w-full rounded-md border border-white/20 bg-white/10 px-2 text-sm font-semibold text-white scheme-dark lg:mt-0" />
          </label>
          <label><span className="sr-only">คลังสินค้า</span>
            <select name="warehouse" defaultValue={warehouseId} className="h-9 w-full rounded-md border border-white/20 bg-[#51308d] px-2 text-sm font-semibold text-white">
              {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
            </select>
          </label>
          <button type="submit" className="h-9 rounded-md bg-white px-4 text-sm font-bold text-[#51268f] hover:bg-purple-50">แสดง</button>
        </form>
      </div>

      <div className="m-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:m-5 sm:p-6">
        {dateError ? <p role="alert" className="rounded-lg bg-rose-50 p-4 text-rose-700">{dateError}</p> : null}
        {!warehouseId ? <p role="alert" className="rounded-lg bg-amber-50 p-4 text-amber-800">ไม่พบคลังที่เปิดใช้งานสำหรับรายงานนี้</p> : null}
        {report && warehouseId ? <DailyStockReportClient rows={report.rows} from={from} to={to} warehouseId={warehouseId} productId={params.product ?? ""} warehouses={warehouses} /> : null}
      </div>

      <StockMobileReceiveButton baseHref="/stock/movements" />
      {receiveData ? <StockReceiveForm products={receiveData.products} warehouses={activeWarehouses} returnHref="/stock/movements" /> : null}
      </div>
    </>
  );
}
