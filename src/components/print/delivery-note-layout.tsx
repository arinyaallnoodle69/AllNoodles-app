import type { DeliveryNotePrintData } from "@/lib/delivery/print";
import { bahtText } from "@/lib/format/baht-text";
import { chunkItems, fmt } from "@/components/print/print-shared";
import { DeliveryNoteScaler } from "./delivery-note-scaler";
import { fitDeliveryItemFontSize } from "./delivery-note-font-fit";

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const ITEMS_PER_NOTE_PAGE = 20;
const PAGE_PADDING_MM = 5;

type DeliveryNotePage = {
  key: string;
  dn: DeliveryNotePrintData;
  items: DeliveryNotePrintData["items"];
  pageIndex: number;
  totalPages: number;
};

export type PriceDisplayMode = "all" | "total_only" | "none";

type Props = {
  dns: DeliveryNotePrintData[];
  showIntermediateFooter?: boolean;
  logoDataUrl?: string;
  showAmount?: boolean;
  priceMode?: PriceDisplayMode;
  isEmbedded?: boolean;
};

function resolvePriceMode(priceMode?: PriceDisplayMode, showAmount?: boolean): PriceDisplayMode {
  if (priceMode) return priceMode;
  if (showAmount === false) return "total_only";
  return "all";
}

function buildNotePages(dns: DeliveryNotePrintData[]) {
  return dns.flatMap<DeliveryNotePage>((dn) => {
    const pages = chunkItems(dn.items, ITEMS_PER_NOTE_PAGE);
    const totalPages = pages.length || 1;

    return (pages.length ? pages : [[]]).map((items, pageIndex) => ({
      key: `${dn.deliveryNumber}-${pageIndex + 1}`,
      dn,
      items,
      pageIndex,
      totalPages,
    }));
  });
}

function displayAddress(address: string) {
  const trimmed = address?.trim();
  if (!trimmed || trimmed.toLowerCase() === "unknown" || trimmed.toLowerCase() === "unknow") {
    return "";
  }
  return trimmed;
}

function formatLongThaiDate(dateStr: string) {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const [yearText, monthText, dayText] = parts;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return dateStr;
  }

  const buddhistYear = year + 543;
  const padDay = String(day).padStart(2, "0");
  const padMonth = String(month).padStart(2, "0");
  return `${padDay}/${padMonth}/${buddhistYear}`;
}

function getCurrentThaiTime() {
  try {
    const dateObj = new Date();
    return new Intl.DateTimeFormat("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "Asia/Bangkok",
    }).format(dateObj);
  } catch {
    return "--:--:--";
  }
}

function formatQty2Dec(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return "0.00";
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function DeliveryNoteHeader({ notePage }: { notePage: DeliveryNotePage }) {
  const { dn, pageIndex, totalPages } = notePage;
  const addr = displayAddress(dn.customer.address);
  const customerDisplay = addr ? `${dn.customer.name} ${addr}` : dn.customer.name;

  return (
    <header className="dn-new-header">
      <div className="dn-header-left">
        <div className="dn-org-box">
          อรินยา พาณิชย์
        </div>
        <div className="dn-customer-line">
          <span className="dn-label">ชื่อลูกค้า :</span>
          <span className="dn-value">{customerDisplay}</span>
        </div>
      </div>

      <div className="dn-header-right">
        <div className="dn-title-box">
          ***บิลส่งของ(เครดิต)
        </div>
        
        <div className="dn-meta-block">
          {/* Row 1 */}
          <div className="dn-meta-row-2">
            <div>
              <div className="dn-meta-label">วันที่ :</div>
              <div className="dn-meta-value">{formatLongThaiDate(dn.deliveryDate)}</div>
            </div>
            <div>
              <div className="dn-meta-label">Inv.No. :</div>
              <div className="dn-meta-value">{dn.deliveryNumber}</div>
            </div>
          </div>

          {/* Row 2 */}
          <div className="dn-meta-row-3">
            <div>
              <div className="dn-meta-label">เงื่อนไขการชำระ :</div>
              <div className="dn-meta-value">&nbsp;</div>
            </div>
            <div>
              <div className="dn-meta-label">เวลา :</div>
              <div className="dn-meta-value">{getCurrentThaiTime()}</div>
            </div>
            <div>
              <div className="dn-meta-label">Page :</div>
              <div className="dn-meta-value">{pageIndex + 1} / {totalPages}</div>
            </div>
          </div>

          {/* Row 3 */}
          <div className="dn-meta-row-2">
            <div>
              <div className="dn-meta-label">รหัสลูกค้า :</div>
              <div className="dn-meta-value">{dn.customer.code}</div>
            </div>
            <div>
              <div className="dn-meta-label">อ้างอิง :</div>
              <div className="dn-meta-value">{dn.orderNumber || dn.deliveryNumber}</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function DeliveryItemsTable({
  items,
  dn,
  priceMode = "all",
  isLastPage = true,
}: {
  items: DeliveryNotePrintData["items"];
  dn: DeliveryNotePrintData;
  priceMode?: PriceDisplayMode;
  isLastPage?: boolean;
}) {
  const showUnitPrice = priceMode === "all";
  const showTotalAmount = priceMode === "all" || priceMode === "total_only";

  const hasOutstanding = dn.previousOutstanding > 0 || dn.installmentPaid > 0;
  const isInstallment = Boolean(dn.isInstallmentPlan && dn.installmentPaid > 0);

  // Calculate grand total
  const grandTotal = isInstallment
    ? dn.totalAmount + dn.installmentPaid
    : dn.totalAmount + dn.previousOutstanding;

  // In 'none' mode, summary rows and grand total are omitted completely.
  const summaryRowsCount = (isLastPage && hasOutstanding && showTotalAmount)
    ? (isInstallment ? 4 : 2)
    : 0;

  const grandTotalRowHeight = showTotalAmount ? 1 : 0;

  // Calculate empty rows needed to pad table height to match ITEMS_PER_NOTE_PAGE
  const emptyRowCount = Math.max(0, ITEMS_PER_NOTE_PAGE - items.length - summaryRowsCount - grandTotalRowHeight);

  const summaryColSpan = showUnitPrice ? 5 : 4;
  const grandTotalColSpan = showUnitPrice ? 3 : 2;

  return (
    <table className="dn-table">
      <thead>
        <tr>
          <th className="dn-col-index">ลำดับ</th>
          <th className="dn-col-name">รายการ</th>
          <th className="dn-col-qty">จำนวน</th>
          <th className="dn-col-unit">หน่วย</th>
          {showUnitPrice && <th className="dn-col-price">ราคา</th>}
          {showTotalAmount && <th className="dn-col-total">จำนวนเงิน</th>}
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const itemLabel = `${item.productSku} ${item.productName}`;
          return (
          <tr key={item.id} className="dn-row-item">
            <td className="dn-col-index">{item.lineNumber}</td>
            <td className="dn-col-name">
              <span className="dn-item-line">
                <span
                  className="dn-item-name"
                  style={{ fontSize: `${fitDeliveryItemFontSize(itemLabel)}pt` }}
                >
                  {itemLabel}
                </span>
                {item.isReplacement && <span className="dn-replacement-label">(ส่งชดเชย)</span>}
              </span>
            </td>
            <td className="dn-col-qty">{formatQty2Dec(item.quantityDelivered)}</td>
            <td className="dn-col-unit">{item.saleUnitLabel}</td>
            {showUnitPrice && <td className="dn-col-price">{item.isReplacement || item.unitPrice > 0 ? fmt(item.unitPrice) : ""}</td>}
            {showTotalAmount && (
              <td className="dn-col-total">
                {item.isReplacement || item.lineTotal > 0 ? fmt(item.lineTotal) : ""}
              </td>
            )}
          </tr>
          );
        })}

        {/* Empty rows to pad table height */}
        {Array.from({ length: emptyRowCount }).map((_, index) => (
          <tr key={`empty-${index}`} className="dn-row-empty">
            <td className="dn-col-index">&nbsp;</td>
            <td className="dn-col-name">&nbsp;</td>
            <td className="dn-col-qty">&nbsp;</td>
            <td className="dn-col-unit">&nbsp;</td>
            {showUnitPrice && <td className="dn-col-price">&nbsp;</td>}
            {showTotalAmount && <td className="dn-col-total">&nbsp;</td>}
          </tr>
        ))}

        {/* Outstanding balances (only on last page and when showTotalAmount is true) */}
        {isLastPage && hasOutstanding && showTotalAmount && (
          <>
            <tr className="dn-row-summary dn-row-summary-first">
              <td colSpan={summaryColSpan} className="dn-col-summary-label">ยอดสินค้าวันนี้</td>
              <td className="dn-col-total dn-mono" style={{ textAlign: "right" }}>{fmt(dn.totalAmount)}</td>
            </tr>
            <tr className="dn-row-summary">
              <td colSpan={summaryColSpan} className="dn-col-summary-label">ยอดค้างชำระเดิม</td>
              <td className="dn-col-total dn-mono" style={{ textAlign: "right" }}>{fmt(dn.previousOutstanding)}</td>
            </tr>
            {isInstallment && (
              <>
                <tr className="dn-row-summary">
                  <td colSpan={summaryColSpan} className="dn-col-summary-label">หักผ่อนชำระวันนี้</td>
                  <td className="dn-col-total dn-mono" style={{ textAlign: "right" }}>-{fmt(dn.installmentPaid)}</td>
                </tr>
                <tr className="dn-row-summary">
                  <td colSpan={summaryColSpan} className="dn-col-summary-label">คงเหลือยอดค้างเก่า</td>
                  <td className="dn-col-total dn-mono" style={{ textAlign: "right" }}>{fmt(dn.remainingOutstanding)}</td>
                </tr>
              </>
            )}
          </>
        )}

        {/* Grand total summary row (only when showTotalAmount is true) */}
        {showTotalAmount && (
          <tr className="dn-summary-row">
            <td colSpan={2} className="dn-summary-baht">
              {grandTotal > 0 ? `(${bahtText(grandTotal)})` : ""}
            </td>
            <td colSpan={grandTotalColSpan} className="dn-summary-label">ยอดเงินสุทธิ</td>
            <td className="dn-summary-value">{fmt(grandTotal)}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function DeliveryNoteFooter({ dn }: { dn: DeliveryNotePrintData }) {
  return (
    <footer className="dn-footer">
      <div className="dn-notes">
        <span>หมายเหตุ :</span>
        <strong>{dn.notes?.trim() ? dn.notes : ""}</strong>
      </div>

      <div className="dn-signatures">
        <div className="dn-signature-group">
          <div className="dn-sig-row-lines">
            <div className="dn-sig-underline" />
            <div className="dn-date-underline"><span /><b>/</b><span /><b>/</b><span /></div>
          </div>
          <div className="dn-sig-row-labels">
            <div className="dn-sig-label">ผู้รับสินค้า</div>
            <div className="dn-date-label">วันที่</div>
          </div>
        </div>

        <div className="dn-signature-group">
          <div className="dn-sig-row-lines">
            <div className="dn-sig-underline" />
            <div className="dn-date-underline"><span /><b>/</b><span /><b>/</b><span /></div>
          </div>
          <div className="dn-sig-row-labels">
            <div className="dn-sig-label">ผู้ส่งสินค้า</div>
            <div className="dn-date-label">วันที่</div>
          </div>
        </div>

        <div className="dn-signature-group">
          <div className="dn-sig-row-lines">
            <div className="dn-sig-underline" />
            <div className="dn-date-underline"><span /><b>/</b><span /><b>/</b><span /></div>
          </div>
          <div className="dn-sig-row-labels">
            <div className="dn-sig-label">ผู้รับเงิน</div>
            <div className="dn-date-label">วันที่</div>
          </div>
        </div>
      </div>
    </footer>
  );
}

function DeliveryNotePageView({
  notePage,
  priceMode = "all",
}: {
  notePage: DeliveryNotePage;
  priceMode?: PriceDisplayMode;
}) {
  const { dn, items, pageIndex, totalPages } = notePage;

  return (
    <div className="dn-page-content">
      <DeliveryNoteHeader notePage={notePage} />
      <DeliveryItemsTable
        items={items}
        dn={dn}
        priceMode={priceMode}
        isLastPage={pageIndex === totalPages - 1}
      />
      <div className="dn-flex-spacer" />
      <DeliveryNoteFooter dn={dn} />
    </div>
  );
}

export function DeliveryNoteLayout({ dns, showAmount, priceMode: propPriceMode, isEmbedded = false }: Props) {
  const resolvedPriceMode = resolvePriceMode(propPriceMode, showAmount);
  const notePages = buildNotePages(dns);

  return (
    <>
      <style>{`
        @page { size: A4 portrait; margin: 0; }

        @media print {
          html, body {
            width: ${A4_WIDTH_MM}mm;
            min-height: ${A4_HEIGHT_MM}mm;
          }

          body {
            margin: 0;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }

          .no-print { display: none !important; }

          .note-page {
            box-shadow: none !important;
            border: none !important;
            page-break-after: always;
            break-after: page;
          }

          .note-page:last-child {
            page-break-after: avoid;
            break-after: auto;
          }

          .dn-scaler-outer {
            width: auto !important;
            height: auto !important;
            overflow: visible !important;
            margin: 0 !important;
            display: block !important;
          }

          .dn-scaler-inner {
            transform: none !important;
            width: auto !important;
          }
        }

        ${isEmbedded ? "" : `@media screen {
          body {
            background: #e5e7eb;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: stretch;
            padding: 24px 8px;
            gap: 16px;
            overflow-x: hidden;
          }
        }`}

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

        .note-page {
          background: #ffffff;
          width: ${A4_WIDTH_MM}mm;
          height: ${A4_HEIGHT_MM}mm;
          overflow: hidden;
          box-sizing: border-box;
          padding: ${PAGE_PADDING_MM}mm;
          color: #000000;
          font-family: "Angsana New Delivery Note", "Sarabun", "Noto Sans Thai", sans-serif;
          font-synthesis: none;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          text-rendering: geometricPrecision;
        }

        @media screen {
          .note-page {
            border: 1px solid #d1d5db;
            box-shadow: 0 4px 32px rgba(15, 23, 42, 0.16);
          }
        }

        .dn-page-content {
          height: 100%;
          display: flex;
          flex-direction: column;
          padding: 1mm;
          box-sizing: border-box;
        }

        /* Header styling */
        .dn-new-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          width: 100%;
          margin-bottom: 2mm;
        }

        .dn-header-left {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          width: 53%;
          height: 42mm;
        }

        .dn-org-box {
          border: 1.5px solid #000000;
          padding: 2mm 4mm;
          font-size: 27pt;
          line-height: 1.15;
          font-weight: bold;
          text-align: center;
          width: fit-content;
          min-width: 60mm;
          white-space: nowrap;
          color: #000000;
        }

        .dn-customer-line {
          font-size: 22pt;
          line-height: 1.15;
          font-weight: bold;
          margin-top: auto;
          margin-bottom: 0.5mm;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          color: #000000;
        }

        .dn-customer-line .dn-label {
          margin-right: 2mm;
        }

        .dn-customer-line .dn-value {
          font-weight: bold;
        }

        .dn-header-right {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          width: 45%;
        }

        .dn-title-box {
          border: 1.5px solid #000000;
          padding: 1.5mm 3mm;
          font-size: 23pt;
          line-height: 1.15;
          font-weight: bold;
          text-align: center;
          width: 100%;
          max-width: 84mm;
          margin-bottom: 1.5mm;
          color: #000000;
        }

        .dn-meta-block {
          width: 100%;
          max-width: 84mm;
          display: flex;
          flex-direction: column;
          gap: 1mm;
        }

        .dn-meta-row-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          column-gap: 4mm;
        }

        .dn-meta-row-3 {
          display: grid;
          grid-template-columns: 1.45fr 1fr 0.8fr;
          column-gap: 2mm;
        }

        .dn-meta-label {
          font-size: 18pt;
          line-height: 1.1;
          font-weight: bold;
          color: #000000;
          white-space: nowrap;
        }

        .dn-meta-value {
          font-size: 20pt;
          line-height: 1.1;
          font-weight: bold;
          color: #000000;
          margin-top: 0.2mm;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* Table styling */
        .dn-table {
          width: 100%;
          table-layout: fixed;
          border-collapse: collapse;
          margin-top: 1.5mm;
          border: 1.5px solid #000000;
          font-size: 20pt;
          line-height: 1.05;
          color: #000000;
        }

        .dn-table th {
          height: 8mm;
          border: 1.2px solid #000000;
          background-color: #f1f5f9;
          padding: 0.6mm 0.5mm;
          font-size: 17.5pt;
          font-weight: 800;
          text-align: center;
          white-space: nowrap;
          color: #000000;
        }

        .dn-table td {
          height: 8.0mm;
          border-left: 1.2px solid #000000;
          border-right: 1.2px solid #000000;
          padding: 0.2mm 1.5mm;
          vertical-align: middle;
          font-weight: bold;
          color: #000000;
        }

        .dn-row-item td {
          font-weight: bold;
        }

        .dn-item-line {
          white-space: nowrap;
        }

        .dn-item-name {
          white-space: nowrap;
          line-height: 1.05;
        }

        .dn-col-name {
          white-space: nowrap;
          overflow: visible;
        }

        .dn-col-index { width: 12mm; text-align: center; }
        .dn-col-name { width: auto; text-align: left; }
        .dn-col-qty { width: 21mm; text-align: right; font-weight: bold; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .dn-col-unit { width: 14mm; text-align: center; }
        .dn-col-price { width: 20mm; text-align: right; font-weight: bold; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .dn-col-total { width: 26mm; text-align: right; font-weight: bold; white-space: nowrap; font-variant-numeric: tabular-nums; }

        .dn-row-empty td {
          border-left: 1.2px solid #000000;
          border-right: 1.2px solid #000000;
        }

        /* Outstanding and summary styling */
        .dn-row-summary td {
          border-top: 1.2px solid #000000;
          border-bottom: 1.2px solid #000000;
          height: 8.0mm;
          font-weight: bold;
          color: #000000;
        }

        .dn-col-summary-label {
          text-align: right;
          padding-right: 4mm !important;
          font-size: 20pt;
        }

        .dn-row-summary-first td {
          border-top: 2px solid #000000;
        }

        /* Net total summary row */
        .dn-summary-row td {
          border-top: 1.5px solid #000000;
          border-bottom: 1.5px solid #000000;
          height: 9.2mm;
          font-weight: bold;
          vertical-align: middle;
          color: #000000;
        }

        .dn-summary-baht {
          text-align: center;
          font-size: 17pt;
          font-weight: bold;
        }

        .dn-summary-label {
          text-align: center;
          background-color: #f1f5f9;
          border-left: 1.2px solid #000000 !important;
          border-right: 1.2px solid #000000 !important;
          font-size: 20pt;
          font-weight: bold;
        }

        .dn-summary-value {
          text-align: right;
          font-size: 22pt;
          font-weight: bold;
          padding-right: 1.5mm !important;
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
        }

        .dn-flex-spacer {
          flex: 0 0 0;
          height: 0;
        }

        /* Footer & Notes */
        .dn-footer {
          margin-top: 1.5mm;
          flex: 0 0 auto;
        }

        .dn-notes {
          border: 1.5px solid #000000;
          min-height: 16mm;
          padding: 1mm 2.5mm;
          box-sizing: border-box;
          display: flex;
          align-items: flex-start;
          line-height: 1.25;
        }

        .dn-notes span {
          flex-shrink: 0;
          white-space: nowrap;
          color: #000000;
          font-size: 20pt;
          font-weight: 900;
          margin-right: 2mm;
        }

        .dn-notes strong {
          color: #c00000;
          font-size: 22pt;
          font-weight: 900;
          line-height: 1.25;
          overflow-wrap: anywhere;
          white-space: pre-wrap;
        }

        /* Signatures */
        .dn-signatures {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          column-gap: 8mm;
          margin-top: 3.5mm;
          padding: 0 2mm;
        }

        .dn-signature-group {
          display: flex;
          flex-direction: column;
          width: 100%;
        }

        .dn-sig-row-lines {
          display: flex;
          align-items: flex-end;
          width: 100%;
          gap: 2mm;
        }

        .dn-sig-underline {
          flex: 1;
          height: 16px;
          border-bottom: 1.5px solid #000000;
        }

        .dn-date-underline {
          width: 30mm;
          height: 16px;
          border-bottom: 1.5px solid #000000;
          display: grid;
          grid-template-columns: 1fr auto 1fr auto 1fr;
          align-items: center;
          column-gap: 1.5mm;
          font-size: 14pt;
          line-height: 16px;
          flex-shrink: 0;
        }

        .dn-date-underline b {
          font-weight: 800;
          line-height: 1;
        }

        .dn-sig-row-labels {
          display: flex;
          width: 100%;
          gap: 2mm;
          margin-top: 1.5mm;
        }

        .dn-sig-label {
          flex: 1;
          text-align: center;
          font-size: 16pt;
          font-weight: bold;
          white-space: nowrap;
          color: #000000;
        }

        .dn-date-label {
          width: 25mm;
          text-align: center;
          font-size: 16pt;
          font-weight: bold;
          white-space: nowrap;
          flex-shrink: 0;
          color: #000000;
        }
      `}</style>

      {notePages.map((notePage) => {
        const pageElement = (
          <div
            className="note-page"
            data-delivery-note-page="true"
            data-export-tokens={JSON.stringify(notePage.dn.exportTokens ?? [])}
            data-capture-width="794"
            data-capture-height="1123"
            data-customer-code={notePage.dn.customer.code}
            data-customer-name={notePage.dn.customer.name}
            data-delivery-number={notePage.dn.deliveryNumber}
            data-page-index={notePage.pageIndex + 1}
            data-total-pages={notePage.totalPages}
          >
            <DeliveryNotePageView notePage={notePage} priceMode={resolvedPriceMode} />
          </div>
        );

        if (isEmbedded) {
          return (
            <div
              key={notePage.key}
              className="dn-embedded-page-shell"
              style={{ width: "210mm", minHeight: "297mm", margin: 0, padding: 0 }}
            >
              {pageElement}
            </div>
          );
        }

        return (
          <DeliveryNoteScaler key={notePage.key}>
            {pageElement}
          </DeliveryNoteScaler>
        );
      })}
    </>
  );
}
