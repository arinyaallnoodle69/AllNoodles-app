import { Suspense } from "react";
import { Filter, FileSpreadsheet, Store } from "lucide-react";
import Link from "next/link";
import { AppSidebarLayout } from "@/components/app-sidebar";
import { MobileSearchDrawer } from "@/components/mobile-search/mobile-search-drawer";
import { PageLoader } from "@/components/page-loader";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { requireAppSession } from "@/lib/auth/authorization";
import { getTodayInBangkok } from "@/lib/orders/date";
import { getDetailedProfitSalesReport, type DetailedProfitStoreGroup, type DetailedProfitProductItem } from "@/lib/reports/profit-sales-detailed";
import { getCustomersForFilter } from "@/lib/reports/product-sales";
import { StoreFilter } from "../product-sales/store-filter";
import { PrintButton } from "../product-sales/print-button";
import styles from "./print.module.css";
import { MobileStoreCard } from "./mobile-store-card";

export const metadata = {
  title: "รายงานสินค้าและกำไรแยกตามสาขา",
};

type PageProps = {
  searchParams: Promise<{
    from?: string;
    to?: string;
    stores?: string;
  }>;
};

function firstOfMonth(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

function formatDateThai(isoDate: string) {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${Number(year) + 543}`;
}

function formatMonthYearThai(isoDate: string) {
  const [year, month] = isoDate.split("-");
  const monthNames = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
  ];
  return `${monthNames[Number(month) - 1]} ${Number(year) + 543}`;
}

function formatMoney(value: number) {
  return value.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(value: number) {
  return `${value.toLocaleString("th-TH", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
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

function summarizeSelection(
  items: { id: string; name: string }[],
  selectedIds: string[],
  fallback: string,
) {
  if (selectedIds.length === 0) return fallback;
  const names = items.filter((i) => selectedIds.includes(i.id)).map((i) => i.name);
  return names.length <= 3 ? names.join(", ") : `${names.length} ร้านค้า`;
}

interface PrintablePage {
  groups: {
    store: DetailedProfitStoreGroup;
    items: DetailedProfitProductItem[];
    isFirstPageOfStore: boolean;
    isLastPageOfStore: boolean;
  }[];
}

function paginateDetailedReport(stores: DetailedProfitStoreGroup[], maxRowsPerPage = 38): PrintablePage[] {
  const pages: PrintablePage[] = [];
  let currentPageGroups: PrintablePage["groups"] = [];
  let currentPageRowCount = 0;

  for (const store of stores) {
    let itemsRemaining = [...store.items];
    let isFirst = true;

    while (itemsRemaining.length > 0) {
      const headerCost = isFirst ? 1 : 0;
      let availableRows = maxRowsPerPage - currentPageRowCount - headerCost;

      if (availableRows < 2) {
        if (currentPageGroups.length > 0) {
          pages.push({ groups: currentPageGroups });
          currentPageGroups = [];
          currentPageRowCount = 0;
        }
        availableRows = maxRowsPerPage - 1;
      }

      const summaryCost = 1;
      const totalNeeded = itemsRemaining.length + summaryCost;

      if (totalNeeded <= availableRows) {
        currentPageGroups.push({
          store,
          items: itemsRemaining,
          isFirstPageOfStore: isFirst,
          isLastPageOfStore: true,
        });
        currentPageRowCount += headerCost + itemsRemaining.length + summaryCost;
        itemsRemaining = [];
      } else {
        const itemsToTakeCount = Math.max(1, availableRows);
        const itemsToTake = itemsRemaining.slice(0, itemsToTakeCount);

        currentPageGroups.push({
          store,
          items: itemsToTake,
          isFirstPageOfStore: isFirst,
          isLastPageOfStore: false,
        });
        currentPageRowCount += headerCost + itemsToTake.length;
        itemsRemaining = itemsRemaining.slice(itemsToTakeCount);
        isFirst = false;

        pages.push({ groups: currentPageGroups });
        currentPageGroups = [];
        currentPageRowCount = 0;
      }
    }
  }

  if (currentPageGroups.length > 0) {
    pages.push({ groups: currentPageGroups });
  }

  return pages;
}

export default async function Page({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<PageLoader />}>
      <DetailedProfitContent searchParams={searchParams} />
    </Suspense>
  );
}

async function DetailedProfitContent({ searchParams }: PageProps) {
  const session = await requireAppSession();
  const params = await searchParams;

  const today = getTodayInBangkok();
  const defaultFrom = firstOfMonth(today);

  const fromDate = params.from && /^\d{4}-\d{2}-\d{2}$/.test(params.from) ? params.from : defaultFrom;
  const toDate = params.to && /^\d{4}-\d{2}-\d{2}$/.test(params.to) ? params.to : today;
  const selectedStoreIds = params.stores ? params.stores.split(",").filter(Boolean) : [];

  const [report, customers] = await Promise.all([
    getDetailedProfitSalesReport({
      organizationId: session.organizationId,
      fromDate,
      toDate,
      customerIds: selectedStoreIds,
    }),
    getCustomersForFilter(session.organizationId),
  ]);

  const selectedStoreLabel = summarizeSelection(customers, selectedStoreIds, "ทุกร้านค้า");
  const printedAt = formatPrintedAt(new Date());
  const reportPeriodThai = formatMonthYearThai(fromDate);
  const pages = report.stores.length > 0 ? paginateDetailedReport(report.stores, 38) : [];

  return (
    <AppSidebarLayout>
      <div className="min-h-screen bg-[#f8f9ff] text-[#0b1c30] print:bg-white print:text-black">
        {/* Screen View (Hidden on Print) */}
        <div className="mx-auto max-w-[1600px] px-6 py-8 no-print">
          {/* Header & Sub-title */}
          <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <nav className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wider text-[#45464d] uppercase">
                <span>Analytics</span>
                <span className="text-slate-300">›</span>
                <span className="text-[#000000]">รายงานสินค้าและกำไรแยกตามสาขา</span>
              </nav>
              <h1 className="text-[28px] font-bold leading-9 text-[#0b1c30] tracking-tight">
                รายงานสินค้าและกำไรแยกตามสาขา
              </h1>
              <p className="mt-1 text-[14px] text-[#45464d]">
                สรุปความเคลื่อนไหวสินค้าและอัตรากำไรประจำเดือน {reportPeriodThai}
              </p>
            </div>
            {/* Action Buttons */}
            <div className="flex gap-2 shrink-0">
              <button
                disabled
                className="flex items-center gap-1.5 rounded-[4px] border border-[#c6c6cd] bg-white px-4 py-2 text-[12px] font-semibold uppercase tracking-wider text-[#0b1c30] opacity-50 cursor-not-allowed transition hover:bg-[#eff4ff]"
              >
                <FileSpreadsheet className="h-4 w-4 text-[#006c49]" />
                Export Excel
              </button>
              <PrintButton targetId="detailed-print-area" fileName={`รายงานสินค้าและกำไรแยกตามสาขา_${fromDate}_${toDate}`} hidePrintOnMobile />
            </div>
          </header>

          {/* Mobile search drawer */}
          <MobileSearchDrawer title="ค้นหากำไรขายแบบละเอียด">
            <form method="GET" action="/reports/profit-sales-detailed" className="flex flex-col gap-4 pb-32">
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-[#45464d]">ร้านค้า</label>
                <StoreFilter customers={customers} selectedIds={selectedStoreIds} />
              </div>
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-[#45464d]">ช่วงวันที่</label>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <ThaiDatePicker id="m-detailed-from" name="from" defaultValue={fromDate} max={today} placeholder="วันเริ่มต้น" compact matchFieldHeight />
                  </div>
                  <span className="shrink-0 text-slate-300">—</span>
                  <div className="min-w-0 flex-1">
                    <ThaiDatePicker id="m-detailed-to" name="to" defaultValue={toDate} max={today} placeholder="วันสิ้นสุด" compact matchFieldHeight />
                  </div>
                </div>
              </div>
              <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-[4px] bg-[#131b2e] py-3 text-[14px] font-semibold text-white transition hover:opacity-90">
                <Filter className="h-4 w-4" />
                ค้นหา
              </button>
            </form>
          </MobileSearchDrawer>

          {/* Desktop Filter Card */}
          <section className="hidden md:block bg-white border border-[#c6c6cd] rounded-[4px] mb-6">
            <div className="px-4 py-4">
              <form method="GET" action="/reports/profit-sales-detailed" className="flex flex-col gap-4 lg:flex-row lg:items-end">
                <div className="w-full sm:min-w-[240px] sm:flex-1">
                  <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-[#45464d]">ร้านค้า</label>
                  <StoreFilter customers={customers} selectedIds={selectedStoreIds} />
                </div>
                <div className="min-w-[420px] flex-1">
                  <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wider text-[#45464d]">ช่วงวันที่</label>
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <ThaiDatePicker id="detailed-from" name="from" defaultValue={fromDate} max={today} placeholder="วันเริ่มต้น" compact matchFieldHeight />
                    </div>
                    <span className="shrink-0 text-slate-300">—</span>
                    <div className="min-w-0 flex-1">
                      <ThaiDatePicker id="detailed-to" name="to" defaultValue={toDate} max={today} placeholder="วันสิ้นสุด" compact matchFieldHeight />
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="submit" className="flex h-10 items-center justify-center gap-1.5 rounded-[4px] bg-[#131b2e] px-5 text-[12px] font-semibold tracking-wider uppercase text-white transition hover:opacity-90">
                    <Filter className="h-4 w-4" />
                    ค้นหา
                  </button>
                  <Link href="/reports/profit-sales-detailed" className="flex h-10 items-center justify-center rounded-[4px] border border-[#c6c6cd] bg-white px-4 text-[12px] font-semibold tracking-wider uppercase text-[#0b1c30] transition hover:bg-[#eff4ff]">
                    ล้างตัวกรอง
                  </Link>
                </div>
              </form>
            </div>
          </section>



          {/* Main Data Table Card (Desktop only) */}
          <div className="hidden md:block bg-white border border-[#c6c6cd] rounded-[4px] overflow-hidden mb-6">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#eff4ff] border-b border-[#c6c6cd]">
                    <th className="px-4 py-2.5 text-[14px] font-extrabold text-black w-[10%]">รหัสสินค้า</th>
                    <th className="px-4 py-2.5 text-[14px] font-extrabold text-black w-[22%]">รายการสินค้า</th>
                    <th className="px-4 py-2.5 text-[14px] font-extrabold text-black text-right w-[8%]">จำนวน</th>
                    <th className="px-4 py-2.5 text-[14px] font-extrabold text-black w-[8%]">หน่วย</th>
                    <th className="px-4 py-2.5 text-[14px] font-extrabold text-black text-right w-[12%]">ต้นทุน/หน่วย (฿)</th>
                    <th className="px-4 py-2.5 text-[14px] font-extrabold text-black text-right w-[12%]">ต้นทุนรวม (฿)</th>
                    <th className="px-4 py-2.5 text-[14px] font-extrabold text-black text-right w-[12%]">จำนวนเงิน (฿)</th>
                    <th className="px-4 py-2.5 text-[14px] font-extrabold text-black text-right w-[10%]">กำไร (฿)</th>
                    <th className="px-4 py-2.5 text-[14px] font-extrabold text-black text-right w-[8%]">กำไร%</th>
                  </tr>
                </thead>
                <tbody className="text-[14px] font-normal divide-y divide-[#c6c6cd]/50">
                  {report.stores.length > 0 ? (
                    report.stores.map((store) => (
                      <Suspense key={store.deliveryNumber}>
                        {/* Store Group Row */}
                        <tr className="bg-[#dce9ff]/30 border-b border-[#c6c6cd]">
                          <td colSpan={9} className="px-4 py-2.5 font-black text-[#0b1c30] text-[14px]">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span>วันที่: {formatDateThai(store.deliveryDate)}</span>
                              <span className="text-slate-400 font-normal">|</span>
                              <span>เลขที่ใบจัดส่ง: {store.deliveryNumber}</span>
                              <span className="text-slate-400 font-normal">|</span>
                              <span className="flex items-center gap-1.5 shrink-0 text-[#0b1c30]">
                                <Store className="h-4.5 w-4.5 text-[#131b2e] inline" />
                                <span>{store.customerCode} - {store.customerName}</span>
                              </span>
                            </div>
                          </td>
                        </tr>
                        {/* Products list for this store */}
                        {store.items.map((item) => (
                          <tr key={item.productSku} className="border-b border-[#c6c6cd]/30 hover:bg-[#eff4ff]/30 transition-colors">
                            <td className="px-4 py-2 font-mono font-medium text-slate-500">{item.productSku}</td>
                            <td className="px-4 py-2 font-semibold text-[#0b1c30]">{item.productName}</td>
                            <td className="px-4 py-2 text-right font-mono font-medium text-[#0b1c30]">{item.quantity.toLocaleString("th-TH")}</td>
                            <td className="px-4 py-2 text-slate-600">{item.unit}</td>
                            <td className="px-4 py-2 text-right font-mono text-slate-500">{formatMoney(item.costPrice)}</td>
                            <td className="px-4 py-2 text-right font-mono text-slate-500">{formatMoney(item.costPrice * item.quantity)}</td>
                            <td className="px-4 py-2 text-right font-mono font-medium text-[#0b1c30]">{formatMoney(item.salesAmount)}</td>
                            <td className={`px-4 py-2 text-right font-mono font-semibold ${item.profit >= 0 ? "text-[#006c49]" : "text-[#ba1a1a]"}`}>
                              {formatMoney(item.profit)}
                            </td>
                            <td className={`px-4 py-2 text-right font-mono font-bold ${item.marginPercent >= 0 ? "text-[#006c49]" : "text-[#ba1a1a]"}`}>
                              {formatPercent(item.marginPercent)}
                            </td>
                          </tr>
                        ))}
                        {/* Store Summary Row */}
                        <tr className="bg-white border-b border-[#c6c6cd]">
                          <td colSpan={2} className="px-4 py-2.5 text-right font-black text-black text-[15px]">
                            ยอดรวม | {store.deliveryNumber}:
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-black bg-white text-[#0b1c30] text-[15px]">
                            {store.totalQuantity.toLocaleString("th-TH")}
                          </td>
                          <td className="px-4 py-2.5 bg-white font-bold text-slate-600 text-[14px]">
                            {Array.from(new Set(store.items.map(item => item.unit).filter(Boolean))).join(", ") || "หน่วย"}
                          </td>
                          <td className="px-4 py-2.5 bg-white"></td>
                          <td className="px-4 py-2.5 text-right font-mono font-black text-slate-500 bg-white text-[15px]">
                            {formatMoney(store.totalCost)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-black bg-white text-black text-[15px]">
                            {formatMoney(store.totalSales)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-black bg-white text-[#006c49] text-[15px]">
                            {formatMoney(store.totalProfit)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-black text-[#006c49] bg-white text-[15px]">
                            {formatPercent(store.avgMarginPercent)}
                          </td>
                        </tr>
                      </Suspense>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-400 font-medium bg-white">
                        ไม่พบข้อมูลในช่วงวันที่หรือร้านค้าที่เลือก
                      </td>
                    </tr>
                  )}
                </tbody>
                {report.stores.length > 0 && (
                  <tfoot>
                    <tr className="bg-[#eff4ff] text-[#0b1c30] border-t-2 border-b border-[#c6c6cd]">
                      <td colSpan={2} className="px-4 py-4 text-right font-black text-black text-[16px] tracking-wider">
                        ยอดรวมทั้งหมด ({reportPeriodThai}):
                      </td>
                      <td className="px-4 py-4 text-right font-mono font-black text-[16px] text-black">
                        {report.summary.totalQuantity.toLocaleString("th-TH")}
                      </td>
                      <td className="px-4 py-4 bg-[#eff4ff] font-bold text-slate-600 text-[15px]">
                        {Array.from(new Set(report.stores.flatMap(s => s.items.map(item => item.unit)).filter(Boolean))).join(", ") || "หน่วย"}
                      </td>
                      <td className="px-4 py-4 bg-[#eff4ff]"></td>
                      <td className="px-4 py-4 text-right font-mono font-black text-[16px] text-slate-600">
                        {formatMoney(report.summary.totalCost)}
                      </td>
                      <td className="px-4 py-4 text-right font-mono font-black text-[17px] text-black">
                        {formatMoney(report.summary.totalSales)}
                      </td>
                      <td className="px-4 py-4 text-right font-mono font-black text-[17px] text-[#006c49]">
                        {formatMoney(report.summary.totalNetProfit)}
                      </td>
                      <td className="px-4 py-4 text-right font-mono font-black text-[17px] text-[#006c49]">
                        {formatPercent(report.summary.avgMarginPercent)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Mobile Card-based List (Visible on Mobile only, Hidden on Desktop) */}
          <div className="md:hidden mb-6">
            {report.stores.length > 0 ? (
              report.stores.map((store) => {
                const storeUnits = Array.from(
                  new Set(store.items.map((item) => item.unit).filter(Boolean)),
                ).join(", ") || "หน่วย";

                return (
                  <MobileStoreCard
                    key={store.deliveryNumber}
                    store={store}
                    storeUnits={storeUnits}
                  />
                );
              })
            ) : (
              <div className="bg-white border border-[#c6c6cd] rounded-[4px] p-6 text-center text-slate-400 font-medium">
                ไม่พบข้อมูลในช่วงวันที่หรือร้านค้าที่เลือก
              </div>
            )}
          </div>

          {/* Footer Compliance Tag */}
          <footer className="mt-8 flex flex-col gap-3 justify-between sm:flex-row sm:items-center text-[#45464d] text-[12px] font-semibold">
            <p>รายงานนี้สร้างขึ้นโดยระบบอัตโนมัติเมื่อวันที่ {printedAt.datePart} เวลา {printedAt.timePart} น.</p>
          </footer>
        </div>

        {/* Print View (Hidden on Screen, Visible on Print) */}
        <div id="detailed-print-area" className="fixed -left-[9999px] top-0 opacity-0 pointer-events-none print:static print:opacity-100 print:pointer-events-auto print:block">
          {pages.length === 0 ? (
            <div
              data-print-page="true"
              className={`${styles.printArea} ${styles.printPage}`}
            >
              <div>
                {/* Replicated Print Header */}
                <div className={styles.printHeader}>
                  <div className="mb-1 flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <img src="/ty-noodles-logo-cropped.png" alt="T&Y Noodle" width={40} height={40} className="h-10 w-10 object-contain" />
                      <div>
                        <p className="text-sm font-black leading-tight text-[#003366]">T&Y Noodle</p>
                        <p className="text-[10px] font-semibold text-slate-500">ระบบรายงานผลกำไรจากการขายสินค้า</p>
                      </div>
                    </div>
                    <div className="text-right text-[10px] font-semibold text-slate-500">
                      <p>วันที่พิมพ์: {printedAt.datePart}</p>
                      <p>เวลา: {printedAt.timePart} น.</p>
                      <p>หน้า: 1 / 1</p>
                    </div>
                  </div>
                  <p className="text-base font-black text-[#003366] mt-2">รายงานสินค้าและกำไรแยกตามสาขา</p>
                  <p className="text-xs font-semibold text-slate-600">
                    ช่วงวันที่ {formatDateThai(fromDate)} — {formatDateThai(toDate)} {selectedStoreIds.length > 0 && ` · ${selectedStoreLabel}`}
                  </p>
                </div>
                <div className="text-center py-12 text-slate-400 font-medium text-[11px] bg-slate-50/50 rounded-[4px] border border-slate-200/50 mt-8">
                  ไม่พบข้อมูลในช่วงวันที่หรือร้านค้าที่เลือก
                </div>
              </div>
              <div className={styles.printFooter}>
                พิมพ์จากระบบรายงานวิเคราะห์อัตรากำไรอัตโนมัติ (T&Y Noodle Corporate HQ) - หน้า 1 / 1
              </div>
            </div>
          ) : (
            pages.map((page, pageIndex) => (
              <div
                key={pageIndex}
                data-print-page="true"
                className={`${styles.printArea} ${styles.printPage}`}
              >
                <div>
                  {/* Replicated Print Header */}
                  <div className={styles.printHeader}>
                    <div className="mb-1 flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <img src="/ty-noodles-logo-cropped.png" alt="T&Y Noodle" width={40} height={40} className="h-10 w-10 object-contain" />
                        <div>
                          <p className="text-sm font-black leading-tight text-[#003366]">T&Y Noodle</p>
                          <p className="text-[10px] font-semibold text-slate-500">ระบบรายงานผลกำไรจากการขายสินค้า</p>
                        </div>
                      </div>
                      <div className="text-right text-[10px] font-semibold text-slate-500">
                        <p>วันที่พิมพ์: {printedAt.datePart}</p>
                        <p>เวลา: {printedAt.timePart} น.</p>
                        <p>หน้า: {pageIndex + 1} / {pages.length}</p>
                      </div>
                    </div>
                    <p className="text-base font-black text-[#003366] mt-2">รายงานสินค้าและกำไรแยกตามสาขา</p>
                    <p className="text-xs font-semibold text-slate-600">
                      ช่วงวันที่ {formatDateThai(fromDate)} — {formatDateThai(toDate)} {selectedStoreIds.length > 0 && ` · ${selectedStoreLabel}`}
                    </p>
                  </div>

                  <table className="w-full text-left border-collapse text-[10px]">
                    <thead>
                      <tr className="bg-[#eff4ff] border-b-2 border-[#8ba9db]">
                        <th className="px-2 py-2 font-extrabold text-black w-[10%] text-[11px]">รหัสสินค้า</th>
                        <th className="px-2 py-2 font-extrabold text-black w-[22%] text-[11px]">รายการสินค้า</th>
                        <th className="px-2 py-2 font-extrabold text-black text-right w-[8%] text-[11px]">จำนวน</th>
                        <th className="px-2 py-2 font-extrabold text-black w-[8%] text-[11px]">หน่วย</th>
                        <th className="px-2 py-2 font-extrabold text-black text-right w-[11%] text-[11px]">ต้นทุน/หน่วย (฿)</th>
                        <th className="px-2 py-2 font-extrabold text-black text-right w-[11%] text-[11px]">ต้นทุนรวม (฿)</th>
                        <th className="px-2 py-2 font-extrabold text-black text-right w-[11%] text-[11px]">จำนวนเงิน (฿)</th>
                        <th className="px-2 py-2 font-extrabold text-black text-right w-[10%] text-[11px]">กำไร (฿)</th>
                        <th className="px-2 py-2 font-extrabold text-black text-right w-[9%] text-[11px]">กำไร%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#c6c6cd]/30">
                      {page.groups.map((group, gIdx) => (
                        <Suspense key={`${group.store.deliveryNumber}-${gIdx}`}>
                          {group.isFirstPageOfStore && (
                            <tr className="bg-[#f0f5ff] border-y border-[#abbfdc]">
                              <td colSpan={9} className="px-2.5 py-2 font-black text-[#0b1c30] text-[10.5px]">
                                <div className="flex justify-between items-center">
                                  <div>
                                    วันที่: {formatDateThai(group.store.deliveryDate)}
                                    <span className="mx-2 text-[#8ba9db] font-normal">|</span>
                                    เลขที่ใบจัดส่ง: {group.store.deliveryNumber}
                                    <span className="mx-2 text-[#8ba9db] font-normal">|</span>
                                    ร้านค้า: {group.store.customerCode} - {group.store.customerName}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                          {group.items.map((item) => (
                            <tr key={item.productSku} className="hover:bg-slate-50/50">
                              <td className="px-2 py-1 font-mono text-slate-500">{item.productSku}</td>
                              <td className="px-2 py-1 font-semibold text-[#0b1c30]">{item.productName}</td>
                              <td className="px-2 py-1 text-right font-mono text-[#0b1c30]">{item.quantity.toLocaleString("th-TH")}</td>
                              <td className="px-2 py-1 text-slate-600">{item.unit}</td>
                              <td className="px-2 py-1 text-right font-mono text-slate-500">{formatMoney(item.costPrice)}</td>
                              <td className="px-2 py-1 text-right font-mono text-slate-500">{formatMoney(item.costPrice * item.quantity)}</td>
                              <td className="px-2 py-1 text-right font-mono text-[#0b1c30]">{formatMoney(item.salesAmount)}</td>
                              <td className={`px-2 py-1 text-right font-mono font-bold ${item.profit >= 0 ? "text-[#006c49]" : "text-[#ba1a1a]"}`}>
                                {formatMoney(item.profit)}
                              </td>
                              <td className={`px-2 py-1 text-right font-mono font-bold ${item.marginPercent >= 0 ? "text-[#006c49]" : "text-[#ba1a1a]"}`}>
                                {formatPercent(item.marginPercent)}
                              </td>
                            </tr>
                          ))}
                          {group.isLastPageOfStore && (
                            <tr className="bg-slate-50 border-b border-[#c6c6cd]">
                              <td colSpan={2} className="px-2 py-1.5 text-right font-black text-black text-[11px]">
                                ยอดรวม | {group.store.deliveryNumber}:
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono font-black bg-slate-50 text-slate-900 text-[11px]">
                                {group.store.totalQuantity.toLocaleString("th-TH")}
                              </td>
                              <td className="px-2 py-1.5 bg-slate-50 font-bold text-slate-600 text-[10px]">
                                {Array.from(new Set(group.store.items.map(item => item.unit).filter(Boolean))).join(", ") || "หน่วย"}
                              </td>
                              <td className="px-2 py-1.5 bg-slate-50"></td>
                              <td className="px-2 py-1.5 text-right font-mono font-black text-slate-600 bg-slate-50 text-[11px]">
                                {formatMoney(group.store.totalCost)}
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono font-black bg-slate-50 text-slate-900 text-[11px]">
                                {formatMoney(group.store.totalSales)}
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono font-black bg-slate-50 text-[#006c49] text-[11px]">
                                {formatMoney(group.store.totalProfit)}
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono font-black text-[#006c49] bg-slate-50 text-[11px]">
                                {formatPercent(group.store.avgMarginPercent)}
                              </td>
                            </tr>
                          )}
                        </Suspense>
                      ))}
                    </tbody>
                    {pageIndex === pages.length - 1 && (
                      <tfoot>
                        <tr className="bg-[#eff4ff] text-[#0b1c30] border-t-2 border-b border-[#8ba9db] font-bold text-[11px]">
                          <td colSpan={2} className="px-2 py-2 text-right font-black text-black text-[11px]">
                            ยอดรวมทั้งหมด ({reportPeriodThai}):
                          </td>
                          <td className="px-2 py-2 text-right font-mono font-black text-black text-[11px]">
                            {report.summary.totalQuantity.toLocaleString("th-TH")}
                          </td>
                          <td className="px-2 py-2 bg-[#eff4ff] font-bold text-slate-600 text-[10px]">
                            {Array.from(new Set(report.stores.flatMap(s => s.items.map(item => item.unit)).filter(Boolean))).join(", ") || "หน่วย"}
                          </td>
                          <td className="px-2 py-2 bg-[#eff4ff]"></td>
                          <td className="px-2 py-2 text-right font-mono font-black text-slate-600 text-[11px]">
                            {formatMoney(report.summary.totalCost)}
                          </td>
                          <td className="px-2 py-2 text-right font-mono font-black text-black text-[11px]">
                            {formatMoney(report.summary.totalSales)}
                          </td>
                          <td className="px-2 py-2 text-right font-mono font-black text-[#006c49] text-[11px]">
                            {formatMoney(report.summary.totalNetProfit)}
                          </td>
                          <td className="px-2 py-2 text-right font-mono font-black text-[#006c49] text-[11px]">
                            {formatPercent(report.summary.avgMarginPercent)}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>

                <div className={styles.printFooter}>
                  พิมพ์จากระบบรายงานวิเคราะห์อัตรากำไรอัตโนมัติ (T&Y Noodle Corporate HQ) - หน้า {pageIndex + 1} / {pages.length}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AppSidebarLayout>
  );
}
