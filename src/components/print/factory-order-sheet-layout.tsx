import type { VehicleProductSummaryData } from "@/lib/orders/vehicle-product-summary";
import type { CSSProperties } from "react";

const SHEET_W = "210mm";
const SHEET_H = "297mm";
const SCREEN_SHEET_W = "794px";
const SCREEN_SHEET_H = "1123px";
const ITEMS_PER_PAGE = 15;
const ROW_HEIGHT_MM = 14;

type SheetPalette = {
  header: string;
  body: string;
  border: string;
};

// Designated soft pastel palettes for specific factories:
// - TYV001 โรงงานมหาชัย: สีเขียวเข้มกว่าโรงงานดอกบัว
// - TYV005 โรงงานดอกบัว: สีเขียวที่อ่อนกว่าโรงงานมหาชัย
// - TYV002 โรงงานมังกร: สีฟ้า
// - TYV009 โรงงานโบตั๋น: สีชมพู
// - TYV008 โรงงานบะหมี่หง: สีเหลือง
const DESIGNATED_FACTORY_PALETTES: Record<string, SheetPalette> = {
  // TYV001 โรงงานมหาชัย - เขียวมิดเดิลพาสเทล (เข้มกว่าดอกบัว ชัดเจน อ่านง่าย สวยกลมกลืน)
  mahachai: { header: "#a7f3d0", body: "#ecfdf5", border: "#000000" },
  // TYV005 โรงงานดอกบัว - เขียวอ่อนพาสเทล (อ่อนกว่ามหาชัย ละมุน สบายตา)
  dokbua: { header: "#dcfce7", body: "#f0fdf4", border: "#000000" },
  // TYV002 โรงงานมังกร - ฟ้าพาสเทล
  dragon: { header: "#bae6fd", body: "#f0f9ff", border: "#000000" },
  // TYV009 โรงงานโบตั๋น - ชมพูพาสเทล
  peony: { header: "#fbcfe8", body: "#fdf2f8", border: "#000000" },
  // TYV008 โรงงานบะหมี่หง / หงส์ - เหลืองเนยพาสเทล
  hong: { header: "#fef08a", body: "#fefce8", border: "#000000" },
};

// Fallback soft pastel palettes for any unspecified factories (แยกสีต่างกันตามโรงงาน)
const FALLBACK_FACTORY_PALETTES: SheetPalette[] = [
  { header: "#fed7aa", body: "#fff7ed", border: "#000000" }, // Soft Warm Peach (ส้มพีช)
  { header: "#e9d5ff", body: "#faf5ff", border: "#000000" }, // Soft Lavender (ม่วงลาเวนเดอร์)
  { header: "#99f6e4", body: "#f0fdfa", border: "#000000" }, // Soft Teal (เขียวทะเล/เทล)
  { header: "#c7d2fe", body: "#eef2ff", border: "#000000" }, // Soft Periwinkle (ฟ้าอมม่วงคลาสสิก)
  { header: "#fecdd3", body: "#fff1f2", border: "#000000" }, // Soft Coral (คอรัลพาสเทล)
  { header: "#a5f3fc", body: "#ecfeff", border: "#000000" }, // Soft Pale Cyan (ฟ้าไซแอนใส)
  { header: "#d9f99d", body: "#f7fee7", border: "#000000" }, // Soft Sage / Lime (เขียวเซจละมุน)
  { header: "#f5d0fe", body: "#fdf4ff", border: "#000000" }, // Soft Plum / Lilac (พลัมอ่อน)
  { header: "#cbd5e1", body: "#f8fafc", border: "#000000" }, // Soft Slate / Ice (ฟ้าหม่นไอซ์บลู)
  { header: "#ffedd5", body: "#fffaf5", border: "#000000" }, // Soft Warm Sand / Apricot (ทรายอุ่น)
];

function formatQty(value: number) {
  return value > 0 ? value.toLocaleString("th-TH") : "";
}

function hashString(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = Math.imul(31, hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function getSheetColumnPalette(factoryName?: string, factoryCode?: string, columnIndex = 0): SheetPalette {
  const combined = `${factoryName || ""} ${factoryCode || ""}`.trim().toLowerCase();

  // 1. TYV001 โรงงานมหาชัย (เขียวเข้มกว่าดอกบัว)
  if (combined.includes("tyv001") || combined.includes("มหาชัย")) {
    return DESIGNATED_FACTORY_PALETTES.mahachai;
  }
  // 2. TYV005 โรงงานดอกบัว (เขียวอ่อนกว่ามหาชัย)
  if (combined.includes("tyv005") || combined.includes("ดอกบัว")) {
    return DESIGNATED_FACTORY_PALETTES.dokbua;
  }
  // 3. TYV002 โรงงานมังกร (ฟ้า)
  if (combined.includes("tyv002") || combined.includes("มังกร")) {
    return DESIGNATED_FACTORY_PALETTES.dragon;
  }
  // 4. TYV009 โรงงานโบตั๋น (ชมพู)
  if (combined.includes("tyv009") || combined.includes("โบตั๋น")) {
    return DESIGNATED_FACTORY_PALETTES.peony;
  }
  // 5. TYV008 โรงงานบะหมี่หง / หงส์ (เหลือง)
  if (combined.includes("tyv008") || combined.includes("หง")) {
    return DESIGNATED_FACTORY_PALETTES.hong;
  }

  // Fallback: Separate color by factory only (warehouse does not alter color)
  if (!combined) {
    return FALLBACK_FACTORY_PALETTES[columnIndex % FALLBACK_FACTORY_PALETTES.length];
  }

  const hashF = hashString(combined);
  const index = Math.abs(hashF) % FALLBACK_FACTORY_PALETTES.length;
  return FALLBACK_FACTORY_PALETTES[index];
}

function FactoryOrderSheet({ data, startIndex }: { data: VehicleProductSummaryData; startIndex: number }) {
  return (
    <section className="packing-sheet factory-order-sheet vehicle-summary-sheet">
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
                  const palette = getSheetColumnPalette(data.factoryName, data.factoryCode, columnIndex);
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
                    const palette = getSheetColumnPalette(data.factoryName, data.factoryCode, vehicleIndex);
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
      @font-face {
        font-family: "Angsana New Factory";
        src: url("/fonts/angsana-new/ANGSA.woff") format("woff");
        font-weight: 400;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: "Angsana New Factory";
        src: url("/fonts/angsana-new/angsab.woff") format("woff");
        font-weight: 700;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: "Angsana New Factory";
        src: url("/fonts/angsana-new/angsab.woff") format("woff");
        font-weight: 800 900;
        font-style: normal;
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

        .packing-sheet.factory-order-sheet {
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

        .factory-order-sheet-shell {
          width: ${SCREEN_SHEET_W};
          height: ${SCREEN_SHEET_H};
          display: flex;
          justify-content: center;
          align-items: flex-start;
        }

        .packing-sheet.factory-order-sheet {
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

        .factory-order-sheet-shell {
          --summary-mobile-available: calc(100vw - 8px);
          --summary-mobile-scale: min(1, calc(var(--summary-mobile-available) / ${SCREEN_SHEET_W}));
          width: var(--summary-mobile-available);
          height: calc(${SCREEN_SHEET_H} * var(--summary-mobile-scale));
          max-width: 100vw;
          overflow: hidden;
        }

        .packing-sheet.factory-order-sheet {
          width: ${SCREEN_SHEET_W} !important;
          height: ${SCREEN_SHEET_H} !important;
          max-width: none !important;
          flex: none;
          transform: scale(var(--summary-mobile-scale));
          transform-origin: top center;
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.14);
        }
      }

      .packing-sheet.factory-order-sheet {
        width: ${SHEET_W};
        height: ${SHEET_H};
        overflow: hidden;
        background: #ffffff;
        border: 1px solid #000000;
        color: #0f172a;
        box-sizing: border-box;
        font-family: "Angsana New Factory", "Sarabun", "Noto Sans Thai", sans-serif;
        font-synthesis: none;
      }

      .factory-order-sheet .vehicle-summary-sheet__inner {
        display: flex;
        flex-direction: column;
        height: 100%;
        padding: 4mm;
        gap: 0.9mm;
        box-sizing: border-box;
      }

      .factory-order-sheet .vehicle-summary-header {
        display: flex;
        flex-direction: column;
        gap: 0.15mm;
        padding-bottom: 0.35mm;
        border-bottom: 1px solid #000000;
      }

      .factory-order-sheet .vehicle-summary-header__title-container {
        display: flex;
        justify-content: center;
        width: 100%;
        margin-top: 0.6mm;
        margin-bottom: 0.4mm;
      }

      .factory-order-sheet .vehicle-summary-header__brand {
        font-size: 15.5pt;
        font-weight: 800;
        line-height: 1.25;
        letter-spacing: 0.04em;
        color: #4A148C;
      }

      .factory-order-sheet .vehicle-summary-header__line {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 0.15mm;
        width: 100%;
      }

      .factory-order-sheet .vehicle-summary-header__title {
        margin: 0;
        font-size: 27.9pt;
        line-height: 1.25;
        font-weight: 800;
        white-space: nowrap;
        text-align: center;
      }

      .factory-order-sheet .vehicle-summary-header__meta-inline {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 1.6mm;
        flex-wrap: nowrap;
        white-space: nowrap;
        font-size: 14.72pt;
        font-weight: 700;
        color: #334155;
      }

      .factory-order-sheet .vehicle-summary-table-wrap {
        flex: 0 0 auto;
        min-height: 0;
        border: 1px solid #000000;
        display: flex;
        align-items: stretch;
        overflow: hidden;
      }

      .factory-order-sheet .vehicle-summary-table {
        width: 100%;
        height: auto;
        border-collapse: collapse;
        table-layout: fixed;
      }

      .factory-order-sheet .vehicle-summary-table thead tr {
        height: 10mm;
      }

      .factory-order-sheet .vehicle-summary-table tbody tr,
      .factory-order-sheet .vehicle-summary-table tbody td {
        height: var(--summary-row-height);
      }

      .factory-order-sheet .vehicle-summary-table th,
      .factory-order-sheet .vehicle-summary-table td {
        border-right: 1px solid #000000;
        border-bottom: 1px solid #000000;
        padding: 0;
        text-align: center;
        vertical-align: middle;
        box-sizing: border-box;
      }

      .factory-order-sheet .vehicle-summary-table tr > *:last-child {
        border-right: none;
      }

      .factory-order-sheet .vehicle-summary-table tbody tr:last-child > * {
        border-bottom: none;
      }

      .factory-order-sheet .vehicle-summary-table__index-col,
      .factory-order-sheet .vehicle-summary-table__index-cell {
        width: 10mm;
        min-width: 10mm;
      }

      .factory-order-sheet .vehicle-summary-table__index-col {
        background: #ffffff;
        font-size: 15.5pt;
        font-weight: 800;
      }

      .factory-order-sheet .vehicle-summary-table__index-cell {
        background: #ffffff;
        font-size: 15.5pt;
        font-weight: 700;
      }

      .factory-order-sheet .vehicle-summary-table__product-col {
        width: 130mm;
        min-width: 130mm;
        padding: 0.5mm 0.8mm 0.25mm;
        background: #ffffff;
        text-align: center;
        font-size: 17.05pt;
        font-weight: 800;
        line-height: 1.25;
      }

      .factory-order-sheet .vehicle-summary-table__unit-col,
      .factory-order-sheet .vehicle-summary-table__unit-cell {
        width: 18mm;
        min-width: 18mm;
      }

      .factory-order-sheet .vehicle-summary-table__unit-col {
        background: #ffffff;
        font-size: 15.5pt;
        font-weight: 800;
        line-height: 1.25;
      }

      .factory-order-sheet .vehicle-summary-table__unit-cell {
        background: #ffffff;
        font-size: 17.05pt;
        font-weight: 700;
        line-height: 1.55;
        color: #0f172a;
      }

      .factory-order-sheet .vehicle-summary-table__vehicle-col {
        font-size: 17.05pt;
        font-weight: 800;
        border-bottom-width: 1px;
      }

      .factory-order-sheet .vehicle-summary-table__vehicle-name {
        display: -webkit-box;
        overflow: hidden;
        padding: 0.3mm 0.25mm;
        line-height: 1.35;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
      }

      .factory-order-sheet .vehicle-summary-table__product-cell {
        padding: 0.6mm 3mm;
        text-align: center;
        background: #ffffff;
      }

      .factory-order-sheet .vehicle-summary-table__product-line {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 0.15mm;
        width: 100%;
        min-height: 100%;
        padding: 0.6mm 3mm;
        box-sizing: border-box;
      }

      .factory-order-sheet .vehicle-summary-table__product-name {
        display: block;
        min-width: 0;
        flex: 0 1 auto;
        max-width: none;
        overflow: visible;
        text-overflow: clip;
        white-space: nowrap;
        font-size: 20.15pt;
        font-weight: 700;
        line-height: 1.2;
        color: #0f172a;
      }

      .factory-order-sheet .vehicle-summary-table__qty-cell {
        font-size: 21.7pt;
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
          className="packing-sheet-shell factory-order-sheet-shell"
          data-capture-width="794"
          data-capture-height="1123"
        >
          <FactoryOrderSheet data={page.data} startIndex={page.startIndex} />
        </div>
      ))}
    </>
  );
}
