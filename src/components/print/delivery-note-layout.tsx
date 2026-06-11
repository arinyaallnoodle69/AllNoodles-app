import type { DeliveryNotePrintData } from "@/lib/delivery/print";
import { bahtText } from "@/lib/format/baht-text";
import { chunkItems, fmt, fmtQty } from "@/components/print/print-shared";

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const ITEMS_PER_NOTE_PAGE = 20;
const PAGE_PADDING_MM = 7;
const LOGO_SRC = "/brand/512x512.png";
const ORGANIZATION_PHONE = "099-356-4653";

type DeliveryNotePage = {
  key: string;
  dn: DeliveryNotePrintData;
  items: DeliveryNotePrintData["items"];
  pageIndex: number;
  totalPages: number;
};

type Props = {
  dns: DeliveryNotePrintData[];
  showIntermediateFooter?: boolean;
};

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
    return "-";
  }
  return trimmed;
}

function formatShortThaiDate(date: string) {
  const [yearText, monthText, dayText] = date.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return date;
  }

  const buddhistYear = year + 543;
  return `${day}/${month}/${String(buddhistYear).slice(-2)}`;
}

function DeliveryNoteHeader({ notePage }: { notePage: DeliveryNotePage }) {
  const { dn, pageIndex, totalPages } = notePage;

  return (
    <header className="dn-header">
      <div className="dn-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO_SRC} alt="AllNoodles" className="dn-logo" />
        <div className="dn-brand-text">
          <div className="dn-org-name">AllNoodles</div>
          <div className="dn-org-line">-</div>
          <div className="dn-org-line">โทร {ORGANIZATION_PHONE}</div>
        </div>
      </div>

      <div className="dn-title">ใบส่งของ</div>

      <div className="dn-doc-meta">
        <div className="dn-meta-row">
          <span>เลขที่</span>
          <strong>{dn.deliveryNumber}</strong>
        </div>
        <div className="dn-meta-row">
          <span>วันที่</span>
          <strong>{formatShortThaiDate(dn.deliveryDate)}</strong>
        </div>
        <div className="dn-meta-row">
          <span>หน้า</span>
          <strong>{pageIndex + 1} / {totalPages}</strong>
        </div>
      </div>
    </header>
  );
}

function CustomerBlock({ dn }: { dn: DeliveryNotePrintData }) {
  return (
    <section className="dn-customer">
      <div className="dn-customer-main">
        <div className="dn-field dn-store-line">
          <span className="dn-field-label">ร้านค้า :</span>
          <span className="dn-field-value">
            {dn.customer.code} {dn.customer.name}
          </span>
        </div>
        <div className="dn-field dn-address-line">
          <span className="dn-field-label">ที่อยู่ :</span>
          <span className="dn-field-value dn-address-value">{displayAddress(dn.customer.address)}</span>
        </div>
      </div>

      <div className="dn-customer-side">
        <div className="dn-field">
          <span className="dn-field-label">รถจัดส่ง :</span>
          <span className="dn-field-value">{dn.customer.vehicleName || "-"}</span>
        </div>
        <div className="dn-field">
          <span className="dn-field-label">คลัง :</span>
          <span className="dn-field-value">{dn.warehouseName || "-"}</span>
        </div>
      </div>
    </section>
  );
}

function DeliveryItemsTable({ items }: { items: DeliveryNotePrintData["items"] }) {
  return (
    <table className="dn-table">
      <thead>
        <tr>
          <th className="dn-col-index">ลำดับ</th>
          <th className="dn-col-sku">รหัสสินค้า</th>
          <th className="dn-col-name">รายการสินค้า</th>
          <th className="dn-col-qty">จำนวน</th>
          <th className="dn-col-unit">หน่วย</th>
          <th className="dn-col-price">ราคา</th>
          <th className="dn-col-total">จำนวนเงิน</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <td className="dn-col-index">{item.lineNumber}</td>
            <td className="dn-col-sku dn-mono">{item.productSku}</td>
            <td className="dn-col-name">{item.productName}</td>
            <td className="dn-col-qty">{fmtQty(item.quantityDelivered)}</td>
            <td className="dn-col-unit">{item.saleUnitLabel}</td>
            <td className="dn-col-price">{fmt(item.unitPrice)}</td>
            <td className="dn-col-total">{fmt(item.lineTotal)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DeliveryNoteFooter({ dn }: { dn: DeliveryNotePrintData }) {
  return (
    <footer className="dn-footer">
      <div className="dn-total-box">
        <div className="dn-baht-text">{bahtText(dn.totalAmount)}</div>
        <div className="dn-total-label">รวมทั้งสิ้น</div>
        <div className="dn-total-value dn-mono">{fmt(dn.totalAmount)}</div>
      </div>

      <div className="dn-notes">
        <span>หมายเหตุ :</span>
        <strong>{dn.notes?.trim() ? dn.notes : "-"}</strong>
      </div>

      <div className="dn-signatures">
        <div className="dn-signature">
          <div className="dn-sign-line" />
          <div className="dn-sign-label">ผู้รับสินค้า</div>
          <div className="dn-date-line" />
          <div className="dn-sign-date">วันที่</div>
        </div>
        <div className="dn-signature">
          <div className="dn-sign-line" />
          <div className="dn-sign-label">ผู้จัดสินค้า</div>
          <div className="dn-date-line" />
          <div className="dn-sign-date">วันที่</div>
        </div>
      </div>
    </footer>
  );
}

function DeliveryNotePageView({ notePage }: { notePage: DeliveryNotePage }) {
  const { dn, items } = notePage;

  return (
    <div className="dn-page-content">
      <DeliveryNoteHeader notePage={notePage} />
      <CustomerBlock dn={dn} />
      <DeliveryItemsTable items={items} />
      <div className="dn-flex-spacer" />
      <DeliveryNoteFooter dn={dn} />
    </div>
  );
}

export function DeliveryNoteLayout({ dns }: Props) {
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
        }

        .note-page {
          background: #ffffff;
          width: ${A4_WIDTH_MM}mm;
          height: ${A4_HEIGHT_MM}mm;
          overflow: hidden;
          box-sizing: border-box;
          padding: ${PAGE_PADDING_MM}mm;
          color: #000000;
          font-family: var(--font-sukhumvit), "Sukhumvit Set", "Sarabun", "Tahoma", sans-serif;
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
          padding: 2mm;
          box-sizing: border-box;
        }

        .dn-header {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: start;
          column-gap: 8mm;
          min-height: 25mm;
        }

        .dn-brand {
          display: flex;
          gap: 3mm;
          align-items: flex-start;
          min-width: 0;
        }

        .dn-logo {
          width: 16mm;
          height: 16mm;
          object-fit: contain;
          flex: 0 0 auto;
        }

        .dn-brand-text {
          min-width: 0;
        }

        .dn-org-name {
          font-size: 18pt;
          line-height: 1.05;
          font-weight: 900;
        }

        .dn-org-line {
          margin-top: 1mm;
          font-size: 10pt;
          line-height: 1.18;
          font-weight: 700;
        }

        .dn-title {
          padding-top: 1mm;
          font-size: 26pt;
          line-height: 1;
          font-weight: 900;
          white-space: nowrap;
          text-align: center;
        }

        .dn-doc-meta {
          justify-self: end;
          width: 48mm;
          border: 1px solid #111111;
          padding: 2mm 3mm;
          box-sizing: border-box;
          font-size: 11pt;
          line-height: 1.25;
          font-weight: 800;
        }

        .dn-meta-row {
          display: grid;
          grid-template-columns: 11mm 1fr;
          column-gap: 1mm;
          align-items: baseline;
        }

        .dn-meta-row strong {
          font-weight: 900;
        }

        .dn-customer {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 54mm;
          gap: 5mm;
          margin-top: 3mm;
          border: 1px solid #111111;
          padding: 3mm;
          min-height: 27mm;
          box-sizing: border-box;
        }

        .dn-customer-main,
        .dn-customer-side {
          min-width: 0;
        }

        .dn-customer-side {
          border-left: 1px solid #111111;
          padding-left: 4mm;
        }

        .dn-field {
          display: flex;
          align-items: flex-start;
          gap: 2mm;
          min-width: 0;
          font-size: 13pt;
          line-height: 1.25;
          font-weight: 900;
        }

        .dn-field + .dn-field {
          margin-top: 2mm;
        }

        .dn-field-label {
          flex: 0 0 auto;
          white-space: nowrap;
        }

        .dn-field-value {
          min-width: 0;
          font-weight: 900;
        }

        .dn-address-value {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          word-break: break-word;
        }

        .dn-table {
          width: 100%;
          table-layout: fixed;
          border-collapse: collapse;
          margin-top: 4mm;
          border: 1px solid #111111;
          font-size: 11.2pt;
          line-height: 1.18;
        }

        .dn-table th {
          height: 8.2mm;
          border: 1px solid #111111;
          padding: 1.1mm 1mm;
          font-size: 11.5pt;
          font-weight: 900;
          text-align: center;
          white-space: nowrap;
        }

        .dn-table td {
          height: 7.6mm;
          border-left: 1px solid #111111;
          border-right: 1px solid #111111;
          padding: 0.8mm 1mm;
          vertical-align: middle;
          font-weight: 800;
        }

        .dn-col-index { width: 11mm; text-align: center; }
        .dn-col-sku { width: 25mm; text-align: center; }
        .dn-col-name { width: auto; text-align: left; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
        .dn-col-qty { width: 17mm; text-align: center; }
        .dn-col-unit { width: 15mm; text-align: center; }
        .dn-col-price { width: 20mm; text-align: center; }
        .dn-col-total { width: 25mm; text-align: center; white-space: nowrap; }

        .dn-mono {
          font-family: "Consolas", "Sukhumvit Set", monospace;
          font-weight: 900;
        }

        .dn-flex-spacer {
          flex: 1 1 auto;
        }

        .dn-footer {
          margin-top: 4mm;
          flex: 0 0 auto;
        }

        .dn-total-box {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 30mm 35mm;
          border: 1px solid #111111;
          min-height: 13mm;
          align-items: center;
          font-size: 12pt;
          font-weight: 900;
        }

        .dn-baht-text,
        .dn-total-label,
        .dn-total-value {
          height: 100%;
          display: flex;
          align-items: center;
          padding: 0 3mm;
          box-sizing: border-box;
        }

        .dn-total-label,
        .dn-total-value {
          border-left: 1px solid #111111;
        }

        .dn-total-value {
          justify-content: flex-end;
          font-size: 13pt;
        }

        .dn-notes {
          display: flex;
          gap: 2mm;
          min-height: 13mm;
          border-left: 1px solid #111111;
          border-right: 1px solid #111111;
          border-bottom: 1px solid #111111;
          padding: 2mm 3mm;
          font-size: 12pt;
          line-height: 1.25;
          font-weight: 900;
          box-sizing: border-box;
        }

        .dn-notes strong {
          font-weight: 900;
        }

        .dn-signatures {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 30mm;
          padding: 13mm 13mm 0;
        }

        .dn-signature {
          text-align: center;
          font-size: 11.5pt;
          font-weight: 900;
        }

        .dn-sign-line,
        .dn-date-line {
          border-top: 1px solid #111111;
        }

        .dn-sign-label,
        .dn-sign-date {
          margin-top: 1.6mm;
        }

        .dn-date-line {
          margin-top: 8mm;
        }
      `}</style>

      {notePages.map((notePage) => (
        <div key={notePage.key} className="note-page" data-delivery-note-page="true">
          <DeliveryNotePageView notePage={notePage} />
        </div>
      ))}
    </>
  );
}
