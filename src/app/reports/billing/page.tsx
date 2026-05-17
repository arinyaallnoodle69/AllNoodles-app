import { Suspense } from "react";
import { Filter, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import Link from "next/link";
import { AppSidebarLayout } from "@/components/app-sidebar";
import { MobileSearchDrawer } from "@/components/mobile-search/mobile-search-drawer";
import { PageLoader } from "@/components/page-loader";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";
import { requireAppSession } from "@/lib/auth/authorization";
import { getTodayInBangkok } from "@/lib/orders/date";
import { getBillingReport } from "@/lib/reports/billing";
import { PrintButton } from "../product-sales/print-button";
import styles from "../product-sales/print.module.css";

export const metadata = {
  title: "รายงานใบวางบิล",
};

type PageProps = {
  searchParams: Promise<{
    from?: string;
    to?: string;
    page?: string;
  }>;
};

function formatDateThai(isoDate: string) {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${Number(year) + 543}`;
}

function formatMoney(value: number) {
  return value.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function splitPages<T>(rows: T[], pageSize = 35) {
  const pages: T[][] = [];
  for (let i = 0; i < rows.length; i += pageSize) {
    pages.push(rows.slice(i, i + pageSize));
  }
  return pages;
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

export default async function Page({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<PageLoader />}>
      <BillingContent searchParams={searchParams} />
    </Suspense>
  );
}

async function BillingContent({ searchParams }: PageProps) {
  await requireAppSession();
  const sp = await searchParams;

  const today = getTodayInBangkok();
  const fromDate = sp.from || today;
  const toDate = sp.to || today;
  const pageParam = Number(sp.page) || 1;
  const safeCurrentPage = pageParam < 1 ? 1 : pageParam;

  const report = await getBillingReport(fromDate, toDate);
  const printedAt = formatPrintedAt(new Date());

  const itemsPerPage = 35;
  const totalPages = Math.max(1, Math.ceil(report.rows.length / itemsPerPage));
  const currentPageRows = report.rows.slice(
    (safeCurrentPage - 1) * itemsPerPage,
    safeCurrentPage * itemsPerPage
  );

  const pages = splitPages(report.rows, 35);

  return (
    <AppSidebarLayout>
      <div className="flex flex-col h-full bg-slate-50/50">
        <div className="flex-1 space-y-4 md:space-y-6 p-4 sm:p-6 md:p-8">
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-sm">
                <FileText className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-[#003366] md:text-3xl">รายงานใบวางบิล</h1>
                <p className="text-xs font-semibold text-slate-500 md:text-sm">
                  ข้อมูลสรุปการวางบิลแยกตามร้านค้า
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <MobileSearchDrawer>
                <button className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-600 shadow-sm border border-slate-200 active:bg-slate-50 md:hidden">
                  <Filter className="h-5 w-5" />
                </button>
              </MobileSearchDrawer>

              <PrintButton
                targetId="report-print-area"
                fileName={`รายงานใบวางบิล_${fromDate}_ถึง_${toDate}`}
              />
            </div>
          </div>

          {/* Search Form (Desktop) */}
          <div className="hidden bg-white shadow-2xl border border-slate-100 p-5 sm:rounded-sm md:block">
            <form action="/reports/billing" method="get">
              <div className="flex flex-wrap items-end gap-3">
                <div className="w-[180px]">
                  <label className="mb-1 block text-xs font-bold text-slate-500">เริ่มวันที่</label>
                  <ThaiDatePicker id="from" name="from" defaultValue={fromDate} />
                </div>
                <div className="w-[180px]">
                  <label className="mb-1 block text-xs font-bold text-slate-500">ถึงวันที่</label>
                  <ThaiDatePicker id="to" name="to" defaultValue={toDate} />
                </div>
                <button
                  type="submit"
                  className="flex h-10 items-center gap-2 rounded-lg bg-[#003366] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#002244] active:bg-[#001122]"
                >
                  <Filter className="h-4 w-4" />
                  ค้นหา
                </button>
              </div>
            </form>
          </div>

          {/* Content Area */}
          <div className="flex-1">
            {report.rows.length > 0 ? (
              <div className="bg-white shadow-2xl border border-slate-100 sm:rounded-sm">
                
                {/* Mobile View: Cards */}
                <div className="block md:hidden space-y-3 p-4">
                  {currentPageRows.map((row, index) => (
                    <div key={row.id} className="bg-white p-4 rounded-lg shadow-sm border border-slate-150">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-slate-500">#{(safeCurrentPage - 1) * itemsPerPage + index + 1}</span>
                        <span className="text-xs font-semibold text-slate-400">{formatDateThai(row.billingDate)}</span>
                      </div>
                      <div className="mb-2">
                        <div className="text-sm font-bold text-slate-900">{row.customerName}</div>
                        <div className="text-xs font-semibold text-slate-500">รหัส: {row.customerCode}</div>
                      </div>
                      <div className="flex justify-between items-center border-t pt-2 mt-2">
                        <span className="text-sm font-bold text-slate-500">จำนวนเงิน</span>
                        <span className="text-lg font-black text-emerald-600">฿{formatMoney(row.totalAmount)}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop View: Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full table-fixed border-collapse">
                    <colgroup>
                      <col style={{ width: "5%" }} />
                      <col style={{ width: "15%" }} />
                      <col style={{ width: "15%" }} />
                      <col style={{ width: "45%" }} />
                      <col style={{ width: "20%" }} />
                    </colgroup>
                    <thead>
                      <tr className="bg-[#003366]">
                        {["#", "วันที่", "รหัสร้าน", "ชื่อร้าน", "จำนวนเงิน"].map((label, idx) => (
                          <th
                            key={label}
                            className={`px-1.5 py-2 text-center text-[9px] leading-none font-black uppercase tracking-[0.02em] text-white sm:px-2 sm:text-[10px] md:py-3 md:text-[11px] md:tracking-[0.08em] ${idx === 0 ? "md:!text-center" : ""} ${idx === 1 || idx === 2 || idx === 3 ? "md:!text-left" : ""} ${idx === 4 ? "md:!text-right md:px-4" : "md:px-3"}`}
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#003366]/25">
                      {currentPageRows.map((row, index) => {
                        return (
                          <tr key={row.id} className="odd:bg-white even:bg-slate-50/50">
                            <td className="px-1.5 py-1.5 text-center text-[10px] font-bold text-slate-700 sm:px-2 sm:text-[11px] md:px-3 md:py-2 md:text-sm">
                              {(safeCurrentPage - 1) * itemsPerPage + index + 1}
                            </td>
                            <td className="px-1.5 py-1.5 text-[10px] font-bold text-slate-900 sm:px-2 sm:text-[11px] md:px-3 md:py-2 md:text-sm">
                              {formatDateThai(row.billingDate)}
                            </td>
                            <td className="px-1.5 py-1.5 text-[10px] font-bold text-slate-600 sm:px-2 sm:text-[11px] md:px-3 md:py-2 md:text-sm">
                              {row.customerCode}
                            </td>
                            <td className="px-1.5 py-1.5 text-[10px] font-bold text-slate-900 sm:px-2 sm:text-[11px] md:px-3 md:py-2 md:text-sm">
                              {row.customerName}
                            </td>
                            <td className="px-1.5 py-1.5 text-right text-[10px] font-black tabular-nums text-slate-900 sm:px-2 sm:text-[11px] md:px-4 md:py-2 md:text-sm">
                              {formatMoney(row.totalAmount)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {safeCurrentPage === totalPages && report.rows.length > 0 && (
                      <tfoot>
                        <tr className="bg-slate-100">
                          <td colSpan={4} className="px-1.5 py-1.5 text-right text-[10px] font-black text-slate-700 sm:px-2 sm:text-[11px] md:px-3 md:py-2 md:text-sm">รวมทั้งหมด</td>
                          <td className="px-1.5 py-1.5 text-right text-[10px] font-black tabular-nums text-slate-900 sm:px-2 sm:text-[11px] md:px-4 md:py-2 md:text-sm">{formatMoney(report.summary.totalAmount)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 p-4 sm:p-0 sm:pt-4">
                    <Link
                      href={`/reports/billing?from=${fromDate}&to=${toDate}&page=${safeCurrentPage - 1}`}
                      className={`flex items-center gap-1 text-sm font-bold text-[#003366] transition ${safeCurrentPage === 1 ? "pointer-events-none opacity-30" : "hover:text-[#002244]"}`}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      ก่อนหน้า
                    </Link>
                    <span className="text-sm font-semibold text-slate-500">
                      หน้า {safeCurrentPage} / {totalPages}
                    </span>
                    <Link
                      href={`/reports/billing?from=${fromDate}&to=${toDate}&page=${safeCurrentPage + 1}`}
                      className={`flex items-center gap-1 text-sm font-bold text-[#003366] transition ${safeCurrentPage === totalPages ? "pointer-events-none opacity-30" : "hover:text-[#002244]"}`}
                    >
                      ถัดไป
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white shadow-2xl border border-slate-100 p-6 text-center text-slate-400 sm:rounded-sm">
                ไม่พบข้อมูลการวางบิลในช่วงวันที่ที่เลือก
              </div>
            )}
          </div>
        </div>

        {/* Print Area */}
        <div id="report-print-area" className="fixed -left-[9999px] top-0 opacity-0 pointer-events-none print:static print:opacity-100 print:pointer-events-auto print:block">
          {pages.map((rows, pageIndex) => (
            <div key={pageIndex} data-print-page="true" className={`${styles.printArea} ${styles.printPage}`}>
              <div className={styles.printHeader}>
                <div className="mb-1 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/ty-noodles-logo-cropped.png" alt="T&Y Noodle" width={40} height={40} className="h-10 w-10 object-contain" />
                    <div>
                      <p className="text-sm font-black leading-tight text-[#003366]">T&Y Noodle</p>
                      <p className="text-[10px] font-semibold text-slate-500">ระบบรายงานใบวางบิล</p>
                    </div>
                  </div>
                  <div className="text-right text-[10px] font-semibold text-slate-500">
                    <p>วันที่พิมพ์: {printedAt.datePart}</p>
                    <p>เวลา: {printedAt.timePart} น.</p>
                    <p>หน้า: {pageIndex + 1} / {pages.length}</p>
                  </div>
                </div>
                <p className="text-base font-black text-[#003366]">รายงานใบวางบิล</p>
                <p className="text-xs font-semibold text-slate-600">
                  ช่วงวันที่ {formatDateThai(fromDate)} — {formatDateThai(toDate)}
                </p>
              </div>

              <table className="w-full table-fixed border-collapse">
                <colgroup>
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "15%" }} />
                  <col style={{ width: "15%" }} />
                  <col style={{ width: "42%" }} />
                  <col style={{ width: "20%" }} />
                </colgroup>
                <thead>
                  <tr className="bg-[#003366]">
                    {["#", "วันที่", "รหัสร้าน", "ชื่อร้าน", "จำนวนเงิน"].map((label, idx) => (
                      <th key={label} className={`px-2 py-1 text-[10px] leading-none font-black tracking-wide text-white ${idx === 0 ? "text-center" : "text-left"} ${idx === 4 ? "text-right" : ""}`}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    return (
                      <tr key={row.id} className="border-b border-slate-200">
                        <td className="px-2 py-1.5 text-center text-[11px] font-semibold">{pageIndex * 35 + index + 1}</td>
                        <td className="px-2 py-1.5 text-[11px] font-semibold">{formatDateThai(row.billingDate)}</td>
                        <td className="px-2 py-1.5 text-[11px] font-semibold">{row.customerCode}</td>
                        <td className="px-2 py-1.5 text-[11px] font-semibold">{row.customerName}</td>
                        <td className="px-2 py-1.5 text-right text-[11px] font-semibold tabular-nums">{formatMoney(row.totalAmount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {pageIndex === pages.length - 1 ? (
                  <tfoot>
                    <tr className="bg-slate-100">
                      <td colSpan={4} className="px-2 py-2 text-right text-[11px] font-black">รวมทั้งหมด</td>
                      <td className="px-2 py-2 text-right text-[11px] font-black tabular-nums">{formatMoney(report.summary.totalAmount)}</td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
              <div className={styles.printFooter}>
                พิมพ์จากระบบรายงานอัตโนมัติ (T&Y Noodle) - หน้า {pageIndex + 1} / {pages.length}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppSidebarLayout>
  );
}
