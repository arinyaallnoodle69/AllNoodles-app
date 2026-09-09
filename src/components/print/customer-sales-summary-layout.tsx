import { bahtText } from "@/lib/format/baht-text";
import { PRINT_ORGANIZATION_NAME } from "@/components/print/print-shared";

export type CustomerSalesSummaryStore = {
  customerCode: string;
  customerName: string;
  totalAmount: number;
  orderCount?: number;
};

export type CustomerSalesSummaryData = {
  vehicleId: string;
  vehicleName: string;
  dateLabel: string;
  printedAt: string;
  stores: CustomerSalesSummaryStore[];
  totalAmount: number;
  totalWeightGrams?: number;
  totalOrders?: number;
};

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const ROWS_PER_PAGE = 26;

function formatCurrency(num: number): string {
  return num.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function CustomerSalesSummaryLayout({
  data,
  pageScale = 1,
}: {
  data: CustomerSalesSummaryData;
  pageScale?: number;
}) {
  const storePages =
    data.stores.length === 0
      ? [[]]
      : chunkArray(data.stores, ROWS_PER_PAGE);

  const totalPages = storePages.length;

  return (
    <div className="customer-sales-print-container w-full flex flex-col items-center">
      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }
          @page {
            size: A4 portrait;
            margin: 0;
          }
          body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .customer-sales-page-wrapper {
            width: 210mm !important;
            height: 297mm !important;
            overflow: visible !important;
            box-shadow: none !important;
            background: transparent !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .customer-sales-page-scaler {
            transform: none !important;
            width: 210mm !important;
          }
          .customer-sales-sheet {
            page-break-after: always;
            break-after: page;
            box-shadow: none !important;
            margin: 0 !important;
            width: 210mm !important;
            height: 297mm !important;
            min-height: 297mm !important;
            max-height: 297mm !important;
            transform: none !important;
          }
        }
        @media screen {
          .customer-sales-sheet {
            width: 210mm;
            height: 297mm;
            min-height: 297mm;
            background: #ffffff;
            box-sizing: border-box;
          }
        }
      `}</style>

      {storePages.map((pageStores, pageIndex) => {
        const isLastPage = pageIndex === totalPages - 1;
        const startIndex = pageIndex * ROWS_PER_PAGE;

        return (
          <div key={`page-wrapper-${pageIndex + 1}`} className="flex flex-col items-center mb-6 sm:mb-10 last:mb-0 w-full">
            {totalPages > 1 ? (
              <div className="no-print mb-2 text-xs font-bold text-slate-400">
                หน้า {pageIndex + 1} จาก {totalPages}
              </div>
            ) : null}

            <div
              className="customer-sales-page-wrapper relative overflow-hidden rounded-sm bg-white shadow-[0_40px_100px_rgba(0,0,0,0.6)] ring-1 ring-white/5"
              style={
                pageScale < 1
                  ? {
                      width: `${A4_WIDTH_MM * pageScale}mm`,
                      height: `${A4_HEIGHT_MM * pageScale}mm`,
                      maxWidth: "100%",
                    }
                  : {
                      width: `${A4_WIDTH_MM}mm`,
                      maxWidth: "100%",
                    }
              }
            >
              <div
                className="customer-sales-page-scaler"
                style={{
                  transform: pageScale < 1 ? `scale(${pageScale})` : undefined,
                  transformOrigin: "top left",
                  width: `${A4_WIDTH_MM}mm`,
                }}
              >
                <div
                  key={`page-${pageIndex + 1}`}
                  data-customer-sales-page="true"
                  data-capture-width="794"
                  data-capture-height="1123"
                  className="customer-sales-sheet flex flex-col justify-between bg-white box-border text-slate-900"
                  style={{
                    padding: "14mm 16mm 12mm 16mm",
                    width: "210mm",
                    height: "297mm",
                    minHeight: "297mm",
                    boxSizing: "border-box",
                    fontFamily: 'var(--font-sarabun), "Sarabun", var(--font-noto-sans-thai), sans-serif',
                  }}
                >
                  {/* Top Header Section */}
                  <div>
                    {/* Organization and Document Title */}
                    <div className="border-b-2 border-slate-900 pb-3 mb-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h1 className="text-xl font-extrabold tracking-tight text-[#4A148C]">
                            {PRINT_ORGANIZATION_NAME}
                          </h1>
                          <p className="text-xs font-semibold text-slate-600 mt-0.5">
                            ระบบบริหารจัดการออเดอร์และกระจายสินค้า
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="inline-block rounded-md bg-[#4A148C]/10 px-2.5 py-1 text-xs font-bold text-[#4A148C] border border-[#4A148C]/20">
                            สายรถ: {data.vehicleName}
                          </span>
                        </div>
                      </div>

                <div className="mt-3 text-center">
                  <h2 className="text-lg font-black tracking-wide text-slate-900">
                    รายงานแสดงข้อมูลสรุปยอดขายตามลูกค้า
                  </h2>
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between text-[11px] font-semibold text-slate-600 border-t border-slate-200 pt-2">
                  <div>
                    <span>วันที่: </span>
                    <strong className="text-slate-900 font-bold">{data.dateLabel}</strong>
                  </div>
                  <div>
                    <span>พิมพ์เมื่อ: </span>
                    <strong className="text-slate-900 font-bold">{data.printedAt}</strong>
                  </div>
                  <div>
                    <span>หน้า: </span>
                    <strong className="text-slate-900 font-bold">
                      {pageIndex + 1} / {totalPages}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Table */}
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-100 border-y-2 border-slate-900 text-[12px] font-black text-slate-900">
                    <th className="py-2 px-2 text-center w-[12%] border-r border-slate-300">
                      ลำดับ
                    </th>
                    <th className="py-2 px-3 text-center w-[22%] border-r border-slate-300">
                      รหัสลูกค้า
                    </th>
                    <th className="py-2 px-3 text-left w-[44%] border-r border-slate-300">
                      ชื่อลูกค้า
                    </th>
                    <th className="py-2 px-3 text-right w-[22%]">
                      จำนวนเงินรวม
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-[12px]">
                  {pageStores.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-slate-400 font-semibold">
                        ไม่มีข้อมูลร้านค้าในรายการที่เลือก
                      </td>
                    </tr>
                  ) : (
                    pageStores.map((store, idx) => {
                      const rowNumber = startIndex + idx + 1;
                      const isEven = idx % 2 === 1;

                      return (
                        <tr
                          key={`${store.customerCode}-${rowNumber}`}
                          className={isEven ? "bg-slate-50/70" : "bg-white"}
                        >
                          <td className="py-2 px-2 text-center font-medium text-slate-500 border-r border-slate-200 tabular-nums">
                            {rowNumber}
                          </td>
                          <td className="py-2 px-3 text-center font-bold text-slate-700 border-r border-slate-200 tabular-nums">
                            {store.customerCode}
                          </td>
                          <td className="py-2 px-3 font-semibold text-slate-900 border-r border-slate-200">
                            {store.customerName}
                          </td>
                          <td className="py-2 px-3 text-right font-black text-slate-900 tabular-nums whitespace-nowrap">
                            ฿{formatCurrency(store.totalAmount)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Bottom Footer / Summary Section */}
            <div className="mt-4">
              {isLastPage ? (
                <div className="border-t-2 border-slate-900 pt-3">
                  <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg p-3">
                    <div className="space-y-0.5">
                      <div className="text-xs font-semibold text-slate-600">
                        รวมทั้งหมด:{" "}
                        <strong className="text-slate-900 font-bold">
                          {data.stores.length.toLocaleString("th-TH")}
                        </strong>{" "}
                        ร้านค้า
                        {data.totalOrders ? (
                          <>
                            {" "}
                            ·{" "}
                            <strong className="text-slate-900 font-bold">
                              {data.totalOrders.toLocaleString("th-TH")}
                            </strong>{" "}
                            ออเดอร์
                          </>
                        ) : null}
                        {data.totalWeightGrams && data.totalWeightGrams > 0 ? (
                          <>
                            {" "}
                            · น้ำหนักรวม{" "}
                            <strong className="text-[#4A148C] font-black">
                              {(data.totalWeightGrams / 1000).toLocaleString("th-TH", {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 2,
                              })}
                            </strong>{" "}
                            กก.
                          </>
                        ) : null}
                      </div>
                      <div className="text-[11px] font-bold text-slate-500">
                        ({bahtText(data.totalAmount)})
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs font-black text-slate-700">ยอดเงินรวมทั้งสิ้น</div>
                      <div className="text-xl font-black text-[#4A148C] tabular-nums">
                        ฿{formatCurrency(data.totalAmount)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-[10px] text-slate-400 font-medium">
                    <span>เอกสารสรุปยอดขายภายในองค์กร</span>
                    <span>
                      หน้า {pageIndex + 1} จาก {totalPages}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="border-t border-slate-200 pt-2 flex items-center justify-between text-[10px] text-slate-400 font-medium">
                  <span>(มีต่อหน้าถัดไป)</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
})}
</div>
);
}
