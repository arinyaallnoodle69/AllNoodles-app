import type { VehicleProductSummaryData } from "@/lib/orders/vehicle-product-summary";
import type { CSSProperties } from "react";

const SHEET_W = "210mm";
const SHEET_H = "297mm";
const SCREEN_SHEET_W = "794px";
const SCREEN_SHEET_H = "1123px";
const ITEMS_PER_SHEET = 30;
// Leave a real printer-safe buffer: browser millimetre-to-pixel rounding and
// printer non-printable margins must not push row 32 beyond the A4 sheet.
const ROW_HEIGHT_MM = 8.7;
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

type VehicleSummarySheetDef = {
  key: string;
  data: VehicleProductSummaryData;
  vehicleIndex: number;
  rowOffset: number;
  totalRows: number;
  pageNumber: number;
  pageCount: number;
};

function buildVehicleSheets(data: VehicleProductSummaryData): VehicleSummarySheetDef[] {
  return data.vehicles
    .map((vehicle, vehicleIndex) => {
      const rows = data.products
        .map((product, productIndex) => ({
          product,
          qty: data.qty[productIndex]?.[vehicleIndex] ?? 0,
        }))
        .filter((row) => row.qty > 0);

      if (rows.length === 0) return null;

      const pageCount = Math.ceil(rows.length / ITEMS_PER_SHEET);

      return Array.from({ length: pageCount }, (_, pageIndex) => {
        const rowOffset = pageIndex * ITEMS_PER_SHEET;
        const pageRows = rows.slice(rowOffset, rowOffset + ITEMS_PER_SHEET);

        return {
          key: `${vehicle.id ?? "__unassigned__"}-${pageIndex + 1}`,
          vehicleIndex,
          rowOffset,
          totalRows: rows.length,
          pageNumber: pageIndex + 1,
          pageCount,
          data: {
            ...data,
            products: pageRows.map((row) => row.product),
            vehicles: [vehicle],
            qty: pageRows.map((row) => [row.qty]),
          },
        };
      });
    })
    .filter((sheets): sheets is VehicleSummarySheetDef[] => sheets !== null)
    .flat();
}

function VehicleSummarySheet({ sheet }: { sheet: VehicleSummarySheetDef }) {
  const { data, vehicleIndex, rowOffset, totalRows, pageNumber, pageCount } = sheet;
  const thumbSizeMm = ROW_HEIGHT_MM - 1;

  return (
    <section className="packing-sheet vehicle-summary-sheet" data-capture-width="794" data-capture-height="1123">
      <div className="vehicle-summary-sheet__inner">
        <header className="vehicle-summary-header">
          <div className="vehicle-summary-header__brand">All Noodles</div>
          <div className="vehicle-summary-header__line">
            <h1 className="vehicle-summary-header__title">สรุปสินค้าตามรถ</h1>
            <div className="vehicle-summary-header__meta-inline">
              <span>{data.dateLabel}</span>
              <span>{data.vehicles[0]?.name ?? "ยังไม่ได้กำหนดรถ"}</span>
              <span>{totalRows.toLocaleString("th-TH")} รายการ</span>
              {pageCount > 1 ? <span>หน้า {pageNumber}/{pageCount}</span> : null}
            </div>
          </div>
        </header>

        <div className="vehicle-summary-table-wrap">
          <table
            className="vehicle-summary-table"
            style={
              {
                "--summary-row-height": `${ROW_HEIGHT_MM}mm`,
                "--summary-thumb-size": `${thumbSizeMm}mm`,
              } as CSSProperties
            }
          >
            <thead>
              <tr>
                <th className="vehicle-summary-table__index-col">ลำดับ</th>
                <th className="vehicle-summary-table__product-col">สินค้า</th>
                <th className="vehicle-summary-table__unit-col">หน่วย</th>
                {data.vehicles.map((vehicle) => {
                  const palette = getVehiclePalette(vehicleIndex);
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
                  <td className="vehicle-summary-table__index-cell">{rowOffset + rowIndex + 1}</td>
                  <td className="vehicle-summary-table__product-cell">
                    <div className="vehicle-summary-table__product-line">
                      <span className="vehicle-summary-table__product-image" aria-hidden="true">
                        {product.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={product.imageUrl} alt="" crossOrigin="anonymous" />
                        ) : (
                          <span className="vehicle-summary-table__product-image-placeholder" />
                        )}
                      </span>
                      <span className="vehicle-summary-table__product-text">
                        <span className="vehicle-summary-table__product-name" title={product.name}>
                          {product.name}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className="vehicle-summary-table__unit-cell">{product.unit}</td>
                  {data.vehicles.map((vehicle, currentVehicleIndex) => {
                    const palette = getVehiclePalette(vehicleIndex);
                    return (
                      <td
                        key={`${product.id}-${vehicle.id ?? "unassigned"}`}
                        className="vehicle-summary-table__qty-cell"
                        style={{ backgroundColor: palette.body, borderColor: palette.border }}
                      >
                        {formatQty(data.qty[rowIndex]?.[currentVehicleIndex] ?? 0)}
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

function VehicleSummaryStyles() {
  return (
    <style>{`
      @font-face {
        font-family: "Noto Sans Thai Vehicle Summary";
        src: url("/fonts/NotoSansThai-Regular.ttf") format("truetype");
        font-style: normal;
        font-weight: 400;
        font-display: swap;
      }

      @font-face {
        font-family: "Noto Sans Thai Vehicle Summary";
        src: url("/fonts/NotoSansThai-Bold.ttf") format("truetype");
        font-style: normal;
        font-weight: 700 900;
        font-display: swap;
      }

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
          break-after: page;
          page-break-after: always;
        }

        .packing-sheet:last-child {
          break-after: auto;
          page-break-after: auto;
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
          --summary-mobile-scale: min(1, calc(var(--summary-mobile-available) / 794px));
          width: var(--summary-mobile-available);
          height: calc(1123px * var(--summary-mobile-scale));
          max-width: 100vw;
          overflow: hidden;
        }

        .packing-sheet {
          width: 794px !important;
          height: 1123px !important;
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
        border: 0.75pt solid #000000;
        color: #0f172a;
        box-sizing: border-box;
        font-family: "Noto Sans Thai Vehicle Summary", "Noto Sans Thai", sans-serif;
        font-synthesis: none;
        text-rendering: geometricPrecision;
        -webkit-font-smoothing: antialiased;
      }

      .vehicle-summary-sheet__inner {
        display: flex;
        flex-direction: column;
        height: 100%;
        padding: 1.4mm 2.2mm 1.4mm;
        gap: 0.9mm;
        box-sizing: border-box;
      }

      .vehicle-summary-header {
        display: flex;
        flex-direction: column;
        gap: 0.15mm;
        padding-bottom: 0.35mm;
        border-bottom: 0.75pt solid #000000;
      }

      .vehicle-summary-header__brand {
        font-size: 8pt;
        font-weight: 800;
        line-height: 1;
        letter-spacing: 0.04em;
        color: #4A148C;
      }

      .vehicle-summary-header__line {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 2.4mm;
      }

      .vehicle-summary-header__title {
        margin: 0;
        font-size: 17pt;
        line-height: 1;
        font-weight: 800;
        white-space: nowrap;
      }

      .vehicle-summary-header__meta-inline {
        display: flex;
        align-items: center;
        gap: 1.6mm;
        flex-wrap: nowrap;
        white-space: nowrap;
        font-size: 8.4pt;
        font-weight: 700;
        color: #334155;
      }

      .vehicle-summary-table-wrap {
        flex: 0 0 auto;
        border: 0.75pt solid #000000;
        display: block;
        overflow: hidden;
      }

      .vehicle-summary-table {
        width: 100%;
        height: auto;
        border-collapse: collapse;
        table-layout: fixed;
      }

      .vehicle-summary-table thead tr {
        height: 9mm;
      }

      .vehicle-summary-table tbody tr,
      .vehicle-summary-table tbody td {
        height: var(--summary-row-height);
      }

      .vehicle-summary-table th,
      .vehicle-summary-table td {
        border-right: 0.75pt solid #000000;
        border-bottom: 0.75pt solid #000000;
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
        width: 9mm;
        min-width: 9mm;
      }

      .vehicle-summary-table__index-col {
        background: #ffffff;
        font-size: 8.6pt;
        font-weight: 800;
      }

      .vehicle-summary-table__index-cell {
        background: #ffffff;
        font-size: 8.8pt;
        font-weight: 800;
      }

      .vehicle-summary-table__product-col {
        width: 118mm;
        min-width: 118mm;
        padding: 0.5mm 0.8mm 0.25mm;
        background: #ffffff;
        text-align: center;
        font-size: 9.8pt;
        font-weight: 800;
        line-height: 1.22;
      }

      .vehicle-summary-table__unit-col,
      .vehicle-summary-table__unit-cell {
        width: 13mm;
        min-width: 13mm;
      }

      .vehicle-summary-table__unit-col {
        background: #ffffff;
        font-size: 8.6pt;
        font-weight: 800;
        line-height: 1.22;
      }

      .vehicle-summary-table__unit-cell {
        background: #ffffff;
        font-size: 8.4pt;
        font-weight: 800;
        line-height: 1.48;
        color: #0f172a;
      }

      .vehicle-summary-table__vehicle-col {
        font-size: 9pt;
        font-weight: 800;
        border-bottom-width: 0.75pt;
      }

      .vehicle-summary-table__vehicle-name {
        display: -webkit-box;
        overflow: hidden;
        padding: 0.3mm 0.25mm;
        line-height: 1.02;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
      }

      .vehicle-summary-table__product-cell {
        padding: 0.35mm 0.9mm 0.1mm;
        text-align: left;
        background: #ffffff;
      }

      .vehicle-summary-table__product-line {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 1.1mm;
        min-height: 100%;
      }

      .vehicle-summary-table__product-image {
        display: flex;
        width: var(--summary-thumb-size);
        height: var(--summary-thumb-size);
        flex: 0 0 var(--summary-thumb-size);
        align-items: center;
        justify-content: center;
        overflow: hidden;
        background: #ffffff;
      }

      .vehicle-summary-table__product-image img {
        display: block;
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
      }

      .vehicle-summary-table__product-image-placeholder {
        display: block;
        width: 5.2mm;
        height: 5.2mm;
        border: 0.75pt solid #cbd5e1;
        background: #f8fafc;
      }

      .vehicle-summary-table__product-text {
        display: flex;
        min-width: 0;
        flex: 1;
        align-items: center;
        justify-content: flex-start;
        gap: 0.5mm;
      }

      .vehicle-summary-table__product-name {
        display: block;
        min-width: 0;
        flex: 0 1 auto;
        max-width: none;
        overflow: visible;
        text-overflow: clip;
        white-space: nowrap;
        font-size: 10.4pt;
        font-weight: 800;
        line-height: 1.48;
        color: #0f172a;
      }

      .vehicle-summary-table__qty-cell {
        font-size: 11.4pt;
        font-weight: 800;
        line-height: 1;
        color: #0f172a;
      }
    `}</style>
  );
}

export function VehicleProductSummaryLayout({ data }: { data: VehicleProductSummaryData }) {
  const sheets = buildVehicleSheets(data);

  return (
    <>
      <VehicleSummaryStyles />
      {sheets.map((sheet) => (
        <div key={sheet.key} className="packing-sheet-shell" data-capture-width="794" data-capture-height="1123">
          <VehicleSummarySheet sheet={sheet} />
        </div>
      ))}
    </>
  );
}
