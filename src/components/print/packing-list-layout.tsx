export type PackingListStore = {
  id: string;
  name: string;
  vehicleId: string | null;
  vehicleName: string | null;
};

export type PackingListProduct = {
  key: string;
  sku: string;
  name: string;
  unit: string;
};

export type PackingListVehicle = {
  id: string;
  name: string;
};

export type PackingListData = {
  date: string;
  dateLabel: string;
  organizationName: string;
  stores: PackingListStore[];
  products: PackingListProduct[];
  qty: number[][];
  vehicles: PackingListVehicle[];
};

const SHEET_W = "356mm";
const SHEET_H = "216mm";
const SCREEN_SHEET_W = "1346px";
const SCREEN_SHEET_H = "816px";
const PRODUCTS_PER_PAGE = 40;
const STORES_PER_PAGE = 30;

const VEHICLE_COLORS = ["#123c73", "#0f766e", "#9a3412", "#5b21b6", "#1d4ed8"];
const UNASSIGNED_COLOR = "#64748b";

const COLUMN_COLOR_GROUPS = [
  { headerA: "#c8def4", headerB: "#dcedfb", cellA: "#edf5fd", cellB: "#f7fbff" },
  { headerA: "#d7ebd3", headerB: "#e8f5e3", cellA: "#eef8eb", cellB: "#f7fcf4" },
  { headerA: "#f2e6bd", headerB: "#faf2d7", cellA: "#fbf5e6", cellB: "#fefbf1" },
  { headerA: "#efc9cc", headerB: "#f7dcdf", cellA: "#faeaeb", cellB: "#fdf2f3" },
  { headerA: "#dacbf0", headerB: "#ebe0fa", cellA: "#f0eafb", cellB: "#f8f4fe" },
  { headerA: "#d0ece5", headerB: "#e2f6f1", cellA: "#ebf8f5", cellB: "#f5fcfa" },
  { headerA: "#efdccd", headerB: "#faece0", cellA: "#fbf1ea", cellB: "#fdf7f2" },
  { headerA: "#e4e4e4", headerB: "#f0f0f0", cellA: "#f5f5f5", cellB: "#fafafa" },
] as const;

function calcColWidth(count: number): string {
  const raw = Math.floor(300 / count);
  return `${Math.min(18, Math.max(6, raw))}mm`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function vehicleColor(vehicleId: string | null, vehicles: PackingListVehicle[]): string {
  if (!vehicleId) return UNASSIGNED_COLOR;
  const idx = vehicles.findIndex((vehicle) => vehicle.id === vehicleId);
  return VEHICLE_COLORS[idx % VEHICLE_COLORS.length] ?? VEHICLE_COLORS[0];
}

function getColumnPalette(columnIndex: number) {
  const groupIndex = Math.floor(columnIndex / 5) % COLUMN_COLOR_GROUPS.length;
  const palette = COLUMN_COLOR_GROUPS[groupIndex] ?? COLUMN_COLOR_GROUPS[0];
  return {
    header: palette.headerA,
    cellA: palette.cellA,
    cellB: palette.cellB,
  };
}

const COMBINING_CHARS = /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g;

function getHorizontalLength(str: string): number {
  return str.replace(COMBINING_CHARS, "").length;
}

function splitToThaiClusters(str: string): string[] {
  const clusters: string[] = [];
  const chars = Array.from(str);
  const combiningReg = /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/;

  for (let i = 0; i < chars.length; i += 1) {
    const char = chars[i];
    if (i > 0 && combiningReg.test(char)) {
      clusters[clusters.length - 1] += char;
    } else {
      clusters.push(char);
    }
  }

  return clusters;
}

function splitLongPart(part: string, maxLen = 5): string[] {
  const clusters = splitToThaiClusters(part);
  const chunks: string[] = [];
  let currentChunk = "";
  let currentLen = 0;

  for (const cluster of clusters) {
    const clusterLen = getHorizontalLength(cluster);
    if (currentLen + clusterLen > maxLen) {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = cluster;
      currentLen = clusterLen;
    } else {
      currentChunk += cluster;
      currentLen += clusterLen;
    }
  }

  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

function tokenizeThaiProductName(name: string): string[] {
  const temp = name.trim().replace(/\s+/g, " ");
  const keywords = [
    "เส้นเล็ก",
    "เส้นหมี่",
    "วุ้นเส้น",
    "บะหมี่",
    "ก๋วยจั๊บ",
    "ก๋วยเตี๋ยว",
    "เกี๊ยมอี๋",
    "มังกรคู่",
    "มังกรแดง",
    "มังกร",
    "เกลียว",
    "แผ่น",
    "แบน",
    "อบแห้ง",
    "แห้ง",
    "สด",
    "ตรา",
    "ใหญ่",
    "กลาง",
    "เล็ก",
  ];

  keywords.sort((a, b) => b.length - a.length);

  let prepared = temp;
  for (const keyword of keywords) {
    const regex = new RegExp(`(?<!\\s)${keyword}(?!\\s)`, "g");
    prepared = prepared.replace(regex, ` ${keyword} `);
  }

  prepared = prepared
    .replace(/(\d+)/g, " $1 ")
    .replace(/([\(\[\{].*?[\)\]\}])/g, " $1 ")
    .replace(/\s+/g, " ")
    .trim();

  return prepared.split(" ").filter(Boolean);
}

function splitProductNameToLines(name: string): string[] {
  const cleanName = name.trim();
  if (!cleanName) return [];

  let parts = tokenizeThaiProductName(cleanName);
  const subParts: string[] = [];

  for (const part of parts) {
    if (getHorizontalLength(part) > 6) {
      subParts.push(...splitLongPart(part, 5));
    } else {
      subParts.push(part);
    }
  }

  parts = subParts;

  while (parts.length > 4) {
    let minIndex = 0;
    let minLength = Number.POSITIVE_INFINITY;

    for (let i = 0; i < parts.length - 1; i += 1) {
      const combinedLen = getHorizontalLength(parts[i]) + getHorizontalLength(parts[i + 1]);
      if (combinedLen < minLength) {
        minLength = combinedLen;
        minIndex = i;
      }
    }

    parts[minIndex] = `${parts[minIndex]}${parts[minIndex + 1]}`;
    parts.splice(minIndex + 1, 1);
  }

  const finalParts = parts.slice(0, 4);
  if (parts.length >= 4) {
    const last = finalParts[3] ?? "";
    const base = getHorizontalLength(last) > 5 ? splitLongPart(last, 4)[0] ?? last : last;
    finalParts[3] = `${base}...`;
  }

  return finalParts;
}

type PageDef = {
  vehicleId: string | null;
  vehicleName: string | null;
  accentColor: string;
  pageStores: PackingListStore[];
  pageStoreIndices: number[];
  pageProducts: PackingListProduct[];
  pageProductIndices: number[];
  vehicleStoreCount: number;
  globalPage: number;
  totalPages: number;
  storeChunk: number;
  productChunk: number;
  productTotalChunks: number;
  dateLabel: string;
  orgName: string;
};

function buildPages(data: PackingListData): PageDef[] {
  type Group = { vehicleId: string | null; vehicleName: string | null; storeIndices: number[] };
  const groupMap = new Map<string, Group>();

  for (const vehicle of data.vehicles) {
    groupMap.set(vehicle.id, { vehicleId: vehicle.id, vehicleName: vehicle.name, storeIndices: [] });
  }
  groupMap.set("__unassigned__", { vehicleId: null, vehicleName: null, storeIndices: [] });

  data.stores.forEach((store, index) => {
    const key = store.vehicleId ?? "__unassigned__";
    if (!groupMap.has(key)) {
      groupMap.set(key, { vehicleId: store.vehicleId, vehicleName: store.vehicleName, storeIndices: [] });
    }
    groupMap.get(key)!.storeIndices.push(index);
  });

  const groups = Array.from(groupMap.values()).filter((group) => group.storeIndices.length > 0);
  const defs: Omit<PageDef, "globalPage" | "totalPages">[] = [];

  for (const group of groups) {
    const { vehicleId, vehicleName, storeIndices } = group;
    const accentColor = vehicleColor(vehicleId, data.vehicles);
    const activeProductIndices = data.products
      .map((_, index) => index)
      .filter((productIndex) => storeIndices.some((storeIndex) => data.qty[productIndex][storeIndex] > 0));

    const storeChunks = chunk(storeIndices, STORES_PER_PAGE);
    const productChunks = chunk(activeProductIndices, PRODUCTS_PER_PAGE);

    for (let storeChunkIndex = 0; storeChunkIndex < storeChunks.length; storeChunkIndex += 1) {
      for (let productChunkIndex = 0; productChunkIndex < productChunks.length; productChunkIndex += 1) {
        const pageStoreIndices = storeChunks[storeChunkIndex];
        const pageProductIndices = productChunks[productChunkIndex];

        defs.push({
          vehicleId,
          vehicleName,
          accentColor,
          pageStores: pageStoreIndices.map((storeIndex) => data.stores[storeIndex]),
          pageStoreIndices,
          pageProducts: pageProductIndices.map((productIndex) => data.products[productIndex]),
          pageProductIndices,
          vehicleStoreCount: storeIndices.length,
          storeChunk: storeChunkIndex + 1,
          productChunk: productChunkIndex + 1,
          productTotalChunks: productChunks.length,
          dateLabel: data.dateLabel,
          orgName: data.organizationName,
        });
      }
    }
  }

  const totalPages = defs.length;
  return defs.map((def, index) => ({ ...def, globalPage: index + 1, totalPages }));
}

function PackingListPage({ p, data }: { p: PageDef; data: PackingListData }) {
  const colW = calcColWidth(Math.max(p.pageProducts.length, 1));
  const pageColTotals = p.pageProductIndices.map((productIndex) =>
    p.pageStoreIndices.reduce((sum, storeIndex) => sum + data.qty[productIndex][storeIndex], 0),
  );

  return (
    <section className="packing-sheet">
      <div className="packing-sheet__inner">
        <header className="packing-header" style={{ borderColor: p.accentColor }}>
          <div className="packing-header__title-block">
            <div className="packing-header__org">{p.orgName}</div>
            <h1 className="packing-header__title">ตารางเช็คออเดอร์ลูกค้า</h1>
            <div className="packing-header__subtitle">
              <span>{p.vehicleName ?? "ยังไม่ได้กำหนดรถจัดส่ง"}</span>
              <span>วันที่ {p.dateLabel}</span>
            </div>
          </div>

          <div className="packing-header__meta">
            <div className="packing-header__meta-cell">
              <span>ร้านค้า</span>
              <strong>{p.vehicleStoreCount.toLocaleString("th-TH")}</strong>
            </div>
            <div className="packing-header__meta-cell">
              <span>หน้า</span>
              <strong>
                {p.globalPage}/{p.totalPages}
              </strong>
            </div>
            <div className="packing-header__meta-cell">
              <span>กลุ่มสินค้า</span>
              <strong>
                {p.productChunk}/{p.productTotalChunks}
              </strong>
            </div>
          </div>
        </header>

        <div className="packing-table-wrap">
          <table className="packing-table">
            <thead>
              <tr>
                <th className="packing-col packing-col--store">ข้อมูลลูกค้า / ร้านค้า</th>
                {p.pageProducts.map((product, columnIndex) => {
                  const palette = getColumnPalette(columnIndex);
                  return (
                    <th
                      key={product.key}
                      className="packing-col packing-col--product"
                      style={{ width: colW, backgroundColor: palette.header }}
                    >
                      <div className="packing-product-header">
                        <div className="packing-product-header__name">
                          {splitProductNameToLines(product.name).map((line, index) => (
                            <span key={`${product.key}-${index}`}>{line}</span>
                          ))}
                        </div>
                        <span className="packing-product-header__unit">{product.unit}</span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {p.pageStores.map((store, rowIndex) => {
                const storeIndex = p.pageStoreIndices[rowIndex];
                const cells = p.pageProductIndices.map((productIndex) => data.qty[productIndex][storeIndex]);

                return (
                  <tr key={store.id} className="packing-table__row">
                    <td className="packing-cell packing-cell--store">{store.name}</td>
                    {cells.map((value, cellIndex) => {
                      const palette = getColumnPalette(cellIndex);
                      const rowShade = rowIndex % 2 === 0 ? palette.cellA : palette.cellB;
                      return (
                        <td
                          key={`${store.id}-${cellIndex}`}
                          className={value > 0 ? "packing-cell packing-cell--qty" : "packing-cell packing-cell--empty"}
                          style={{ backgroundColor: rowShade }}
                        >
                          {value > 0 ? value.toLocaleString("th-TH") : ""}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              <tr className="packing-table__total-row">
                <td className="packing-cell packing-cell--total-label">รวมยอด</td>
                {pageColTotals.map((total, index) => (
                  <td
                    key={`total-${index}`}
                    className="packing-cell packing-cell--total"
                    style={{ backgroundColor: "#ffd400" }}
                  >
                    {total > 0 ? total.toLocaleString("th-TH") : ""}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <footer className="packing-footer">
          <span>ร้านค้าในหน้านี้ {p.pageStores.length.toLocaleString("th-TH")} ร้าน</span>
          <span>ตารางเช็คออเดอร์ลูกค้า - กลุ่ม{p.storeChunk}_แผ่น{p.productChunk}</span>
        </footer>
      </div>
    </section>
  );
}

export function PackingListLayout({ data }: { data: PackingListData }) {
  const pages = buildPages(data);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;700;800&display=swap');

        @page { size: 356mm 216mm; margin: 0; }

        @media print {
          html, body {
            width: 356mm !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            background: #ffffff !important;
          }

          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }

          main,
          div[class*="pull-to-refresh"],
          div[class*="RootAppLayoutShell"] {
            margin: 0 !important;
            padding: 0 !important;
            display: block !important;
            width: auto !important;
            background: transparent !important;
            box-shadow: none !important;
          }

          .no-print {
            display: none !important;
          }

          .packing-print-container {
            margin: 0 !important;
            padding: 0 !important;
          }

          .packing-sheet {
            width: 356mm !important;
            height: 216mm !important;
            margin: 0 !important;
            border: none !important;
            box-shadow: none !important;
            page-break-after: always;
            break-after: page;
          }

          .packing-sheet:last-child {
            page-break-after: auto;
            break-after: auto;
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
            gap: 20px;
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
            gap: 10px;
            width: 100vw;
            padding: 66px 0 20px;
          }

          .packing-sheet-shell {
            --packing-mobile-available: calc(100vw - 8px);
            --packing-mobile-scale: min(1, calc(var(--packing-mobile-available) / 1346px));
            width: var(--packing-mobile-available);
            height: calc(816px * var(--packing-mobile-scale));
            max-width: 100vw;
            overflow: hidden;
          }

          .packing-sheet {
            width: 1346px !important;
            height: 816px !important;
            max-width: none !important;
            flex: none;
            transform: scale(var(--packing-mobile-scale));
            transform-origin: top center;
            box-shadow: 0 8px 20px rgba(15, 23, 42, 0.14);
          }
        }

        .packing-sheet {
          width: ${SHEET_W};
          height: ${SHEET_H};
          overflow: hidden;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          font-family: "Sarabun", sans-serif;
          color: #0f172a;
          box-sizing: border-box;
        }

        .packing-sheet__inner {
          display: flex;
          flex-direction: column;
          height: 100%;
          padding: 5mm 5mm 4mm;
          gap: 3mm;
          box-sizing: border-box;
        }

        .packing-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 8mm;
          padding-bottom: 2.2mm;
          border-bottom: 1.4px solid #123c73;
        }

        .packing-header__title-block {
          min-width: 0;
          flex: 1;
        }

        .packing-header__org {
          font-size: 8.2pt;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #123c73;
        }

        .packing-header__title {
          margin: 0.8mm 0 0.5mm;
          font-size: 15pt;
          line-height: 1;
          font-weight: 800;
          color: #0f172a;
        }

        .packing-header__subtitle {
          display: flex;
          gap: 6mm;
          flex-wrap: wrap;
          font-size: 8.2pt;
          font-weight: 600;
          color: #475569;
        }

        .packing-header__meta {
          display: grid;
          grid-template-columns: repeat(3, minmax(18mm, auto));
          gap: 1px;
          border: 1px solid #cbd5e1;
          background: #cbd5e1;
          flex-shrink: 0;
        }

        .packing-header__meta-cell {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.4mm;
          min-height: 12mm;
          padding: 1.4mm 2mm;
          background: #ffffff;
        }

        .packing-header__meta-cell span {
          font-size: 7pt;
          font-weight: 700;
          color: #64748b;
        }

        .packing-header__meta-cell strong {
          font-size: 9pt;
          font-weight: 800;
          color: #0f172a;
        }

        .packing-table-wrap {
          flex: 1;
          min-height: 0;
          border: 1.4px solid #111827;
        }

        .packing-table {
          width: 100%;
          height: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }

        .packing-col,
        .packing-cell {
          border-right: 1px solid #111827;
          border-bottom: 1px solid #111827;
          box-sizing: border-box;
        }

        .packing-col:last-child,
        .packing-cell:last-child {
          border-right: none;
        }

        .packing-col {
          padding: 0;
          text-align: center;
          vertical-align: middle;
        }

        .packing-col--store {
          width: 38mm;
          min-width: 38mm;
          padding: 2mm 2.2mm;
          background: #ffffff;
          color: #0f172a;
          font-size: 8.2pt;
          font-weight: 800;
          text-align: left;
        }

        .packing-product-header {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 0.5mm;
          min-height: 17mm;
          padding: 1mm 0.7mm;
        }

        .packing-product-header__name {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.2mm;
          flex: 1;
          font-size: 6.2pt;
          line-height: 0.94;
          font-weight: 700;
          color: #0f172a;
        }

        .packing-product-header__name span {
          display: block;
          max-width: 100%;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }

        .packing-product-header__unit {
          font-size: 6pt;
          font-weight: 700;
          color: #475569;
        }

        .packing-table__row {
          background: #ffffff;
        }

        .packing-cell {
          padding: 0;
          text-align: center;
          vertical-align: middle;
        }

        .packing-cell--store {
          padding: 0 2mm;
          text-align: left;
          font-size: 8.8pt;
          font-weight: 700;
          line-height: 1.05;
          color: #0f172a;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .packing-cell--qty,
        .packing-cell--total {
          font-size: 11pt;
          font-weight: 800;
          color: #0f172a;
        }

        .packing-cell--empty {
          font-size: 8pt;
          font-weight: 600;
          color: transparent;
        }

        .packing-table__total-row .packing-cell {
          border-top: 1.2px solid #111827;
        }

        .packing-cell--total-label {
          padding: 0 2mm;
          text-align: left;
          font-size: 8.8pt;
          font-weight: 800;
          color: #111827;
          background: #ffd400;
        }

        .packing-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 6mm;
          font-size: 7.2pt;
          font-weight: 600;
          color: #64748b;
        }
      `}</style>

      {pages.map((page) => (
        <div
          key={`${page.vehicleId ?? "unassigned"}-s${page.storeChunk}-p${page.productChunk}`}
          className="packing-sheet-shell"
        >
          <PackingListPage p={page} data={data} />
        </div>
      ))}
    </>
  );
}
