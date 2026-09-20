import type { BillingStatementData } from "@/lib/billing/billing-statement";
import { bahtText } from "@/lib/format/baht-text";
import { chunkItems, fmt } from "@/components/print/print-shared";

export const BILLING_A4_WIDTH_MM = 210;
export const BILLING_A4_HEIGHT_MM = 297;
const ROWS_PER_BILL_PAGE = 18;
const MIN_TABLE_BODY_ROWS = 18;

export type BillingInvoiceRow = {
  lineNumber: number;
  deliveryNumber: string;
  deliveryDate: string;
  totalAmount: number;
};

export type BillingInvoicePageModel = {
  key: string;
  customer: { code: string; name: string; address: string };
  organization: { name: string; address: string; phone: string };
  billingNumber: string | null;
  billingDate: string;
  rows: BillingInvoiceRow[];
  grandTotal: number;
  pageIndex: number;
  totalPages: number;
  isLastPage: boolean;
};

function displayAddress(address: string | null | undefined) {
  const trimmed = address?.trim();
  if (!trimmed || trimmed.toLowerCase() === "unknown" || trimmed.toLowerCase() === "unknow") {
    return "";
  }
  return trimmed;
}

export function formatBillingDocDate(iso: string) {
  const [yearText, monthText, dayText] = iso.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return iso;
  }

  return `${day}/${month}/${year + 543}`;
}

function buildPagesForStatement(data: BillingStatementData): BillingInvoicePageModel[] {
  const chunks = chunkItems(data.rows, ROWS_PER_BILL_PAGE);
  const pages = chunks.length > 0 ? chunks : [[]];
  const totalPages = pages.length;

  return pages.map((rows, pageIndex) => ({
    key: `${data.customer.code}-page-${pageIndex + 1}`,
    customer: {
      code: data.customer.code,
      name: data.customer.name,
      address: displayAddress(data.customer.address),
    },
    organization: data.organization,
    billingNumber: data.billingNumber,
    billingDate: data.billingDate,
    rows,
    grandTotal: data.grandTotal,
    pageIndex,
    totalPages,
    isLastPage: pageIndex === totalPages - 1,
  }));
}

export function buildBillingInvoicePages(
  data: BillingStatementData | BillingStatementData[],
): BillingInvoicePageModel[] {
  const dataList = Array.isArray(data) ? data : [data];
  return dataList.flatMap((item) => buildPagesForStatement(item));
}

export function BillingInvoicePage({
  page,
  logoDataUrl,
  captureClassName = "billing-invoice-page",
}: {
  page: BillingInvoicePageModel;
  logoDataUrl?: string;
  captureClassName?: string;
}) {
  // logoDataUrl is omitted from render in the new logo-free design
  void logoDataUrl;

  const { rows, isLastPage, grandTotal } = page;
  
  // Calculate summary row height and empty rows to keep uniform height
  const summaryRowHeight = isLastPage ? 1 : 0;
  const fillerRowCount = isLastPage
    ? Math.max(0, MIN_TABLE_BODY_ROWS - rows.length - summaryRowHeight)
    : Math.max(0, ROWS_PER_BILL_PAGE - rows.length);

  return (
    <main
      className={`${captureClassName} billing-invoice-sheet`}
      data-print-page="true"
    >
      <header className="billing-invoice-header">
        <div className="billing-new-brand-text">
          อรินยา พาณิชย์
        </div>
        <div className="billing-invoice-title-box">
          <h2 className="billing-invoice-title">ใบวางบิล เครดิต</h2>
        </div>
      </header>

      <section className="billing-invoice-meta">
        <div className="billing-invoice-meta-left">
          <p>
            <strong>เลขประจำตัวผู้เสียภาษีอากร :</strong> &nbsp; / สำนักงานใหญ่
          </p>
          <p>
            <strong>รหัสลูกค้า :</strong> {page.customer.code}
          </p>
          <p className="billing-customer-name">
            <strong>ชื่อลูกค้า :</strong> {page.customer.name}
          </p>
          <p>
            <strong>ที่อยู่ :</strong> {page.customer.address || "-"}
          </p>
        </div>
        <div className="billing-invoice-meta-right">
          <div className="billing-invoice-meta-row">
            <span className="billing-invoice-meta-label">เลขที่เอกสาร :</span>
            <span>{page.billingNumber ?? "-"}</span>
          </div>
          <div className="billing-invoice-meta-row">
            <span className="billing-invoice-meta-label">วันที่ :</span>
            <span>{formatBillingDocDate(page.billingDate)}</span>
          </div>
          {page.totalPages > 1 ? (
            <div className="billing-invoice-meta-row">
              <span className="billing-invoice-meta-label">หน้า :</span>
              <span>
                {page.pageIndex + 1}/{page.totalPages}
              </span>
            </div>
          ) : null}
        </div>
      </section>

      <section className="billing-invoice-table-wrap">
        <table className="billing-invoice-table">
          <thead>
            <tr>
              <th className="billing-col-seq">ลำดับ</th>
              <th className="billing-col-number">เลขที่บิล</th>
              <th className="billing-col-date">ลงวันที่</th>
              <th className="billing-col-amount">จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.deliveryNumber}-${row.lineNumber}`}>
                <td className="billing-cell-center">{row.lineNumber}</td>
                <td className="billing-cell-number">{row.deliveryNumber}</td>
                <td className="billing-cell-center">{formatBillingDocDate(row.deliveryDate)}</td>
                <td className="billing-cell-amount">{fmt(row.totalAmount)}</td>
              </tr>
            ))}
            {Array.from({ length: fillerRowCount }).map((_, index) => (
              <tr key={`filler-${index}`} className="billing-invoice-filler-row">
                <td className="billing-cell-center">&nbsp;</td>
                <td className="billing-cell-number">&nbsp;</td>
                <td className="billing-cell-center">&nbsp;</td>
                <td className="billing-cell-amount">&nbsp;</td>
              </tr>
            ))}
            
            {/* Total / Summary row inside table body */}
            {isLastPage && (
              <tr className="billing-summary-row">
                <td colSpan={2} className="billing-summary-baht">({bahtText(grandTotal)})</td>
                <td className="billing-summary-label">
                  <div className="billing-summary-total-label">Total</div>
                  <div className="billing-summary-total-sub">รวมเงิน</div>
                </td>
                <td className="billing-summary-value">{fmt(grandTotal)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Footer box below the table */}
      {isLastPage && (
        <div className="billing-new-footer">
          <div className="billing-footer-box">
            <div className="billing-footer-left">
              <div className="billing-payment-row">
                PAYMENT METHOD ช่องทางชำระเงิน
              </div>
              
              <div className="billing-payment-row gap-4 mt-1">
                <label className="flex items-center gap-2">
                  <span className="billing-checkbox" />
                  CASH เงินสด
                </label>
              </div>

              <div className="billing-payment-row gap-2 mt-1">
                <label className="flex items-center gap-2 shrink-0">
                  <span className="billing-checkbox" />
                  TRANSFER โอนเงิน เข้าธนาคาร
                </label>
                <span className="billing-dotted-line" style={{ width: "120px", flexGrow: 0 }} />
              </div>

              <div className="billing-payment-row gap-2 mt-1">
                <span className="pl-6 shrink-0">วันที่โอน</span>
                <span className="billing-dotted-line" style={{ width: "110px", flexGrow: 0 }} />
                <span className="shrink-0">เวลาที่โอน</span>
                <span className="billing-dotted-line" style={{ width: "80px", flexGrow: 0 }} />
              </div>

              <div className="billing-payment-row justify-end mt-1 pr-[20px]">
                จำนวนเงิน <span className="billing-dotted-line" style={{ width: "180px", flexGrow: 0 }} />
              </div>
            </div>

            <div className="billing-footer-right">
              <div className="billing-signature-title">
                ในนาม อรินยา พาณิชย์
              </div>
              
              <div className="billing-signature-lines">
                <div className="billing-sig-line-row">
                  <span>พนักงานเก็บเงิน</span>
                  <span className="billing-dotted-line w-[150px]" />
                </div>
                <div className="billing-sig-line-row">
                  <span>ผู้อนุมัติ</span>
                  <span className="billing-dotted-line w-[150px]" />
                </div>
              </div>
            </div>
          </div>
          
          <div className="billing-powered-by">
            Powered By SeniorSoft
          </div>
        </div>
      )}
    </main>
  );
}

let cachedFontEmbedCSS: string | null = null;

export async function getBillingFontEmbedCSS(): Promise<string> {
  if (typeof window === "undefined") return "";
  if (cachedFontEmbedCSS) return cachedFontEmbedCSS;

  try {
    const fetchFontAsBase64 = async (url: string): Promise<string> => {
      const res = await fetch(url);
      const blob = await res.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    };

    const [regularBase64, boldBase64] = await Promise.race([
      Promise.all([
        fetchFontAsBase64("/fonts/angsana-new/ANGSA.woff"),
        fetchFontAsBase64("/fonts/angsana-new/angsab.woff"),
      ]),
      new Promise<never>((_, reject) =>
        window.setTimeout(() => reject(new Error("Font load timeout")), 2500),
      ),
    ]);

    cachedFontEmbedCSS = `
      @font-face {
        font-family: "Angsana New Delivery Note";
        src: url("${regularBase64}") format("woff");
        font-weight: 400;
        font-style: normal;
      }
      @font-face {
        font-family: "Angsana New Delivery Note";
        src: url("${boldBase64}") format("woff");
        font-weight: 700 900;
        font-style: normal;
      }
    `;
    return cachedFontEmbedCSS;
  } catch (err) {
    console.warn("getBillingFontEmbedCSS failed, skipping font embed:", err);
    return "";
  }
}

export const BILLING_INVOICE_STYLES = `
  @page { size: A4 portrait; margin: 0; }

  @font-face {
    font-family: "Angsana New Delivery Note";
    src: url("/fonts/angsana-new/ANGSA.woff") format("woff");
    font-weight: 400;
    font-style: normal;
    font-display: swap;
  }

  @font-face {
    font-family: "Angsana New Delivery Note";
    src: url("/fonts/angsana-new/angsab.woff") format("woff");
    font-weight: 700;
    font-style: normal;
    font-display: swap;
  }

  @font-face {
    font-family: "Angsana New Delivery Note";
    src: url("/fonts/angsana-new/angsab.woff") format("woff");
    font-weight: 800 900;
    font-style: normal;
    font-display: swap;
  }

  .billing-invoice-sheet {
    width: ${BILLING_A4_WIDTH_MM}mm;
    height: ${BILLING_A4_HEIGHT_MM}mm;
    max-height: ${BILLING_A4_HEIGHT_MM}mm;
    overflow: hidden;
    box-sizing: border-box;
    background: #ffffff;
    padding: 7mm 8mm;
    color: #000000;
    font-family: "Angsana New Delivery Note", "Sarabun", "Noto Sans Thai", sans-serif;
    font-synthesis: none;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: geometricPrecision;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .billing-invoice-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 4mm;
    margin-bottom: 2.5mm;
  }

  .billing-new-brand-text {
    font-size: 25pt;
    line-height: 1.2;
    font-weight: bold;
    white-space: nowrap;
    color: #000000;
  }

  .billing-invoice-title-box {
    width: 70mm;
    border: 1.5px solid #000000;
    padding: 1.5mm 3mm;
    text-align: center;
    box-sizing: border-box;
  }

  .billing-invoice-title {
    margin: 0;
    font-size: 21pt;
    line-height: 1.2;
    font-weight: bold;
    color: #000000;
  }

  .billing-invoice-meta {
    display: flex;
    border: 1.5px solid #000000;
    margin-bottom: 2.5mm;
    font-size: 16pt;
    line-height: 1.25;
    color: #000000;
  }

  .billing-invoice-meta-left {
    width: 58%;
    box-sizing: border-box;
    padding: 2mm 3.5mm;
    border-right: 1.5px solid #000000;
    display: flex;
    flex-direction: column;
    gap: 1mm;
  }

  .billing-invoice-meta-left p {
    margin: 0;
    font-size: 16pt;
    line-height: 1.25;
  }

  .billing-customer-name {
    font-size: 20pt !important;
    font-weight: bold;
  }

  .billing-invoice-meta-right {
    width: 42%;
    box-sizing: border-box;
    padding: 2mm 3.5mm;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 1.5mm;
  }

  .billing-invoice-meta-row {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 2mm;
    font-size: 17.5pt;
    font-weight: bold;
    line-height: 1.2;
  }

  .billing-invoice-meta-row > span:last-child {
    min-width: 0;
    text-align: right;
    white-space: nowrap;
  }

  .billing-invoice-meta-label {
    font-size: 16pt;
    font-weight: bold;
    white-space: nowrap;
    line-height: 1.2;
  }

  .billing-invoice-table-wrap {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
  }

  .billing-invoice-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 18pt;
    line-height: 1.12;
    border: 1.5px solid #000000;
    table-layout: fixed;
    color: #000000;
  }

  .billing-invoice-table th {
    height: 8mm;
    border: 1.2px solid #000000;
    background-color: #f1f5f9;
    padding: 0.6mm 1mm;
    font-size: 15.5pt;
    font-weight: 800;
    text-align: center;
    line-height: 1.2;
    color: #000000;
  }

  .billing-invoice-table td {
    height: 8mm;
    border-left: 1.2px solid #000000;
    border-right: 1.2px solid #000000;
    padding: 0.2mm 2.5mm;
    vertical-align: middle;
    font-weight: bold;
    color: #000000;
  }

  .billing-col-seq { width: 12%; text-align: center; }
  .billing-col-number { width: 38%; text-align: center; }
  .billing-col-date { width: 25%; text-align: center; }
  .billing-col-amount { width: 25%; text-align: right; }

  .billing-cell-center {
    text-align: center;
    font-weight: bold;
  }

  .billing-cell-number {
    text-align: center;
    font-weight: bold;
  }

  .billing-cell-amount {
    text-align: right;
    font-weight: bold;
    font-variant-numeric: tabular-nums;
  }

  .billing-invoice-filler-row td {
    height: 7.8mm;
    padding: 0;
  }

  /* Net total summary row */
  .billing-summary-row td {
    border-top: 1.5px solid #000000;
    border-bottom: 1.5px solid #000000;
    height: 9mm;
    font-weight: bold;
    vertical-align: middle;
    color: #000000;
  }

  .billing-summary-baht {
    text-align: center;
    font-size: 16pt;
    font-weight: bold;
    line-height: 1.2;
  }

  .billing-summary-label {
    text-align: center;
    background-color: #f1f5f9;
    border-left: 1.2px solid #000000 !important;
    border-right: 1.2px solid #000000 !important;
    line-height: 1.1;
  }

  .billing-summary-total-label {
    font-weight: bold;
    font-size: 14pt;
    line-height: 1.1;
  }

  .billing-summary-total-sub {
    font-weight: bold;
    font-size: 12pt;
    line-height: 1.1;
  }

  .billing-summary-value {
    text-align: right;
    font-size: 19pt;
    font-weight: bold;
    padding-right: 2.5mm !important;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  /* Footer box below the table */
  .billing-new-footer {
    margin-top: 2.5mm;
    flex: 0 0 auto;
  }

  .billing-footer-box {
    display: flex;
    border: 1.5px solid #000000;
    font-size: 15pt;
    color: #000000;
  }

  .billing-footer-left {
    width: 60%;
    border-right: 1.5px solid #000000;
    padding: 2mm 3.5mm;
    display: flex;
    flex-direction: column;
    gap: 1.2mm;
    justify-content: space-between;
  }

  .billing-footer-right {
    width: 40%;
    padding: 2.5mm 3.5mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    height: 42mm;
    box-sizing: border-box;
  }

  .billing-payment-row {
    display: flex;
    align-items: flex-end;
    width: 100%;
    font-size: 15pt;
    font-weight: bold;
    line-height: 1.2;
    white-space: nowrap;
  }

  .billing-dotted-line {
    border-bottom: 1.2px solid #000000;
    margin-bottom: 2px;
    margin-left: 2mm;
    flex-grow: 1;
  }

  .w-\\[160px\\] { width: 160px; flex-grow: 0; }
  .w-\\[110px\\] { width: 110px; flex-grow: 0; }
  .w-\\[180px\\] { width: 180px; flex-grow: 0; }
  .w-\\[150px\\] { width: 150px; flex-grow: 0; }

  .billing-checkbox {
    display: inline-block;
    width: 13px;
    height: 13px;
    border: 1.2px solid #000000;
    background-color: transparent;
    flex-shrink: 0;
  }

  .billing-signature-title {
    font-size: 16pt;
    font-weight: bold;
    text-align: center;
    width: 100%;
    line-height: 1.2;
  }

  .billing-signature-lines {
    display: flex;
    flex-direction: column;
    gap: 2.5mm;
    margin-top: auto;
  }

  .billing-sig-line-row {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    font-size: 15pt;
    font-weight: bold;
    line-height: 1.2;
    white-space: nowrap;
  }

  .billing-powered-by {
    text-align: right;
    font-size: 11pt;
    line-height: 1.2;
    color: #000000;
    margin-top: 1mm;
  }

  @media print {
    html, body {
      width: ${BILLING_A4_WIDTH_MM}mm;
      min-height: ${BILLING_A4_HEIGHT_MM}mm;
    }

    body {
      margin: 0;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    .no-print { display: none !important; }

    .billing-invoice-page-shell {
      box-shadow: none !important;
      border: none !important;
      page-break-after: always;
      break-after: page;
    }

    .billing-invoice-page-shell:last-child {
      page-break-after: avoid;
      break-after: auto;
    }
  }

  @media screen {
    body {
      background: #e5e7eb;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 32px 16px;
      gap: 24px;
    }

    .billing-invoice-page-shell {
      border: 1px solid #d1d5db;
      box-shadow: 0 4px 32px rgba(0, 0, 0, 0.12);
    }
  }

  .billing-invoice-page-shell,
  .billing-invoice-page-shell * {
    color: #000000 !important;
  }
`;

export function BillingStatementLayout({
  data,
  logoDataUrl,
}: {
  data: BillingStatementData | BillingStatementData[];
  showIntermediateFooter?: boolean;
  logoDataUrl?: string;
}) {
  const pages = buildBillingInvoicePages(data);

  return (
    <>
      <style>{BILLING_INVOICE_STYLES}</style>
      {pages.map((page) => (
        <div key={page.key} className="billing-invoice-page-shell">
          <BillingInvoicePage page={page} logoDataUrl={logoDataUrl} captureClassName="billing-invoice-page" />
        </div>
      ))}
    </>
  );
}
