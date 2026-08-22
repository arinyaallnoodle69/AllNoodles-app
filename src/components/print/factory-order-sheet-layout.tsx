import type { VehicleProductSummaryData } from "@/lib/orders/vehicle-product-summary";
import type { CSSProperties } from "react";

const SHEET_W = "210mm";
const SHEET_H = "297mm";
const SCREEN_SHEET_W = "794px";
const SCREEN_SHEET_H = "1123px";
const ITEMS_PER_PAGE = 15;
const ROW_HEIGHT_MM = 14;

const VEHICLE_COLUMN_PALETTES = [
  { header: "#EA80FC", body: "#F3E5F5", border: "#000000" },
  { header: "#dcfce7", body: "#f3fdf7", border: "#000000" },
  { header: "#fef3c7", body: "#fffaf0", border: "#000000" },
  { header: "#fde2e8", body: "#fff4f6", border: "#000000" },
  { header: "#ede9fe", body: "#f7f5ff", border: "#000000" },
] as const;

function formatQty(value: number) {
  return value > 0 ? value.toLocaleString("th-TH") : "";
}

function getVehiclePalette(columnIndex: number) {
  return VEHICLE_COLUMN_PALETTES[columnIndex % VEHICLE_COLUMN_PALETTES.length] ?? VEHICLE_COLUMN_PALETTES[0];
}

function FactoryOrderSheet({ data, startIndex }: { data: VehicleProductSummaryData; startIndex: number }) {
  return (
    <section className="packing-sheet vehicle-summary-sheet">
      <div className="vehicle-summary-sheet__inner">
        <header className="vehicle-summary-header">
          <div className="vehicle-summary-header__title-container">
            <h1 className="vehicle-summary-header__title">ใบสั่งของ</h1>
          </div>
          <div className="vehicle-summary-header__line">
            <div className="vehicle-summary-header__brand">
              โรงงาน : {data.factoryName || "โรงงานอนามัย"}
              {data.warehouseName ? ` · คลัง : ${data.warehouseName}` : ""}
            </div>
            <div className="vehicle-summary-header__meta-inline">
              <span>{data.dateLabel}</span>
              <span>รวมจาก {(data.sourceVehicleCount ?? data.vehicles.length).toLocaleString("th-TH")} คัน</span>
              <span>{data.products.length.toLocaleString("th-TH")} รายการ</span>
            </div>
          </div>
        </header>

        <div className="vehicle-summary-table-wrap">
          <table
            className="vehicle-summary-table"
            style={{ "--summary-row-height": `${ROW_HEIGHT_MM}mm` } as CSSProperties}
          >
            <thead>
              <tr>
                <th className="vehicle-summary-table__index-col">ลำดับ</th>
                <th className="vehicle-summary-table__product-col">สินค้า</th>
                <th className="vehicle-summary-table__unit-col">หน่วย</th>
                {data.vehicles.map((vehicle, columnIndex) => {
                  const palette = getVehiclePalette(columnIndex);
                  return (
                    <th
                      key={vehicle.id ?? "unassigned"}
                      className="vehicle-summary-table__vehicle-col"
                      style={{ backgroundColor: palette.header, borderColor: palette.border }}
                    >
                      <span className="vehicle-summary-table__vehicle-name">{vehicle.name}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {data.products.map((product, rowIndex) => (
                <tr key={product.id}>
                  <td className="vehicle-summary-table__index-cell">{startIndex + rowIndex + 1}</td>
                  <td className="vehicle-summary-table__product-cell">
                    <div className="vehicle-summary-table__product-line">
                      <span className="vehicle-summary-table__product-name" title={product.name}>
                        {product.name}
                      </span>
                    </div>
                  </td>
                  <td className="vehicle-summary-table__unit-cell">{product.unit}</td>
                  {data.vehicles.map((vehicle, vehicleIndex) => {
                    const palette = getVehiclePalette(vehicleIndex);
                    return (
                      <td
                        key={`${product.id}-${vehicle.id ?? "unassigned"}`}
                        className="vehicle-summary-table__qty-cell"
                        style={{ backgroundColor: palette.body, borderColor: palette.border }}
                      >
                        {formatQty(data.qty[rowIndex]?.[vehicleIndex] ?? 0)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function buildFactoryOrderPages(data: VehicleProductSummaryData): Array<{ data: VehicleProductSummaryData; startIndex: number }> {
  const pages = [];
  const productCount = data.products.length;
  const totalPages = Math.max(1, Math.ceil(productCount / ITEMS_PER_PAGE));

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
    const startIndex = pageIndex * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    pages.push({
      startIndex,
      data: {
        ...data,
        products: data.products.slice(startIndex, endIndex),
        qty: data.qty.slice(startIndex, endIndex),
      },
    });
  }

  return pages;
}

function FactoryOrderStyles() {
  return (
    <style>{`
      @page { size: A4 portrait; margin: 0; }

      @media print {
        html, body {
          width: 210mm !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: visible !important;
          background: #ffffff !important;
        }

        body {
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
        }

        .no-print {
          display: none !important;
        }

        .packing-print-container {
          margin: 0 !important;
          padding: 0 !important;
        }

        .packing-sheet {
          width: 210mm !important;
          height: 297mm !important;
          margin: 0 !important;
          border: none !important;
          box-shadow: none !important;
          page-break-after: always;
          break-after: page;
        }
      }

      @media screen {
        body {
          background: #e2e8f0 !important;
        }

        .packing-print-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 32px;
          padding: 78px 12px 36px;
          overflow-x: hidden;
        }

        .packing-sheet-shell {
          width: ${SCREEN_SHEET_W};
          height: ${SCREEN_SHEET_H};
          display: flex;
          justify-content: center;
          align-items: flex-start;
        }

        .packing-sheet {
          width: ${SCREEN_SHEET_W};
          height: ${SCREEN_SHEET_H};
          box-shadow: 0 16px 34px rgba(15, 23, 42, 0.16);
        }
      }

      @media screen and (max-width: 767px) {
        .packing-print-container {
          gap: 16px;
          width: 100vw;
          padding: 66px 0 20px;
        }

        .packing-sheet-shell {
          --summary-mobile-available: calc(100vw - 8px);
          --summary-mobile-scale: min(1, calc(var(--summary-mobile-available) / ${SCREEN_SHEET_W}));
          width: var(--summary-mobile-available);
          height: calc(${SCREEN_SHEET_H} * var(--summary-mobile-scale));
          max-width: 100vw;
          overflow: hidden;
        }

        .packing-sheet {
          width: ${SCREEN_SHEET_W} !important;
          height: ${SCREEN_SHEET_H} !important;
          max-width: none !important;
          flex: none;
          transform: scale(var(--summary-mobile-scale));
          transform-origin: top center;
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.14);
        }
      }


      .packing-sheet {
        width: ${SHEET_W};
        height: ${SHEET_H};
        overflow: hidden;
        background: #ffffff;
        border: 1px solid #000000;
        color: #0f172a;
        box-sizing: border-box;
        font-family: var(--font-sukhumvit), "Sukhumvit Set", sans-serif;
      }

      .vehicle-summary-sheet__inner {
        display: flex;
        flex-direction: column;
        height: 100%;
        padding: 4mm;
        gap: 0.9mm;
        box-sizing: border-box;
      }

      .vehicle-summary-header {
        display: flex;
        flex-direction: column;
        gap: 0.15mm;
        padding-bottom: 0.35mm;
        border-bottom: 1px solid #000000;
      }

      .vehicle-summary-header__title-container {
        display: flex;
        justify-content: center;
        width: 100%;
        margin-top: 0.6mm;
        margin-bottom: 0.4mm;
      }

      .vehicle-summary-header__brand {
        font-size: 10pt;
        font-weight: 800;
        line-height: 1.25;
        letter-spacing: 0.04em;
        color: #4A148C;
      }

      .vehicle-summary-header__line {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 2.4mm;
        width: 100%;
      }

      .vehicle-summary-header__title {
        margin: 0;
        font-size: 18pt;
        line-height: 1.25;
        font-weight: 800;
        white-space: nowrap;
        text-align: center;
      }

      .vehicle-summary-header__meta-inline {
        display: flex;
        align-items: center;
        gap: 1.6mm;
        flex-wrap: nowrap;
        white-space: nowrap;
        font-size: 9.5pt;
        font-weight: 700;
        color: #334155;
      }

      .vehicle-summary-table-wrap {
        flex: 0 0 auto;
        min-height: 0;
        border: 1px solid #000000;
        display: flex;
        align-items: stretch;
        overflow: hidden;
      }

      .vehicle-summary-table {
        width: 100%;
        height: auto;
        border-collapse: collapse;
        table-layout: fixed;
      }

      .vehicle-summary-table thead tr {
        height: 10mm;
      }

      .vehicle-summary-table tbody tr,
      .vehicle-summary-table tbody td {
        height: var(--summary-row-height);
      }

      .vehicle-summary-table th,
      .vehicle-summary-table td {
        border-right: 1px solid #000000;
        border-bottom: 1px solid #000000;
        padding: 0;
        text-align: center;
        vertical-align: middle;
        box-sizing: border-box;
      }

      .vehicle-summary-table tr > *:last-child {
        border-right: none;
      }

      .vehicle-summary-table tbody tr:last-child > * {
        border-bottom: none;
      }

      .vehicle-summary-table__index-col,
      .vehicle-summary-table__index-cell {
        width: 10mm;
        min-width: 10mm;
      }

      .vehicle-summary-table__index-col {
        background: #ffffff;
        font-size: 10pt;
        font-weight: 800;
      }

      .vehicle-summary-table__index-cell {
        background: #ffffff;
        font-size: 10pt;
        font-weight: 700;
      }

      .vehicle-summary-table__product-col {
        width: 130mm;
        min-width: 130mm;
        padding: 0.5mm 0.8mm 0.25mm;
        background: #ffffff;
        text-align: center;
        font-size: 11pt;
        font-weight: 800;
        line-height: 1.25;
      }

      .vehicle-summary-table__unit-col,
      .vehicle-summary-table__unit-cell {
        width: 18mm;
        min-width: 18mm;
      }

      .vehicle-summary-table__unit-col {
        background: #ffffff;
        font-size: 10pt;
        font-weight: 800;
        line-height: 1.25;
      }

      .vehicle-summary-table__unit-cell {
        background: #ffffff;
        font-size: 11pt;
        font-weight: 700;
        line-height: 1.55;
        color: #0f172a;
      }

      .vehicle-summary-table__vehicle-col {
        font-size: 11pt;
        font-weight: 800;
        border-bottom-width: 1px;
      }

      .vehicle-summary-table__vehicle-name {
        display: -webkit-box;
        overflow: hidden;
        padding: 0.3mm 0.25mm;
        line-height: 1.35;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
      }

      .vehicle-summary-table__product-cell {
        padding: 0.6mm 3mm;
        text-align: center;
        background: #ffffff;
      }

      .vehicle-summary-table__product-line {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 0.15mm;
        width: 100%;
        min-height: 100%;
        padding: 0.6mm 3mm;
        box-sizing: border-box;
      }

      .vehicle-summary-table__product-name {
        display: block;
        min-width: 0;
        flex: 0 1 auto;
        max-width: none;
        overflow: visible;
        text-overflow: clip;
        white-space: normal;
        font-size: 13pt;
        font-weight: 700;
        line-height: 1.2;
        color: #0f172a;
      }

      .vehicle-summary-table__qty-cell {
        font-size: 14pt;
        font-weight: 800;
        line-height: 1.3;
        color: #0f172a;
      }
    `}</style>
  );
}

export function FactoryOrderSheetLayout({ data }: { data: VehicleProductSummaryData }) {
  const pages = buildFactoryOrderPages(data);

  return (
    <>
      <FactoryOrderStyles />
      {pages.map((page) => (
        <div
          key={`${page.data.factoryName ?? "factory"}-${page.startIndex}`}
          className="packing-sheet-shell"
          data-capture-width="794"
          data-capture-height="1123"
        >
          <FactoryOrderSheet data={page.data} startIndex={page.startIndex} />
        </div>
      ))}
    </>
  );
}
