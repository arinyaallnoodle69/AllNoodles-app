import { Suspense } from "react";
import Link from "next/link";
import { Filter, Package, ChevronLeft, ChevronRight } from "lucide-react";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { AppSidebarLayout } from "@/components/app-sidebar";
import { PageLoader } from "@/components/page-loader";
import { requireAppSession } from "@/lib/auth/authorization";
import { getTodayInBangkok } from "@/lib/orders/date";
import {
  getProductSalesRanking,
  getCustomersForFilter,
  getProductsForFilter,
  getCategoriesForFilter,
  type ProductSalesRow,
} from "@/lib/reports/product-sales";
import { getActiveWarehouses } from "@/lib/warehouses";
import { formatDisplayUnit } from "@/app/order/customer/unit-label";
import styles from "./print.module.css";
import { ProductFilter } from "./product-filter";
import { PrintButton } from "./print-button";
import { StoreFilter } from "./store-filter";
import { MobileSearchDrawer } from "@/components/mobile-search/mobile-search-drawer";
import { ProductSalesDesktopTable, ProductSalesMobileList } from "./product-sales-interactive-views";

export const metadata = { title: "รายงานยอดขายตามอันดับสินค้า" };

// Constants
const DEFAULT_PAGE_SIZE = 20;

// Helpers
function firstOfMonth(iso: string) {
  return iso.slice(0, 7) + "-01";
}

function fmt(n: number) {
  return n.toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

function fmtMoney(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtPercent(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + "%";
}

function isoToDisplay(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${parseInt(y) + 543}`;
}

function formatPrintedAt(date: Date) {
  const datePart = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
  const timePart = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return { datePart, timePart };
}

// ─── Print View Components ───────────────────────────────────────────────────

interface ProductPrintItem {
  row: ProductSalesRow;
  rank: number;
}

interface ProductPrintPage {
  items: ProductPrintItem[];
}

function paginateProductReport(allRows: ProductSalesRow[], maxLinesPerPage = 34): ProductPrintPage[] {
  const pages: ProductPrintPage[] = [];
  let currentPageItems: ProductPrintItem[] = [];
  let currentLines = 0;

  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i];
    const rank = i + 1;
    const storeCount = row.stores?.length || 0;
    const lineCount = 1 + storeCount;

    if (currentLines > 0 && currentLines + lineCount > maxLinesPerPage) {
      pages.push({ items: currentPageItems });
      currentPageItems = [];
      currentLines = 0;
    }

    currentPageItems.push({ row, rank });
    currentLines += lineCount;
  }

  if (currentPageItems.length > 0) {
    pages.push({ items: currentPageItems });
  }

  return pages;
}

function ProductRowPrint({ row, globalRank }: { row: ProductSalesRow; globalRank: number }) {
  const netProfit = row.totalRevenue - row.totalCost;
  const margin = row.totalRevenue > 0 ? (netProfit / row.totalRevenue) * 100 : 0;
  const hasStores = row.stores && row.stores.length > 0;

  return (
    <>
      <tr className="border-b border-slate-200">
        <td className="text-center font-bold text-slate-900 border-b border-slate-200 py-1.5 text-[9.5pt]">
          {globalRank}
        </td>
        <td className="text-center font-mono text-[8.5pt] text-slate-500 border-b border-slate-200 py-1.5">{row.sku || "-"}</td>
        <td className="border-b border-slate-200 py-1.5">
          <div className={styles.printProductCell}>
            <p className={styles.printProductName}>{row.name}</p>
          </div>
        </td>
        <td className="text-center font-bold text-slate-900 tabular-nums whitespace-nowrap border-b border-slate-200 py-1.5 text-[9.5pt]">
          {fmt(row.totalQty)}
        </td>
        <td className="text-center font-medium text-slate-600 whitespace-nowrap border-b border-slate-200 py-1.5 text-[9pt]">{formatDisplayUnit(row.unit)}</td>
        <td className="text-center font-medium text-slate-700 tabular-nums whitespace-nowrap border-b border-slate-200 py-1.5 text-[9.5pt]">
          {fmtMoney(row.totalCost)}
        </td>
        <td className="text-center font-bold text-slate-900 tabular-nums whitespace-nowrap border-b border-slate-200 py-1.5 text-[9.5pt]">
          {fmtMoney(row.totalRevenue)}
        </td>
        <td className="text-center tabular-nums whitespace-nowrap border-b border-slate-200 py-1.5">
          <span className={`inline-flex items-center justify-center whitespace-nowrap font-bold text-[9.5pt] ${netProfit >= 0 ? "text-emerald-700" : "text-red-600"}`}>{fmtMoney(netProfit)}</span>
        </td>
        <td className="text-center tabular-nums whitespace-nowrap border-b border-slate-200 py-1.5">
          <span className={`inline-flex items-center justify-center whitespace-nowrap font-bold text-[9.5pt] ${netProfit >= 0 ? "text-emerald-700" : "text-red-600"}`}>{fmtPercent(margin)}</span>
        </td>
      </tr>
      {hasStores &&
        row.stores.map((store, sIdx) => {
          const sProfit = store.totalRevenue - store.totalCost;
          const sMargin = store.totalRevenue > 0 ? (sProfit / store.totalRevenue) * 100 : 0;
          return (
            <tr key={`${row.productId}-${store.customerId}-${sIdx}`} className={styles.printStoreRow}>
              <td className={`text-center font-medium text-slate-400 tabular-nums ${styles.printStoreCell}`}>
                ↳ {sIdx + 1}
              </td>
              <td className={`text-center ${styles.printStoreCode} ${styles.printStoreCell}`}>
                {store.customerCode || "-"}
              </td>
              <td className={`pl-3 ${styles.printStoreCell}`}>
                <span className={styles.printStoreName}>{store.customerName}</span>
              </td>
              <td className={`text-center font-semibold text-slate-700 tabular-nums whitespace-nowrap ${styles.printStoreCell}`}>
                {fmt(store.totalQty)}
              </td>
              <td className={`text-center text-slate-500 whitespace-nowrap ${styles.printStoreCell}`}>
                {formatDisplayUnit(store.unit || row.unit)}
              </td>
              <td className={`text-center text-slate-600 tabular-nums whitespace-nowrap ${styles.printStoreCell}`}>
                {fmtMoney(store.totalCost)}
              </td>
              <td className={`text-center font-bold text-slate-800 tabular-nums whitespace-nowrap ${styles.printStoreCell}`}>
                {fmtMoney(store.totalRevenue)}
              </td>
              <td className={`text-center tabular-nums whitespace-nowrap ${styles.printStoreCell}`}>
                <span className={`font-semibold ${sProfit >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                  {fmtMoney(sProfit)}
                </span>
              </td>
              <td className={`text-center tabular-nums whitespace-nowrap ${styles.printStoreCell}`}>
                <span className={`font-semibold ${sProfit >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                  {fmtPercent(sMargin)}
                </span>
              </td>
            </tr>
          );
        })}
    </>
  );
}

// ─── Page Props & Entry ───────────────────────────────────────────────────────
function Pagination({ page, total, pageSize, baseUrl }: { page: number; total: number; pageSize: number; baseUrl: string }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  const pages: (number | "...")[] = [];
  const around = new Set([1, totalPages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= totalPages));
  const sorted = [...around].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) pages.push("...");
    pages.push(sorted[i]);
  }
  return (
    <div className="flex items-center gap-1.5">
      {page > 1 && (
        <Link href={`${baseUrl}&page=${page - 1}`} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 active:scale-95">
          <ChevronLeft className="h-5 w-5" strokeWidth={2.2} />
        </Link>
      )}
      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`e-${i}`} className="px-1 text-base text-slate-400">...</span>
        ) : (
          <Link key={p} href={`${baseUrl}&page=${p}`} className={`flex h-10 w-10 items-center justify-center rounded-xl text-base font-semibold transition ${p === page ? "bg-[#4A148C] text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`}>{p}</Link>
        ),
      )}
      {page < totalPages && (
        <Link href={`${baseUrl}&page=${page + 1}`} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 active:scale-95">
          <ChevronRight className="h-5 w-5" strokeWidth={2.2} />
        </Link>
      )}
    </div>
  );
}

type PageProps = {
  searchParams: Promise<{
    q?: string;
    products?: string;
    stores?: string;
    from?: string;
    to?: string;
    warehouse?: string;
    page?: string;
    pageSize?: string;
  }>;
};

export default async function Page({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<PageLoader />}>
      <ProductSalesReportContent searchParams={searchParams} />
    </Suspense>
  );
}

async function ProductSalesReportContent({ searchParams }: PageProps) {
  const session = await requireAppSession();
  const params = await searchParams;
  const today = getTodayInBangkok();
  const defaultFrom = firstOfMonth(today);
  const fromDate = params.from && /^\d{4}-\d{2}-\d{2}$/.test(params.from) ? params.from : defaultFrom;
  const toDate = params.to && /^\d{4}-\d{2}-\d{2}$/.test(params.to) ? params.to : today;
  const warehouseId = params.warehouse || "";
  const selectedProductIds = params.products ? params.products.split(",").filter(Boolean) : [];
  const selectedStoreIds = params.stores ? params.stores.split(",").filter(Boolean) : [];
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const pageSize = params.pageSize ? parseInt(params.pageSize, 10) : DEFAULT_PAGE_SIZE;

  const [{ rows, allRows, summary, total }, customers, products, categories, warehouses] = await Promise.all([
    getProductSalesRanking({
      organizationId: session.organizationId,
      fromDate,
      toDate,
      productIds: selectedProductIds,
      customerIds: selectedStoreIds,
      warehouseId,
      page,
      pageSize,
    }),
    getCustomersForFilter(session.organizationId),
    getProductsForFilter(session.organizationId),
    getCategoriesForFilter(session.organizationId),
    getActiveWarehouses(session.organizationId),
  ]);

  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);
  const filterQs = new URLSearchParams({
    ...(selectedProductIds.length > 0 ? { products: selectedProductIds.join(",") } : {}),
    ...(selectedStoreIds.length > 0 ? { stores: selectedStoreIds.join(",") } : {}),
    from: fromDate,
    to: toDate,
    ...(warehouseId ? { warehouse: warehouseId } : {}),
    ...(params.pageSize ? { pageSize: params.pageSize } : {}),
  }).toString();
  const paginationBase = `/reports/product-sales?${filterQs}`;
  const printedAt = formatPrintedAt(new Date());
  const totalMarginPercent = summary.totalRevenue > 0 ? (summary.netProfit / summary.totalRevenue) * 100 : 0;

  return (
    <AppSidebarLayout>
      <div className="min-h-screen bg-background">
        {/* ─── Screen View (Hidden on Print) ─── */}
        <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8 no-print">
          <header className="mb-6 sm:mb-8">
            <nav className="mb-2 flex items-center gap-1 text-sm font-medium text-slate-400">
              <span>Analytics</span>
              <span className="text-slate-300">›</span>
              <span className="font-semibold text-[#4A148C]">รายงานยอดขายตามอันดับสินค้า</span>
            </nav>
            <h1 className="text-2xl font-extrabold tracking-tight text-[#4A148C] sm:text-3xl">รายงานยอดขายตามอันดับสินค้า</h1>
          </header>

          <MobileSearchDrawer title="ค้นหารายงานยอดขาย">
            <form method="GET" action="/reports/product-sales" className="flex flex-col gap-4 pb-32">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">คลังสินค้า</label>
                <select
                  name="warehouse"
                  defaultValue={warehouseId}
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-[#4A148C]"
                >
                  <option value="">ทุกคลังสินค้า</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">สินค้า</label>
                <ProductFilter products={products} selectedIds={selectedProductIds} categories={categories} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">ร้านค้า</label>
                <StoreFilter customers={customers} selectedIds={selectedStoreIds} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">ช่วงวันที่</label>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1"><ThaiDatePicker id="m-ps-from" name="from" defaultValue={fromDate} max={today} placeholder="วันเริ่มต้น" compact matchFieldHeight /></div>
                  <span className="shrink-0 text-slate-300">—</span>
                  <div className="min-w-0 flex-1"><ThaiDatePicker id="m-ps-to" name="to" defaultValue={toDate} max={today} placeholder="วันสิ้นสุด" compact matchFieldHeight /></div>
                </div>
              </div>
              <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#4A148C] py-3.5 text-base font-bold text-white transition hover:bg-[#4A148C]"><Filter className="h-4 w-4" strokeWidth={2} />ค้นหา</button>
            </form>
          </MobileSearchDrawer>

          {/* Desktop Filter Card */}
          <section className="hidden md:block bg-white shadow-[0_4px_20px_rgba(27,27,33,0.05)] rounded-2xl mb-6">
            <div className="px-5 py-4 sm:px-6 sm:py-5">
              <form method="GET" action="/reports/product-sales" className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
                <div className="w-full sm:min-w-[200px] sm:flex-1 lg:min-w-[260px] lg:max-w-[340px] lg:flex-[1.05]">
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">สินค้า</label>
                  <ProductFilter products={products} selectedIds={selectedProductIds} categories={categories} />
                </div>
                <div className="w-full sm:min-w-[200px] sm:flex-1">
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">ร้านค้า</label>
                  <StoreFilter customers={customers} selectedIds={selectedStoreIds} />
                </div>
                <div className="w-full sm:min-w-[150px] sm:flex-1 lg:min-w-[180px] lg:max-w-[220px]">
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">คลังสินค้า</label>
                  <select
                    name="warehouse"
                    defaultValue={warehouseId}
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-[#4A148C]"
                  >
                    <option value="">ทุกคลังสินค้า</option>
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-full sm:min-w-[300px] sm:flex-1 lg:min-w-[420px] lg:flex-[1.15]">
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">ช่วงวันที่</label>
                  <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                    <div className="min-w-0 flex-1"><ThaiDatePicker id="report-date-from" name="from" defaultValue={fromDate} max={today} placeholder="วันเริ่มต้น" compact matchFieldHeight /></div>
                    <span className="shrink-0 text-slate-300">—</span>
                    <div className="min-w-0 flex-1"><ThaiDatePicker id="report-date-to" name="to" defaultValue={toDate} max={today} placeholder="วันสิ้นสุด" compact matchFieldHeight /></div>
                  </div>
                </div>
                <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
                  <button type="submit" className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#4A148C] px-6 text-sm font-bold text-white transition hover:bg-[#4A148C] active:scale-95 sm:w-auto"><Filter className="h-4 w-4" strokeWidth={2.2} />ค้นหา</button>
                  <Link href={`${paginationBase}&pageSize=9999`} className="flex h-10 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-500 transition hover:border-[#4A148C] hover:text-[#4A148C] active:scale-95 sm:w-auto">แสดงทั้งหมด</Link>
                </div>
              </form>
            </div>
          </section>

          {/* Main Table Card */}
          <section className="overflow-hidden rounded-2xl bg-white shadow-[0_4px_20px_rgba(27,27,33,0.05)]">

            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6 sm:py-5">
              <div>
                <h3 className="text-lg font-bold text-[#4A148C] sm:text-xl">ยอดขายตามสินค้า</h3>
                <p className="mt-0.5 text-sm text-slate-400">{isoToDisplay(fromDate)} — {isoToDisplay(toDate)}{selectedStoreIds.length > 0 && ` · ${selectedStoreIds.length} ร้านค้า`}</p>
              </div>
              <PrintButton targetId="report-print-area" fileName="รายงานยอดขายตามสินค้า" />
            </div>

            {rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400">
                <Package className="h-12 w-12" strokeWidth={1.5} />
                <p className="text-base">ไม่พบข้อมูลในช่วงเวลาที่เลือก</p>
              </div>
            ) : (
              <>
                {/* ── Desktop View Table ── */}
                <ProductSalesDesktopTable
                  rows={rows}
                  startRank={(page - 1) * pageSize + 1}
                  summary={summary}
                  totalMarginPercent={totalMarginPercent}
                />

                {/* ── Mobile View Cards ── */}
                <ProductSalesMobileList
                  rows={rows}
                  startRank={(page - 1) * pageSize + 1}
                />
              </>
            )}

            <div className="flex flex-col items-center gap-3 border-t border-slate-100 bg-slate-50/40 px-5 py-4 sm:flex-row sm:justify-between sm:px-6">
              <p className="text-base text-slate-500">{total === 0 ? "ไม่มีข้อมูล" : `แสดง ${startItem}–${endItem} จาก ${fmt(total)} รายการ`}</p>
              <Pagination page={page} total={total} pageSize={pageSize} baseUrl={paginationBase} />
            </div>
          </section>
        </div>

        {/* ─── Print View (Invisible on Screen, block on Print) ─── */}
        <div id="report-print-area" className="fixed -left-[9999px] top-0 opacity-0 pointer-events-none print:static print:opacity-100 print:pointer-events-auto print:block">
          {(() => {
            const pages = paginateProductReport(allRows, 34);
            if (pages.length === 0) return null;

            return pages.map((pageData, pageIdx) => (
              <div key={pageIdx} data-print-page="true" className={`${styles.printArea} ${styles.printPage}`}>
                <div className={styles.printHeader}>
                  <div className={styles.printHeaderTop}>
                    <div className={styles.printBrand}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/api/brand/logo" alt="All Noodles" width="40" height="40" className={styles.printLogo} />
                      <div>
                        <p className={styles.printCompanyName}>All Noodles</p>
                        <p className={styles.printSubtitle}>สรุปยอดขาย ต้นทุน กำไร และอัตรากำไรของสินค้า</p>
                      </div>
                    </div>
                    <div className={styles.printMeta}>
                      <p>วันที่พิมพ์: {printedAt.datePart}</p>
                      <p>เวลาพิมพ์: {printedAt.timePart} น.</p>
                      <p>หน้า: {pageIdx + 1} / {pages.length}</p>
                    </div>
                  </div>
                  <div className={styles.printFilters}>
                    <div className={styles.printFilterItem}>
                      <span className={styles.printFilterLabel}>ช่วงวันที่:</span>
                      <span className={styles.printFilterValue}>{isoToDisplay(fromDate)} — {isoToDisplay(toDate)}</span>
                    </div>
                  </div>
                  <div>
                    <h1 className={styles.printReportTitle}>รายงานยอดขายตามอันดับสินค้า</h1>
                  </div>
                </div>

                <table className="w-full table-fixed border-collapse text-left">
                  <colgroup>
                    <col style={{ width: "6%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "27%" }} />
                    <col style={{ width: "8%" }} />
                    <col style={{ width: "6%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "9%" }} />
                  </colgroup>
                  <thead>
                    <tr className="bg-slate-50 border-b-2 border-slate-900">
                      {[
                        { label: "ลำดับ", align: "center" },
                        { label: "รหัสสินค้า", align: "center" },
                        { label: "สินค้า", align: "left" },
                        { label: "จำนวน", align: "center" },
                        { label: "หน่วย", align: "center" },
                        { label: "ต้นทุน", align: "center" },
                        { label: "จำนวนเงิน", align: "center" },
                        { label: "กำไรสุทธิ", align: "center" },
                        { label: "กำไร (%)", align: "center" },
                      ].map(({ label, align }) => (
                        <th
                          key={label}
                          className={`whitespace-nowrap px-2 py-1.5 text-[9pt] font-black uppercase tracking-wider text-slate-900 ${
                            align === "center" ? "text-center" : ""
                          }`}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-200">
                    {pageData.items.map(({ row, rank }) => (
                      <ProductRowPrint key={row.productId} row={row} globalRank={rank} />
                    ))}
                    {pageIdx === pages.length - 1 && (
                      <tr className="bg-slate-100 font-black border-t-2 border-b-2 border-slate-900">
                        <td colSpan={3} className="px-3 py-2 text-right text-[10pt] font-black tracking-[0.02em] text-slate-900 whitespace-nowrap">
                          ยอดรวมทั้งหมด
                        </td>
                        <td className="px-2 py-2 text-center text-[10pt] font-black text-slate-900 tabular-nums whitespace-nowrap">
                          {fmt(summary.totalQty)}
                        </td>
                        <td className="px-2 py-2 text-center text-[10pt] font-black text-slate-500 whitespace-nowrap">—</td>
                        <td className="px-2 py-2 text-center text-[10pt] font-black text-slate-900 tabular-nums whitespace-nowrap">
                          {fmtMoney(summary.totalCost)}
                        </td>
                        <td className="px-2 py-2 text-center tabular-nums whitespace-nowrap">
                          <span className="whitespace-nowrap text-[10pt] font-black text-slate-900">{fmtMoney(summary.totalRevenue)}</span>
                        </td>
                        <td className={`px-2 py-2 text-center tabular-nums whitespace-nowrap ${summary.netProfit >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                          <span className="inline-flex items-center justify-center whitespace-nowrap text-[10pt] font-black">{fmtMoney(summary.netProfit)}</span>
                        </td>
                        <td className={`px-2 py-2 text-center tabular-nums whitespace-nowrap ${summary.netProfit >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                          <span className="inline-flex items-center justify-center whitespace-nowrap text-[10pt] font-black">{fmtPercent(totalMarginPercent)}</span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                <div className={styles.printFooter}>
                  พิมพ์จากระบบรายงานอัตโนมัติ (All Noodles) · หน้า {pageIdx + 1} / {pages.length}
                </div>
              </div>
            ));
          })()}
        </div>
      </div>
    </AppSidebarLayout>
  );
}
