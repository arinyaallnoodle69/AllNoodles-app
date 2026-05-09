// ─── Types ────────────────────────────────────────────────────────────────────

export type PackingListStore = {
  id: string;
  name: string;
  vehicleId: string | null;
  vehicleName: string | null;
};

export type PackingListProduct = {
  key: string; // sku||unit
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
  /** qty[productIdx][storeIdx] */
  qty: number[][];
  /** ordered list of vehicles (by sort_order) */
  vehicles: PackingListVehicle[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const SHEET_W = "356mm"; // F14 (Legal) Landscape Width
const SHEET_H = "216mm"; // F14 (Legal) Landscape Height

// ─── Pagination helpers ───────────────────────────────────────────────────────

/** Strictly 30 stores per page row for F14 Landscape */
function calcStorePageCount(n: number): number {
  return Math.ceil(n / 30);
}

/** Strictly 30 products per page column for F14 Landscape */
function calcProductPageCount(n: number): number {
  return Math.ceil(n / 30);
}

/** Column width for products: subtract ~55mm for # and Store Name, divide remainder by 30 */
function calcColWidth(count: number): string {
  // F14 is 356mm. Subtracting ~55mm leaves ~301mm
  const raw = Math.floor(301 / count); 
  return `${Math.min(28, Math.max(8, raw))}mm`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const VEHICLE_COLORS = ["#1e3a5f", "#065f46", "#7c2d12", "#4c1d95", "#1e3a5f"];
const UNASSIGNED_COLOR = "#64748b";

function vehicleColor(vehicleId: string | null, vehicles: PackingListVehicle[]): string {
  if (!vehicleId) return UNASSIGNED_COLOR;
  const idx = vehicles.findIndex((v) => v.id === vehicleId);
  return VEHICLE_COLORS[idx % VEHICLE_COLORS.length] ?? VEHICLE_COLORS[0];
}

// ─── Page definition ──────────────────────────────────────────────────────────

type PageDef = {
  vehicleId: string | null;
  vehicleName: string | null;
  accentColor: string;
  pageStores: PackingListStore[];
  pageStoreIndices: number[]; // relative to full data.stores
  pageProducts: PackingListProduct[];
  pageProductIndices: number[]; // relative to full data.products
  vehicleStoreCount: number;
  vehicleActiveProductIndices: number[];
  vehicleTotal: number;
  globalPage: number;
  totalPages: number;
  storeChunk: number;
  storeTotalChunks: number;
  productChunk: number;
  productTotalChunks: number;
  dateLabel: string;
  orgName: string;
  // Numbers relative to the current vehicle
  storeVehicleNums: number[]; 
  productVehicleNums: number[];
};

function buildPages(data: PackingListData): PageDef[] {
  // Group stores by vehicle
  type Group = { vehicleId: string | null; vehicleName: string | null; storeIndices: number[] };
  const groupMap = new Map<string, Group>();

  for (const v of data.vehicles) {
    groupMap.set(v.id, { vehicleId: v.id, vehicleName: v.name, storeIndices: [] });
  }
  groupMap.set("__unassigned__", { vehicleId: null, vehicleName: null, storeIndices: [] });

  data.stores.forEach((store, si) => {
    const key = store.vehicleId ?? "__unassigned__";
    if (!groupMap.has(key)) {
      groupMap.set(key, { vehicleId: store.vehicleId, vehicleName: store.vehicleName, storeIndices: [] });
    }
    groupMap.get(key)!.storeIndices.push(si);
  });

  const groups = Array.from(groupMap.values()).filter((g) => g.storeIndices.length > 0);
  const defs: Omit<PageDef, "globalPage" | "totalPages">[] = [];

  for (const group of groups) {
    const { vehicleId, vehicleName, storeIndices } = group;
    const accentColor = vehicleColor(vehicleId, data.vehicles);

    // Filter products that have any quantity for this vehicle's stores
    const activeProdIndices = data.products
      .map((_, pi) => pi)
      .filter((pi) => storeIndices.some((si) => data.qty[pi][si] > 0));
    
    // Create vehicle-specific numbering (starts from 1 for each vehicle)
    const storeNumMap = new Map<string, number>();
    storeIndices.forEach((si, i) => storeNumMap.set(data.stores[si].id, i + 1));

    const productNumMap = new Map<string, number>();
    activeProdIndices.forEach((pi, i) => productNumMap.set(data.products[pi].key, i + 1));

    const vehicleTotal = storeIndices.reduce((sum, si) => 
      sum + activeProdIndices.reduce((ps, pi) => ps + data.qty[pi][si], 0), 0
    );

    const storeTotalChunks = calcStorePageCount(storeIndices.length);
    const storeChunkSize = Math.ceil(storeIndices.length / storeTotalChunks);
    const storeChunks = chunk(storeIndices, storeChunkSize);

    const productTotalChunks = calcProductPageCount(activeProdIndices.length);
    const prodChunkSize = Math.ceil(activeProdIndices.length / productTotalChunks);
    const productChunks = chunk(activeProdIndices, prodChunkSize);

    for (let sc = 0; sc < storeChunks.length; sc++) {
      for (let pc = 0; pc < productChunks.length; pc++) {
        const sIndices = storeChunks[sc];
        const pIndices = productChunks[pc];
        defs.push({
          vehicleId,
          vehicleName,
          accentColor,
          pageStores: sIndices.map((si) => data.stores[si]),
          pageStoreIndices: sIndices,
          pageProducts: pIndices.map(pi => data.products[pi]),
          pageProductIndices: pIndices,
          vehicleStoreCount: storeIndices.length,
          vehicleActiveProductIndices: activeProdIndices,
          vehicleTotal,
          storeChunk: sc + 1,
          storeTotalChunks,
          productChunk: pc + 1,
          productTotalChunks,
          dateLabel: data.dateLabel,
          orgName: data.organizationName,
          storeVehicleNums: sIndices.map(si => storeNumMap.get(data.stores[si].id) ?? 0),
          productVehicleNums: pIndices.map(pi => productNumMap.get(data.products[pi].key) ?? 0),
        });
      }
    }
  }

  const totalPages = defs.length;
  return defs.map((d, i) => ({ ...d, globalPage: i + 1, totalPages }));
}

// ─── Page header ──────────────────────────────────────────────────────────────

function PageHeader({ p }: { p: PageDef }) {
  const { accentColor } = p;
  const isUnassigned = p.vehicleId === null;

  return (
    <div style={{ borderBottom: `2.5px solid ${accentColor}`, padding: "0 2mm 0.3mm" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "3mm" }}>
          <div style={{
            background: accentColor, color: "#fff",
            fontWeight: 900, fontSize: "12pt",
            padding: "0.4mm 5mm", borderRadius: "0 0 6px 6px",
          }}>
            {isUnassigned ? "ยังไม่ได้กำหนดรถ" : `🚛 ${p.vehicleName}`}
          </div>
          <span style={{ fontSize: "8.5pt", color: "#64748b", fontWeight: 700 }}>{p.orgName}</span>
        </div>
        <div style={{ display: "flex", gap: "6mm", alignItems: "baseline" }}>
          <span style={{ fontSize: "9pt", color: "#1e293b" }}>
            วันที่ <strong style={{ color: accentColor }}>{p.dateLabel}</strong>
          </span>
          <span style={{ fontSize: "9pt", color: "#1e293b" }}>
            {p.vehicleStoreCount} ร้าน
            {" · "}<strong style={{ color: accentColor }}>{p.vehicleTotal.toLocaleString("th-TH")}</strong> หน่วย
          </span>
          <span style={{
            fontSize: "8.5pt", fontWeight: 800, color: "#fff",
            background: "#1e293b", padding: "0.5mm 3mm", borderRadius: "3px",
          }}>
            หน้า {p.globalPage}/{p.totalPages}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Single page ──────────────────────────────────────────────────────────────

function PackingListPage({ p, data }: { p: PageDef; data: PackingListData }) {
  const { accentColor } = p;
  const colW = calcColWidth(p.pageProducts.length);

  const pageColTotals = p.pageProductIndices.map((pi) =>
    p.pageStoreIndices.reduce((sum, si) => sum + data.qty[pi][si], 0)
  );
  const pageGrandTotal = pageColTotals.reduce((a, b) => a + b, 0);

  return (
    <div className="packing-sheet">
      <div style={{
        padding: "0",
        display: "flex", flexDirection: "column",
        height: "100%", boxSizing: "border-box",
      }}>
        <PageHeader p={p} />

        <table className="packing-matrix" style={{
          width: "100%", borderCollapse: "collapse",
          fontSize: "11pt", fontFamily: "'Sarabun', sans-serif", flex: 1,
          tableLayout: "fixed",
        }}>
          <thead>
            {/* Row 1: Product Names (Vertical) */}
            <tr style={{ background: "#f1f5f9" }}>
              <th style={{ width: "8mm", height: "32mm", padding: "0" }} />
              <th style={{ width: "45mm", height: "32mm", padding: "0" }} />
              {p.pageProducts.map((product) => (
                <th key={product.key} style={{
                  width: colW, height: "32mm",
                  textAlign: "center", padding: "0", verticalAlign: "bottom",
                }}>
                  <div style={{
                    writingMode: "vertical-rl",
                    transform: "rotate(180deg)",
                    fontSize: "7.5pt", fontWeight: 700, color: accentColor,
                    whiteSpace: "nowrap",
                    paddingBottom: "1mm", paddingLeft: "0.2mm",
                    maxHeight: "30mm", overflow: "hidden",
                    margin: "0 auto", textAlign: "left"
                  }}>
                    {product.name}
                  </div>
                </th>
              ))}
            </tr>

            {/* Row 2: Header Labels */}
            <tr style={{ background: accentColor }}>
              <th style={{ padding: "0.3mm", textAlign: "center", color: "rgba(255,255,255,0.7)", fontSize: "8pt" }}>#</th>
              <th style={{ padding: "0.3mm 2.5mm", textAlign: "left", color: "#fff", fontSize: "11pt", fontWeight: 900 }}>ชื่อร้านค้า</th>
              {p.pageProducts.map((_, idx) => (
                <th key={idx} style={{
                  padding: "0.3mm 0.1mm", textAlign: "center",
                  color: "#fff", fontSize: "11pt", fontWeight: 900,
                }}>
                  {p.productVehicleNums[idx]}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {p.pageStores.map((store, rowIdx) => {
              const si = p.pageStoreIndices[rowIdx];
              const cells = p.pageProductIndices.map((pi) => data.qty[pi][si]);
              const isEven = rowIdx % 2 === 1;
              const displayNum = p.storeVehicleNums[rowIdx];

              return (
                <tr key={store.id} style={{ background: isEven ? "#f1f5f9" : "#ffffff" }}>
                  <td style={{ padding: "0.15mm 0.5mm", textAlign: "center", color: "#64748b", fontSize: "10pt", fontWeight: 700 }}>
                    {displayNum}
                  </td>
                  <td style={{ padding: "0.15mm 2.5mm", fontWeight: 800, color: "#000", fontSize: "12pt", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {store.name}
                  </td>
                  {cells.map((val, idx) => (
                    <td key={idx} style={{
                      padding: "0.15mm 0.5mm !important", textAlign: "center",
                      fontWeight: 900,
                      color: val > 0 ? "#000" : "rgba(0,0,0,0.08)",
                      fontSize: val > 0 ? "16.5pt" : "10pt",
                      lineHeight: "1",
                    }}>
                      {val > 0 ? val : "·"}
                    </td>
                  ))}
                </tr>
              );
            })}

            {/* Footer Summary Row */}
            <tr style={{ background: accentColor }}>
              <td style={{ padding: "0.3mm" }} />
              <td style={{ padding: "0.3mm 2.5mm", fontWeight: 900, color: "#fff", fontSize: "12pt" }}>
                รวมจำนวนสินค้า
              </td>
              {pageColTotals.map((total, idx) => (
                <td key={idx} style={{
                  padding: "0.3mm", textAlign: "center",
                  fontWeight: 950, fontSize: "12.5pt",
                  color: total > 0 ? "#fff" : "rgba(255,255,255,0.4)",
                }}>
                  {total > 0 ? total : "—"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>

        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginTop: "0", padding: "0.2mm 10mm 0.5mm", borderTop: "1.5px dashed #1e293b",
        }}>
          <div style={{ display: "flex", gap: "8mm", alignItems: "center" }}>
            <span style={{ fontSize: "9pt", color: "#1e293b", fontWeight: 700 }}>
              ร้านค้าหน้านี้: {p.pageStores[0]?.name} — {p.pageStores[p.pageStores.length - 1]?.name}
            </span>
            <span style={{ fontSize: "10pt", color: "#000", fontWeight: 800 }}>
              รวมยอดจัดทั้งหน้านี้: {pageGrandTotal.toLocaleString("th-TH")} หน่วย
            </span>
          </div>
          <span style={{ fontSize: "8.5pt", color: "#1e293b", fontWeight: 700 }}>
            ผู้จัด ______________________ วันที่ {p.dateLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Layout (exported) ────────────────────────────────────────────────────────

export function PackingListLayout({ data }: { data: PackingListData }) {
  const pages = buildPages(data);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700;800;900&display=swap');

        @page { size: 356mm 216mm; margin: 0; }

        @media print {
          html, body { width: 356mm; height: 216mm; margin: 0 !important; padding: 0 !important; }
          body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          .no-print { display: none !important; }
          .packing-sheet { 
            page-break-after: always; 
            box-shadow: none !important; 
            margin: 0 !important; 
            border: none !important; 
            height: 216mm !important; 
            width: 356mm !important; 
            overflow: hidden !important;
            position: relative !important;
            top: 0 !important;
          }
          .packing-sheet:last-child { page-break-after: avoid; }
          thead { display: table-row-group; }
          tr { break-inside: avoid; }
        }

        @media screen {
          body {
            background: #e5e7eb !important;
            display: flex !important; 
            flex-direction: column !important;
            align-items: center !important; 
            padding: 40px 16px !important; 
            gap: 40px !important;
            min-height: 100vh !important;
            overflow-y: auto !important;
          }
          .packing-sheet { box-shadow: 0 10px 40px rgba(0,0,0,0.2); }
        }

        .packing-sheet {
          background: white;
          width: ${SHEET_W}; height: ${SHEET_H};
          overflow: hidden;
          font-family: 'Sarabun', sans-serif;
        }

        .packing-matrix { table-layout: fixed; width: 100%; border-collapse: collapse; }
        .packing-matrix td, .packing-matrix th { border: 1.5px solid #1e293b; padding: 0.1mm 0.5mm !important; }

        .packing-matrix thead tr:first-child td,
        .packing-matrix thead tr:first-child th { border: none; }
      `}</style>

      {pages.map((p) => (
        <PackingListPage
          key={`${p.vehicleId ?? "ua"}-s${p.storeChunk}-p${p.productChunk}`}
          p={p}
          data={data}
        />
      ))}
    </>
  );
}
