import type { BillingStatementData } from "@/lib/billing/billing-statement";
import { bahtText } from "@/lib/format/baht-text";
import { PRINT_ORGANIZATION_NAME, chunkItems, fmt } from "@/components/print/print-shared";

export const BILLING_A4_WIDTH_MM = 210;
export const BILLING_A4_HEIGHT_MM = 297;
const ROWS_PER_BILL_PAGE = 24;
const MIN_TABLE_BODY_ROWS = 22;
const LOGO_SRC = "/brand/512x512.png";

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
  const { rows, isLastPage, grandTotal } = page;
  const fillerRowCount = isLastPage
    ? Math.max(0, MIN_TABLE_BODY_ROWS - rows.length)
    : Math.max(0, ROWS_PER_BILL_PAGE - rows.length);

  return (
    <main
      className={`${captureClassName} billing-invoice-sheet`}
      data-print-page="true"
    >
      <header className="billing-invoice-header">
        <div className="billing-invoice-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoDataUrl || LOGO_SRC} alt={PRINT_ORGANIZATION_NAME} className="billing-invoice-logo" />
          <h1 className="billing-invoice-org-name">{PRINT_ORGANIZATION_NAME}</h1>
        </div>
        <div className="billing-invoice-title-box">
          <h2 className="billing-invoice-title">ใบวางบิล เครดิต</h2>
        </div>
      </header>

      <section className="billing-invoice-meta">
        <div className="billing-invoice-meta-left">
          <p>
            <strong>เลขประจำตัวผู้เสียภาษีอากร :</strong> - / สำนักงานใหญ่
          </p>
          <p>
            <strong>รหัสลูกค้า :</strong> {page.customer.code}
          </p>
          <p>
            <strong>ชื่อลูกค้า :</strong> {page.customer.name}
          </p>
          <p>
            <strong>ที่อยู่ :</strong> {page.customer.address}
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
              <th className="billing-col-number">เลขที่ใบจัดส่ง</th>
              <th className="billing-col-date">วันที่</th>
              <th className="billing-col-amount">ยอดรวม</th>
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
          </tbody>
        </table>
      </section>

      {isLastPage ? (
        <footer className="billing-invoice-footer">
          <div className="billing-invoice-total-row">
            <div className="billing-invoice-total-words">({bahtText(grandTotal)})</div>
            <div className="billing-invoice-total-label">
              <span>Total</span>
              <span className="billing-invoice-total-sub">รวมเงิน</span>
            </div>
            <div className="billing-invoice-total-amount">{fmt(grandTotal)}</div>
          </div>
        </footer>
      ) : null}
    </main>
  );
}

export const BILLING_INVOICE_STYLES = `
  @page { size: A4 portrait; margin: 0; }

  .billing-invoice-sheet {
    width: ${BILLING_A4_WIDTH_MM}mm;
    min-height: ${BILLING_A4_HEIGHT_MM}mm;
    box-sizing: border-box;
    background: #ffffff;
    padding: 6mm;
    color: #000000;
    font-family: var(--font-sarabun), "Sarabun", "Tahoma", sans-serif;
    display: flex;
    flex-direction: column;
  }

  .billing-invoice-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 4mm;
    margin-bottom: 6mm;
  }

  .billing-invoice-brand {
    display: flex;
    align-items: flex-start;
    gap: 3mm;
    width: 50%;
    min-width: 0;
  }

  .billing-invoice-logo {
    width: 14mm;
    height: 14mm;
    object-fit: contain;
    flex: 0 0 auto;
  }

  .billing-invoice-org-name {
    font-size: 14pt;
    font-weight: 700;
    line-height: 1.2;
    margin: 0;
  }

  .billing-invoice-title-box {
    width: 33%;
    border: 2px solid #000000;
    padding: 4mm;
    text-align: center;
    box-sizing: border-box;
  }

  .billing-invoice-title {
    margin: 0;
    font-size: 14pt;
    font-weight: 700;
    letter-spacing: 0.08em;
  }

  .billing-invoice-meta {
    display: flex;
    border: 1px solid #000000;
    margin-bottom: 0;
    font-size: 10pt;
    line-height: 1.35;
  }

  .billing-invoice-meta-left {
    width: 66.666%;
    padding: 2mm;
    border-right: 1px solid #000000;
  }

  .billing-invoice-meta-left p {
    margin: 0 0 1mm;
  }

  .billing-invoice-meta-left p:last-child {
    margin-bottom: 0;
  }

  .billing-invoice-meta-right {
    width: 33.333%;
    padding: 2mm;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 1mm;
  }

  .billing-invoice-meta-row {
    display: flex;
    justify-content: space-between;
    gap: 2mm;
  }

  .billing-invoice-meta-label {
    font-weight: 700;
    white-space: nowrap;
  }

  .billing-invoice-table-wrap {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    border-left: 1px solid #000000;
    border-right: 1px solid #000000;
  }

  .billing-invoice-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10pt;
    table-layout: fixed;
    flex: 1 1 auto;
  }

  .billing-invoice-table th,
  .billing-invoice-table td {
    border-top: none;
    border-bottom: none;
    border-left: none;
    border-right: 1px solid #000000;
  }

  .billing-invoice-table th:last-child,
  .billing-invoice-table td:last-child {
    border-right: none;
  }

  .billing-invoice-table thead th {
    padding: 1.5mm 2mm;
    text-align: center;
    font-weight: 700;
  }

  .billing-col-seq { width: 12%; }
  .billing-col-number { width: 38%; }
  .billing-col-date { width: 22%; }
  .billing-col-amount { width: 28%; }

  .billing-invoice-table tbody td {
    padding: 1.2mm 2mm;
    vertical-align: top;
  }

  .billing-invoice-filler-row td {
    height: 7mm;
    padding: 0 2mm;
    vertical-align: top;
  }

  .billing-cell-center {
    text-align: center;
  }

  .billing-cell-number {
    padding-left: 4mm !important;
    font-family: monospace;
    font-weight: 700;
  }

  .billing-cell-amount {
    text-align: right;
    padding-right: 4mm !important;
    font-weight: 700;
  }

  .billing-invoice-footer {
    margin-top: 0;
  }

  .billing-invoice-total-row {
    display: flex;
    border: 1px solid #000000;
    font-size: 10pt;
    font-weight: 700;
  }

  .billing-invoice-total-words {
    width: 66.666%;
    padding: 2mm;
    text-align: center;
    border-right: 1px solid #000000;
    font-style: italic;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .billing-invoice-total-label {
    width: 11.2%;
    padding: 2mm;
    text-align: center;
    border-right: 1px solid #000000;
    display: flex;
    flex-direction: column;
    justify-content: center;
    line-height: 1.1;
  }

  .billing-invoice-total-sub {
    font-size: 8pt;
    font-weight: 400;
  }

  .billing-invoice-total-amount {
    flex: 1 1 auto;
    padding: 2mm;
    text-align: right;
    display: flex;
    align-items: center;
    justify-content: flex-end;
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
