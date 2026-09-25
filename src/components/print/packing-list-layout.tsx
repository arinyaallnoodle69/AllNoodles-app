import type { CSSProperties } from "react";
import { paginateStandardStoreIndices } from "./packing-list-pagination";
import {
  buildCategoryPrintPalette,
  type CategoryPrintPalette,
} from "@/lib/products/category-print-colors";
import {
  fitPackingProductHeaderFont,
  getPackingPageFontScale,
} from "@/components/print/packing-list-font-fit";

export type PackingListStore = {
  id: string;
  name: string;
  vehicleId: string | null;
  vehicleName: string | null;
  missingWeightProductIds: string[];
  totalWeightGrams: number;
};

export type PackingListProduct = {
  brand: string;
  category: string;
  icon: string;
  key: string;
  sku: string;
  name: string;
  unit: string;
  categoryColor?: string | null;
  printBackgroundColor?: string | null;
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

export type PackingListLayoutMode = "standard" | "transposed";

const SHEET_W = "297mm";
const SHEET_H = "210mm";
const SCREEN_SHEET_W = "1123px";
const SCREEN_SHEET_H = "794px";
const STANDARD_PRODUCTS_PER_PAGE = 50;
const STANDARD_BODY_HEIGHT_MM = 151;
const STANDARD_MIN_ROW_HEIGHT_MM = 4.45;
const TRANSPOSED_PRODUCTS_PER_PAGE = 25;
const TRANSPOSED_STORES_PER_PAGE = 37;

const VEHICLE_COLORS = ["#4A148C", "#0f766e", "#9a3412", "#5b21b6", "#1d4ed8"];
const UNASSIGNED_COLOR = "#64748b";

const COLUMN_COLOR_GROUPS = [
  { header: "#EA80FC", rowA: "#F3E5F5", rowB: "#F3E5F5" },
  { header: "#d7ebd3", rowA: "#eef8eb", rowB: "#f7fcf4" },
  { header: "#f2e6bd", rowA: "#fbf5e6", rowB: "#fefbf1" },
  { header: "#efc9cc", rowA: "#faeaeb", rowB: "#fdf2f3" },
  { header: "#dacbf0", rowA: "#f0eafb", rowB: "#f8f4fe" },
  { header: "#d0ece5", rowA: "#ebf8f5", rowB: "#f5fcfa" },
  { header: "#efdccd", rowA: "#fbf1ea", rowB: "#fdf7f2" },
  { header: "#e4e4e4", rowA: "#f5f5f5", rowB: "#fafafa" },
] as const satisfies readonly CategoryPrintPalette[];

type BasePageDef = {
  vehicleId: string | null;
  vehicleName: string | null;
  accentColor: string;
  vehicleStoreCount: number;
  globalPage: number;
  totalPages: number;
  storeChunk: number;
  storeTotalChunks: number;
  productChunk: number;
  productTotalChunks: number;
  dateLabel: string;
  organizationName: string;
  vehicleMissingWeightProductCount: number;
  vehicleTotalWeightGrams: number;
};

type StandardPageDef = BasePageDef & {
  pageStores: PackingListStore[];
  pageStoreIndices: number[];
  vehicleStoreIndices: number[];
  pageProducts: PackingListProduct[];
  pageProductIndices: number[];
};

type TransposedPageDef = BasePageDef & {
  pageStores: PackingListStore[];
  pageStoreIndices: number[];
  vehicleStoreIndices: number[];
  pageProducts: PackingListProduct[];
  pageProductIndices: number[];
};

function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    groups.push(items.slice(i, i + size));
  }
  return groups;
}

function vehicleColor(vehicleId: string | null, vehicles: PackingListVehicle[]): string {
  if (!vehicleId) return UNASSIGNED_COLOR;
  const index = vehicles.findIndex((vehicle) => vehicle.id === vehicleId);
  return VEHICLE_COLORS[index % VEHICLE_COLORS.length] ?? VEHICLE_COLORS[0];
}

function getColumnPalette(columnIndex: number) {
  return COLUMN_COLOR_GROUPS[Math.floor(columnIndex / 5) % COLUMN_COLOR_GROUPS.length] ?? COLUMN_COLOR_GROUPS[0];
}

function getCategoryPrintPalette(product: PackingListProduct | undefined, fallback: CategoryPrintPalette) {
  return buildCategoryPrintPalette(product?.categoryColor, fallback);
}

function getProductPalette(product: PackingListProduct | undefined, categoryPalette: CategoryPrintPalette) {
  if (product?.printBackgroundColor) {
    return buildCategoryPrintPalette(product.printBackgroundColor, categoryPalette);
  }
  return categoryPalette;
}

function normalizeHeaderLabel(value: string, field: "brand" | "category") {
  return value.trim() || (field === "category" ? "ไม่ระบุหมวด" : "-");
}

function getProductCategoryKey(product: PackingListProduct) {
  return normalizeHeaderLabel(product.category, "category");
}

function insertZeroWidthSpaces(text: string): string {
  if (!text) return "";
  if (typeof Intl === "undefined" || !Intl.Segmenter) {
    return text;
  }
  try {
    const segmenter = new Intl.Segmenter("th", { granularity: "word" });
    const segments = segmenter.segment(text);
    return Array.from(segments)
      .map((s) => s.segment)
      .join("\u200B");
  } catch {
    return text;
  }
}

const THAI_COMBINING_MARKS = /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g;

function getThaiVisualLength(text: string): number {
  return text.replace(THAI_COMBINING_MARKS, "").length;
}

function splitProductNameForStandardHeader(name: string, maxLineChars = 4): string[] {
  const trimmed = name.trim();
  if (!trimmed) return [""];

  // Split on spaces, slashes, dashes, or brackets
  const rawParts = trimmed.split(/[\s/\\()[\]{}]+/).filter(Boolean);

  let words: string[] = [];
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    try {
      const wordSeg = new Intl.Segmenter("th", { granularity: "word" });
      for (const part of rawParts) {
        const segs = Array.from(wordSeg.segment(part), (s) => s.segment.trim()).filter(Boolean);
        for (const seg of segs) {
          // 1. Split on leading vowels [เแโใไ] preceded by a consonant or vowel
          // e.g. กระทุ่มแบน -> กระทุ่ม + แบน, ก๋วยเตี๋ยว -> ก๋วย + เตี๋ยว
          if (getThaiVisualLength(seg) > 3) {
            const sub = seg.split(/(?<=[ก-ฮะ-์])(?=[เแโใไ])/).filter(Boolean);
            words.push(...sub);
          } else {
            words.push(seg);
          }
        }
      }
    } catch {
      words = rawParts;
    }
  } else {
    words = rawParts;
  }

  if (words.length === 0) return [trimmed];

  // 2. Further split syllables ending with 'ะ' if token is longer than maxLineChars
  // e.g. 'กระทุ่ม' (5 chars) -> 'กระ' + 'ทุ่ม'
  const refinedWords: string[] = [];
  for (const w of words) {
    if (getThaiVisualLength(w) > maxLineChars && /(?:กระ|กะ|มะ|บะ|สะ|ประ)/.test(w)) {
      const sub = w.split(/(?<=[ะ])(?=[ก-ฮ])/).filter(Boolean);
      refinedWords.push(...sub);
    } else {
      refinedWords.push(w);
    }
  }

  // 3. Merge short fragments ONLY IF the combined length does not exceed maxLineChars
  // e.g. 'ไว'+'ไว' -> 'ไวไว' (4 chars), 'มา'+'ม่า' -> 'มาม่า' (4 chars)
  const merged: string[] = [];
  for (const w of refinedWords) {
    if (merged.length > 0) {
      const prev = merged[merged.length - 1];
      const pair = prev + w;
      if (
        (prev === w && getThaiVisualLength(pair) <= maxLineChars) ||
        (prev === "มา" && w === "ม่า" && getThaiVisualLength(pair) <= maxLineChars) ||
        (prev === "ไว" && w === "ไว" && getThaiVisualLength(pair) <= maxLineChars)
      ) {
        merged[merged.length - 1] = pair;
        continue;
      }
    }
    merged.push(w);
  }

  // 4. Fallback for any remaining long token (>maxLineChars):
  // Split using Thai grapheme clusters with orphan consonant protection
  const result: string[] = [];
  const graphemeSeg =
    typeof Intl !== "undefined" && Intl.Segmenter
      ? new Intl.Segmenter("th", { granularity: "grapheme" })
      : null;

  for (const w of merged) {
    if (getThaiVisualLength(w) > maxLineChars && graphemeSeg) {
      const graphemes = Array.from(graphemeSeg.segment(w), (s) => s.segment);
      const lines: string[] = [];
      let cur = "";

      for (const g of graphemes) {
        if (cur && getThaiVisualLength(cur + g) > maxLineChars) {
          // If current ends with a leading vowel, move it to the next line so it stays with its consonant
          if (/[เแโใไ]$/.test(cur)) {
            const lead = cur.slice(-1);
            lines.push(cur.slice(0, -1));
            cur = lead + g;
          } else {
            lines.push(cur);
            cur = g;
          }
        } else {
          cur += g;
        }
      }
      if (cur) lines.push(cur);

      // Orphan consonant protection:
      // If a line is a lone consonant (vLen === 1) and previous line has >= 2 chars,
      // borrow the preceding consonant so it forms a natural syllable!
      // e.g. ['มังก', 'ร'] -> ['มัง', 'กร']
      // e.g. ['โบตั๋', 'น'] -> ['โบ', 'ตั๋น']
      for (let i = lines.length - 1; i > 0; i--) {
        if (getThaiVisualLength(lines[i]) === 1 && getThaiVisualLength(lines[i - 1]) >= 2) {
          const prevG = Array.from(graphemeSeg.segment(lines[i - 1]), (s) => s.segment);
          if (prevG.length >= 2) {
            const borrowed = prevG.pop();
            lines[i - 1] = prevG.join("");
            lines[i] = borrowed + lines[i];
          }
        }
      }

      result.push(...lines.filter(Boolean));
    } else {
      result.push(w);
    }
  }

  return result.length > 0 ? result : [trimmed];
}

function buildHeaderGroups(products: PackingListProduct[], field: "brand" | "category") {
  const groups: { key: string; label: string; startIndex: number; span: number }[] = [];

  products.forEach((product, index) => {
    const label = normalizeHeaderLabel(product[field], field);
    const key = field === "brand" ? `${getProductCategoryKey(product)}||${label}` : label;
    const lastGroup = groups[groups.length - 1];

    if (lastGroup?.key === key) {
      lastGroup.span += 1;
      return;
    }

    groups.push({ key, label, startIndex: index, span: 1 });
  });

  return groups;
}




/* Unused
function splitProductNameToLines(name: string, maxLines = 4, maxTokenLength = 7): string[] {
  const trimmed = name.trim();
  if (!trimmed) return [];

  const rawTokens = trimmed.replace(/\s+/g, " ").split(" ").filter(Boolean);
  const tokens = rawTokens.flatMap((token) => (horizontalLength(token) > maxTokenLength ? splitLongToken(token, maxTokenLength - 1) : [token]));
  const lines: string[] = [];
  let current = "";

  for (const token of tokens) {
    const next = current ? `${current} ${token}` : token;
    if (horizontalLength(next) <= maxTokenLength) {
      current = next;
      continue;
    }

    if (current) lines.push(current);
    current = token;
  }

  if (current) lines.push(current);

  if (lines.length <= maxLines) return lines;

  const limited = lines.slice(0, maxLines);
  const last = limited[maxLines - 1] ?? "";
  limited[maxLines - 1] = `${last.slice(0, Math.max(0, last.length - 1))}...`;
  return limited;
}
*/

function buildVehicleGroups(data: PackingListData) {
  type Group = { vehicleId: string | null; vehicleName: string | null; storeIndices: number[] };
  const groups = new Map<string, Group>();

  for (const vehicle of data.vehicles) {
    groups.set(vehicle.id, { vehicleId: vehicle.id, vehicleName: vehicle.name, storeIndices: [] });
  }

  groups.set("__unassigned__", { vehicleId: null, vehicleName: null, storeIndices: [] });

  data.stores.forEach((store, index) => {
    const key = store.vehicleId ?? "__unassigned__";
    if (!groups.has(key)) {
      groups.set(key, { vehicleId: store.vehicleId, vehicleName: store.vehicleName, storeIndices: [] });
    }
    groups.get(key)?.storeIndices.push(index);
  });

  return Array.from(groups.values()).filter((group) => group.storeIndices.length > 0);
}

function getVehicleWeightSummary(data: PackingListData, storeIndices: number[]) {
  const missingProductIds = new Set<string>();
  let totalWeightGrams = 0;

  for (const storeIndex of storeIndices) {
    const store = data.stores[storeIndex];
    if (!store) continue;

    totalWeightGrams += store.totalWeightGrams;
    store.missingWeightProductIds.forEach((productId) => missingProductIds.add(productId));
  }

  return {
    missingWeightProductCount: missingProductIds.size,
    totalWeightGrams,
  };
}

function formatVehicleWeight(totalWeightGrams: number) {
  return `${(totalWeightGrams / 1000).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} กก.`;
}

function buildStandardPages(data: PackingListData): StandardPageDef[] {
  const rawDefs: Omit<StandardPageDef, "globalPage" | "totalPages">[] = [];

  for (const group of buildVehicleGroups(data)) {
    const vehicleWeightSummary = getVehicleWeightSummary(data, group.storeIndices);
    const activeProductIndices = data.products
      .map((_, productIndex) => productIndex)
      .filter((productIndex) => group.storeIndices.some((storeIndex) => (data.qty[productIndex]?.[storeIndex] ?? 0) !== 0));

    const storeChunks = paginateStandardStoreIndices(
      group.storeIndices,
      STANDARD_BODY_HEIGHT_MM,
      STANDARD_MIN_ROW_HEIGHT_MM,
    );
    const productChunks = chunk(activeProductIndices, STANDARD_PRODUCTS_PER_PAGE);

    for (let storeChunkIndex = 0; storeChunkIndex < storeChunks.length; storeChunkIndex += 1) {
      for (let productChunkIndex = 0; productChunkIndex < productChunks.length; productChunkIndex += 1) {
        const pageStoreIndices = storeChunks[storeChunkIndex];
        const pageProductIndices = productChunks[productChunkIndex];

        rawDefs.push({
          vehicleId: group.vehicleId,
          vehicleName: group.vehicleName,
          accentColor: vehicleColor(group.vehicleId, data.vehicles),
          pageStores: pageStoreIndices.map((storeIndex) => data.stores[storeIndex]),
          pageStoreIndices,
          vehicleStoreIndices: group.storeIndices,
          pageProducts: pageProductIndices.map((productIndex) => data.products[productIndex]),
          pageProductIndices,
          vehicleStoreCount: group.storeIndices.length,
          storeChunk: storeChunkIndex + 1,
          storeTotalChunks: storeChunks.length,
          productChunk: productChunkIndex + 1,
          productTotalChunks: productChunks.length,
          dateLabel: data.dateLabel,
          organizationName: data.organizationName,
          vehicleMissingWeightProductCount: vehicleWeightSummary.missingWeightProductCount,
          vehicleTotalWeightGrams: vehicleWeightSummary.totalWeightGrams,
        });
      }
    }
  }

  return rawDefs.map((page, index, pages) => ({
    ...page,
    globalPage: index + 1,
    totalPages: pages.length,
  }));
}

function buildTransposedPages(data: PackingListData): TransposedPageDef[] {
  const rawDefs: Omit<TransposedPageDef, "globalPage" | "totalPages">[] = [];

  for (const group of buildVehicleGroups(data)) {
    const vehicleWeightSummary = getVehicleWeightSummary(data, group.storeIndices);
    const activeProductIndices = data.products
      .map((_, productIndex) => productIndex)
      .filter((productIndex) => group.storeIndices.some((storeIndex) => (data.qty[productIndex]?.[storeIndex] ?? 0) !== 0));

    const storeChunks = chunk(group.storeIndices, TRANSPOSED_STORES_PER_PAGE);
    const productChunks = chunk(activeProductIndices, TRANSPOSED_PRODUCTS_PER_PAGE);

    for (let storeChunkIndex = 0; storeChunkIndex < storeChunks.length; storeChunkIndex += 1) {
      for (let productChunkIndex = 0; productChunkIndex < productChunks.length; productChunkIndex += 1) {
        const pageStoreIndices = storeChunks[storeChunkIndex];
        const pageProductIndices = productChunks[productChunkIndex];

        rawDefs.push({
          vehicleId: group.vehicleId,
          vehicleName: group.vehicleName,
          accentColor: vehicleColor(group.vehicleId, data.vehicles),
          pageStores: pageStoreIndices.map((storeIndex) => data.stores[storeIndex]),
          pageStoreIndices,
          vehicleStoreIndices: group.storeIndices,
          pageProducts: pageProductIndices.map((productIndex) => data.products[productIndex]),
          pageProductIndices,
          vehicleStoreCount: group.storeIndices.length,
          storeChunk: storeChunkIndex + 1,
          storeTotalChunks: storeChunks.length,
          productChunk: productChunkIndex + 1,
          productTotalChunks: productChunks.length,
          dateLabel: data.dateLabel,
          organizationName: data.organizationName,
          vehicleMissingWeightProductCount: vehicleWeightSummary.missingWeightProductCount,
          vehicleTotalWeightGrams: vehicleWeightSummary.totalWeightGrams,
        });
      }
    }
  }

  return rawDefs.map((page, index, pages) => ({
    ...page,
    globalPage: index + 1,
    totalPages: pages.length,
  }));
}

function StandardPackingHeader({
  accentColor,
  organizationName,
  dateLabel,
  vehicleName,
  storeCount,
  globalPage,
  totalPages,
  productChunk,
  productTotalChunks,
  vehicleMissingWeightProductCount,
  vehicleTotalWeightGrams,
}: {
  accentColor: string;
  organizationName: string;
  dateLabel: string;
  vehicleName: string | null;
  storeCount: number;
  globalPage: number;
  totalPages: number;
  productChunk: number;
  productTotalChunks: number;
  vehicleMissingWeightProductCount: number;
  vehicleTotalWeightGrams: number;
}) {
  return (
    <header className="packing-header packing-header--standard" style={{ borderColor: accentColor }}>
      <div className="packing-header__summary-line">
        <span className="packing-header__org packing-header__org--inline">{organizationName}</span>
        <h1 className="packing-header__title packing-header__title--standard">ตารางเช็คออเดอร์ลูกค้า</h1>
        <span className="packing-header__date">วันที่ {dateLabel}</span>
      </div>

      <div className="packing-header__vehicle-main">{vehicleName ?? "ยังไม่ได้กำหนดรถจัดส่ง"}</div>

      <div className="packing-header__meta">
        <div className="packing-header__meta-cell">
          <span>ร้านค้า</span>
          <strong>{storeCount.toLocaleString("th-TH")}</strong>
        </div>
        <div className="packing-header__meta-cell">
          <span>หน้า</span>
          <strong>
            {globalPage}/{totalPages}
          </strong>
        </div>
        <div className="packing-header__meta-cell">
          <span>กลุ่มสินค้า</span>
          <strong>
            {productChunk}/{productTotalChunks}
          </strong>
        </div>
        <div className="packing-header__meta-cell packing-header__meta-cell--weight">
          <span>น้ำหนักรวม</span>
          <strong>{formatVehicleWeight(vehicleTotalWeightGrams)}</strong>
          {vehicleMissingWeightProductCount > 0 ? (
            <small title={`มีสินค้าไม่ตั้งน้ำหนัก ${vehicleMissingWeightProductCount.toLocaleString("th-TH")} รายการ`}>
              *ขาด {vehicleMissingWeightProductCount.toLocaleString("th-TH")}
            </small>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function calcDataColWidth(count: number, availableMm: number, minMm = 6) {
  const raw = Math.floor(availableMm / Math.max(count, 1));
  return `${Math.max(minMm, raw)}mm`;
}

function getStandardNumberClass(value: number) {
  const digitCount = Math.abs(Math.trunc(value)).toString().length;
  if (digitCount >= 5) return " packing-number--xs";
  if (digitCount >= 4) return " packing-number--sm";
  if (digitCount >= 3) return " packing-number--md";
  return "";
}

function formatStandardQuantity(value: number) {
  return value.toLocaleString("th-TH", { useGrouping: false });
}

function StandardPackingListPage({ page, data }: { page: StandardPageDef; data: PackingListData }) {
  const columnWidth = calcDataColWidth(Math.max(page.pageProducts.length, 1), 267, 5);
  const pageFontScale = getPackingPageFontScale(page.pageProducts.length);
  const categoryGroups = buildHeaderGroups(page.pageProducts, "category");
  const categoryPaletteByKey = new Map(
    categoryGroups.map((group, index) => {
      const fallback = COLUMN_COLOR_GROUPS[index % COLUMN_COLOR_GROUPS.length] ?? COLUMN_COLOR_GROUPS[0];
      return [
        group.key,
        getCategoryPrintPalette(page.pageProducts[group.startIndex], fallback),
      ];
    }),
  );
  const getCategoryPalette = (product: PackingListProduct) =>
    categoryPaletteByKey.get(getProductCategoryKey(product)) ?? COLUMN_COLOR_GROUPS[0];
  const isLastStorePage = page.storeChunk === page.storeTotalChunks;
  const rowCount = page.pageStores.length + (isLastStorePage ? 1 : 0);
  const rowHeightMm = Math.max(
    STANDARD_MIN_ROW_HEIGHT_MM,
    Math.min(5.2, STANDARD_BODY_HEIGHT_MM / Math.max(rowCount, 1)),
  );
  const productTotals = isLastStorePage
    ? page.pageProductIndices.map((productIndex) =>
        page.vehicleStoreIndices.reduce((sum, storeIndex) => sum + (data.qty[productIndex]?.[storeIndex] ?? 0), 0),
      )
    : [];

  return (
    <section className="packing-sheet packing-sheet--standard">
      <div className="packing-sheet__inner">
        <StandardPackingHeader
          accentColor={page.accentColor}
          organizationName={page.organizationName}
          dateLabel={page.dateLabel}
          vehicleName={page.vehicleName}
          storeCount={page.vehicleStoreCount}
          globalPage={page.globalPage}
          totalPages={page.totalPages}
          productChunk={page.productChunk}
          productTotalChunks={page.productTotalChunks}
          vehicleMissingWeightProductCount={page.vehicleMissingWeightProductCount}
          vehicleTotalWeightGrams={page.vehicleTotalWeightGrams}
        />

        <div className="packing-table-wrap">
          <table
            className="packing-table"
            style={
              {
                "--standard-row-height": `${rowHeightMm}mm`,
                "--packing-number-font-size": `${12.4 * Math.min(pageFontScale, 1.15)}pt`,
                "--packing-store-font-size": `${12.4 * Math.min(pageFontScale, 1.08)}pt`,
              } as CSSProperties
            }
          >
            <thead>
              <tr>
                <th className="packing-col packing-col--store packing-col--group-label">หมวดหมู่</th>
                {categoryGroups.map((group) => {
                  const palette = categoryPaletteByKey.get(group.key) ?? COLUMN_COLOR_GROUPS[0];
                  return (
                    <th
                      key={`category-${group.startIndex}-${group.label}`}
                      className="packing-col packing-col--category"
                      colSpan={group.span}
                      style={{ backgroundColor: palette.header }}
                    >
                      <span className="packing-header-label packing-header-label--category">
                        {insertZeroWidthSpaces(group.label)}
                      </span>
                    </th>
                  );
                })}
              </tr>
              <tr>
                <th className="packing-col packing-col--store">ร้านค้า</th>
                {(() => {
                  return page.pageProducts.map((product) => {
                    const categoryPalette = getCategoryPalette(product);
                    const productPalette = getProductPalette(product, categoryPalette);
                    const colMm = parseFloat(columnWidth) || 12;
                    const maxCharsPerLine = Math.max(3, Math.min(6, Math.floor((colMm - 1) / 2.4)));
                    const productNameLines = splitProductNameForStandardHeader(product.name, maxCharsPerLine);
                    const longestLineLength = Math.max(...productNameLines.map((line) => getThaiVisualLength(line)));
                    const fittedFontSize = fitPackingProductHeaderFont({
                      columnWidthMm: colMm,
                      hasIcon: Boolean(product.icon),
                      lineCount: productNameLines.length,
                      longestLineLength,
                      productCount: page.pageProducts.length,
                    });
                    const isDense =
                      colMm < 8 ||
                      productNameLines.length >= 6 ||
                      (colMm <= 10 && longestLineLength >= 5);
                    const isCompact =
                      !isDense &&
                      (colMm <= 9 ||
                        productNameLines.length >= 5 ||
                        (colMm <= 11 && longestLineLength >= 4));
                    return (
                      <th
                        key={product.key}
                        className="packing-col packing-col--product"
                        style={{ width: columnWidth, backgroundColor: productPalette.header }}
                      >
                        <div className="packing-product-header">
                          <div
                            className={`packing-product-header__name${
                              isDense
                                ? " packing-product-header__name--dense"
                                : isCompact
                                  ? " packing-product-header__name--compact"
                                  : ""
                            }`}
                            style={{ fontSize: `${fittedFontSize}pt` }}
                          >
                            {product.icon ? (
                              <span className="packing-product-header__icon" aria-hidden="true">{product.icon}</span>
                            ) : null}
                            {productNameLines.map((line, lineIndex) => (
                              <span key={`${product.key}-name-line-${lineIndex}`}>{line}</span>
                            ))}
                          </div>
                        </div>
                      </th>
                    );
                  });
                })()}
              </tr>
            </thead>

            <tbody>
              {page.pageStores.map((store, rowIndex) => {
                const storeIndex = page.pageStoreIndices[rowIndex];

                return (
                  <tr key={store.id} className="packing-table__row">
                    <td className="packing-cell packing-cell--store">{store.name}</td>
                    {page.pageProductIndices.map((productIndex, cellIndex) => {
                      const rawValue = data.qty[productIndex]?.[storeIndex] ?? 0;
                      const value = Math.abs(rawValue);
                      const product = page.pageProducts[cellIndex];
                      const categoryPalette = product ? getCategoryPalette(product) : COLUMN_COLOR_GROUPS[0];
                      const productPalette = product ? getProductPalette(product, categoryPalette) : COLUMN_COLOR_GROUPS[0];
                      return (
                        <td
                          key={`${store.id}-${productIndex}`}
                          className={
                            value > 0
                              ? `packing-cell packing-cell--qty${getStandardNumberClass(value)}`
                              : "packing-cell packing-cell--empty"
                          }
                          style={{ backgroundColor: rowIndex % 2 === 0 ? productPalette.rowA : productPalette.rowB }}
                        >
                          {value > 0 ? (
                            <span className={`packing-number${getStandardNumberClass(value)}`}>
                              {formatStandardQuantity(value)}
                            </span>
                          ) : ""}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {isLastStorePage && (
                <tr className="packing-table__total-row">
                  <td className="packing-cell packing-cell--total-label">
                    <span>รวมยอด</span>
                    <strong>{formatVehicleWeight(page.vehicleTotalWeightGrams)}</strong>
                  </td>
                  {productTotals.map((total, index) => (
                    <td
                      key={`standard-total-${index}`}
                      className="packing-cell packing-cell--total"
                    >
                      {total > 0 ? (
                        <span className={`packing-number${getStandardNumberClass(total)}`}>
                          {formatStandardQuantity(total)}
                        </span>
                      ) : ""}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>
    </section>
  );
}

function TransposedPackingListPage({ page, data }: { page: TransposedPageDef; data: PackingListData }) {
  const storeColumnWidth = calcDataColWidth(Math.max(page.pageStores.length, 1), 248);
  const productTotals = page.pageProductIndices.map((productIndex) =>
    page.pageStoreIndices.reduce((sum, storeIndex) => sum + (data.qty[productIndex]?.[storeIndex] ?? 0), 0),
  );
  const transposedRowHeightMm = Math.max(6.35, Math.min(7.35, 181.5 / Math.max(page.pageProducts.length, 1)));

  return (
    <section className="packing-sheet">
      <div className="packing-sheet__inner">
        <StandardPackingHeader
          accentColor={page.accentColor}
          organizationName={page.organizationName}
          dateLabel={page.dateLabel}
          vehicleName={page.vehicleName}
          storeCount={page.vehicleStoreCount}
          globalPage={page.globalPage}
          totalPages={page.totalPages}
          productChunk={page.productChunk}
          productTotalChunks={page.productTotalChunks}
          vehicleMissingWeightProductCount={page.vehicleMissingWeightProductCount}
          vehicleTotalWeightGrams={page.vehicleTotalWeightGrams}
        />

        <div className="packing-table-wrap">
          <table
            className="packing-table packing-table--transposed"
            style={{ "--transposed-row-height": `${transposedRowHeightMm}mm` } as CSSProperties}
          >
            <thead>
              <tr>
                <th className="packing-col packing-col--transpose-product">สินค้า / หน่วย</th>
                {page.pageStores.map((store, columnIndex) => {
                  const palette = getColumnPalette(columnIndex);
                  return (
                    <th
                      key={store.id}
                      className="packing-col packing-col--transpose-store"
                      style={{ width: storeColumnWidth, backgroundColor: palette.header }}
                    >
                      <div className="packing-transpose-header">
                        <span className="packing-transpose-header__name">
                          {insertZeroWidthSpaces(store.name)}
                        </span>
                      </div>
                    </th>
                  );
                })}
                <th className="packing-col packing-col--transpose-total">รวมยอด</th>
              </tr>
            </thead>

            <tbody>
              {page.pageProducts.map((product, rowIndex) => (
                <tr key={product.key} className="packing-table__row">
                  <td className="packing-cell packing-cell--transpose-product">
                    <div className="packing-transpose-product">
                      <span className="packing-transpose-product__name">
                        {product.icon ? <span aria-hidden="true">{product.icon} </span> : null}
                        {product.name}
                      </span>
                    </div>
                  </td>
                  {page.pageStoreIndices.map((storeIndex, cellIndex) => {
                    const rawValue = data.qty[page.pageProductIndices[rowIndex]]?.[storeIndex] ?? 0;
                    const value = Math.abs(rawValue);
                    const palette = getColumnPalette(cellIndex);
                    return (
                      <td
                        key={`${product.key}-${storeIndex}`}
                        className={value > 0 ? "packing-cell packing-cell--qty" : "packing-cell packing-cell--empty"}
                        style={{ backgroundColor: rowIndex % 2 === 0 ? palette.rowA : palette.rowB }}
                      >
                        {value > 0 ? value.toLocaleString("th-TH") : ""}
                      </td>
                    );
                  })}
                  <td className="packing-cell packing-cell--transpose-total-value">
                    {productTotals[rowIndex] > 0 ? productTotals[rowIndex].toLocaleString("th-TH") : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function PackingListStyles() {
  return (
    <style>{`
      @font-face {
        font-family: "Angsana New Order Print";
        src: url("/fonts/angsana-new/angsab.woff") format("woff");
        font-style: normal;
        font-weight: 400;
        font-display: swap;
      }

      @font-face {
        font-family: "Angsana New Order Print";
        src: url("/fonts/angsana-new/angsab.woff") format("woff");
        font-style: normal;
        font-weight: 700;
        font-display: swap;
      }

      @font-face {
        font-family: "Angsana New Order Print";
        src: url("/fonts/angsana-new/angsab.woff") format("woff");
        font-style: normal;
        font-weight: 800 900;
        font-display: swap;
      }

      @page { size: A4 landscape; margin: 0; }

      @media print {
        html, body {
          width: 297mm !important;
          height: 210mm !important;
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
          width: auto !important;
          margin: 0 !important;
          padding: 0 !important;
          display: block !important;
          background: transparent !important;
          box-shadow: none !important;
        }

        .no-print {
          display: none !important;
        }

        .packing-print-container {
          display: block !important;
          margin: 0 !important;
          padding: 0 !important;
          line-height: 1.22 !important;
        }

        .packing-sheet-shell {
          width: 297mm !important;
          height: 210mm !important;
          margin: 0 !important;
          padding: 0 !important;
          display: block !important;
          overflow: hidden !important;
          line-height: 1.22 !important;
        }

        .packing-sheet {
          width: 297mm !important;
          height: 210mm !important;
          margin: 0 !important;
          border: none !important;
          box-shadow: none !important;
          transform: scale(0.98) !important;
          transform-origin: top left !important;
          page-break-after: always;
          break-after: page;
        }

        .packing-sheet__inner {
          padding-top: 4mm !important;
          padding-right: 4mm !important;
          padding-bottom: 4mm !important;
          padding-left: 4mm !important;
          gap: 0.55mm !important;
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
          padding: 116px 0 20px;
        }

        .packing-sheet-shell {
          --packing-mobile-available: calc(100vw - 8px);
          --packing-mobile-scale: min(1, calc(var(--packing-mobile-available) / 1123px));
          width: var(--packing-mobile-available);
          height: calc(794px * var(--packing-mobile-scale));
          max-width: 100vw;
          overflow: hidden;
        }

        .packing-sheet {
          width: 1123px !important;
          height: 794px !important;
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
        font-family: "Angsana New Order Print", "Sarabun", "Noto Sans Thai", sans-serif;
        font-synthesis: none;
        color: #0f172a;
        box-sizing: border-box;
      }

      .packing-sheet__inner {
        display: flex;
        flex-direction: column;
        height: 100%;
        padding: 4mm;
        gap: 1.2mm;
        box-sizing: border-box;
      }

      .packing-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 6mm;
        padding-bottom: 1.2mm;
        border-bottom: 1.3px solid #4A148C;
      }

      .packing-header__title-block {
        display: flex;
        flex-direction: column;
        gap: 0.5mm;
        min-width: 0;
        flex: 1;
      }

      .packing-header--standard {
        display: grid;
        grid-template-columns: minmax(72mm, auto) minmax(0, 1fr) auto;
        align-items: end;
        gap: 1.8mm;
        padding-bottom: 0.35mm;
      }

      .packing-header__summary-line {
        display: flex;
        align-items: baseline;
        gap: 1.2mm;
        min-width: 0;
        white-space: nowrap;
      }

      .packing-header__org {
        font-size: 11.16pt;
        font-weight: 800;
        line-height: 1.22;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #4A148C;
        white-space: nowrap;
      }

      .packing-header__org--inline {
        font-size: 10.38pt;
      }

      .packing-header__title {
        margin: 0;
        font-size: 19.84pt;
        line-height: 1.18;
        font-weight: 800;
        color: #0f172a;
        white-space: nowrap;
      }

      .packing-header__title--standard {
        font-size: 14.42pt;
      }

      .packing-header__date {
        font-size: 10.54pt;
        font-weight: 700;
        line-height: 1.24;
        color: #475569;
        white-space: nowrap;
      }

      .packing-header__vehicle-main {
        min-width: 0;
        text-align: center;
        font-size: 21.39pt;
        font-weight: 800;
        line-height: 1.18;
        color: #0f172a;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .packing-header__subtitle {
        display: flex;
        gap: 5mm;
        align-items: center;
        font-size: 11.63pt;
        font-weight: 700;
        line-height: 1.24;
        color: #475569;
        white-space: nowrap;
      }

      .packing-header__meta {
        display: grid;
        grid-template-columns: repeat(3, minmax(17mm, auto)) minmax(31mm, auto);
        gap: 1px;
        border: 1px solid #cbd5e1;
        background: #cbd5e1;
        flex-shrink: 0;
      }

      .packing-header__meta-cell {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 1.2mm;
        min-height: 4.8mm;
        padding: 0.35mm 1mm;
        background: #ffffff;
        white-space: nowrap;
      }

      .packing-table:not(.packing-table--transposed) .packing-table__row {
        height: var(--standard-row-height);
      }

      .packing-table:not(.packing-table--transposed) .packing-table__total-row {
        height: var(--standard-row-height);
      }

      .packing-table:not(.packing-table--transposed) .packing-cell--store {
        overflow: hidden;
        font-size: var(--packing-store-font-size, 12.4pt);
        line-height: 1.05;
        text-overflow: ellipsis;
      }

      .packing-table:not(.packing-table--transposed) .packing-cell--qty,
      .packing-table:not(.packing-table--transposed) .packing-cell--total {
        overflow: hidden;
        padding: 0;
        font-size: 9.46pt;
        white-space: nowrap;
      }

      .packing-number {
        display: block;
        width: 100%;
        max-width: 100%;
        overflow: hidden;
        font-family: "Angsana New Order Print", "Sarabun", "Noto Sans Thai", sans-serif;
        font-size: var(--packing-number-font-size, 12.4pt);
        font-weight: 800;
        font-variant-numeric: tabular-nums;
        line-height: 1;
        letter-spacing: -0.03em;
        text-align: center;
        white-space: nowrap;
      }

      .packing-number--md {
        font-size: 10.85pt;
        letter-spacing: -0.05em;
      }

      .packing-number--sm {
        font-size: 9.3pt;
        letter-spacing: -0.07em;
      }

      .packing-number--xs {
        font-size: 8.06pt;
        letter-spacing: -0.09em;
      }

      .packing-header__meta-cell span {
        font-size: 9.77pt;
        font-weight: 700;
        color: #64748b;
      }

      .packing-header__meta-cell strong {
        font-size: 12.25pt;
        font-weight: 800;
        color: #0f172a;
      }

      .packing-header__meta-cell--weight {
        gap: 0.9mm;
        background: #ffd400;
        border-left: 1px solid #0f172a;
      }

      .packing-header__meta-cell--weight span {
        color: #713f12;
        font-weight: 800;
      }

      .packing-header__meta-cell--weight strong {
        color: #111827;
        font-size: 13.33pt;
        font-weight: 900;
        font-variant-numeric: tabular-nums;
      }

      .packing-header__meta-cell--weight small {
        color: #b91c1c;
        font-size: 7.9pt;
        font-weight: 900;
        line-height: 1;
      }

      .packing-table-wrap {
        flex: 1;
        min-height: 0;
        border: 1px solid #000000;
        display: flex;
        align-items: flex-start;
        overflow: hidden;
      }

      .packing-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }

      .packing-col,
      .packing-cell {
        border-right: 1px solid #000000;
        border-bottom: 1px solid #000000;
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
        width: 18mm;
        min-width: 18mm;
        padding: 1mm 0.6mm 0.75mm;
        background: #ffffff;
        color: #0f172a;
        font-size: 12.71pt;
        font-weight: 800;
        line-height: 1.2;
        text-align: left;
        white-space: nowrap;
      }

      .packing-col--group-label {
        padding-top: 0.45mm;
        padding-bottom: 0.45mm;
        background: #f8fafc;
        color: #475569;
        font-size: 9.92pt;
        text-align: center;
      }

      .packing-col--category {
        min-height: 7mm;
        padding: 0.45mm 0.35mm 0.3mm;
        overflow: hidden;
        text-align: center;
        vertical-align: middle;
      }

      .packing-col--category {
        height: 7mm;
        font-size: 10.85pt;
        line-height: 1.15;
        font-weight: 900;
        color: #0f172a;
      }

      .packing-header-label {
        width: 100%;
        min-width: 0;
        overflow: visible;
        line-height: 1.35;
      }

      .packing-header-label--category {
        display: -webkit-box;
        position: relative;
        top: 0;
        overflow: hidden;
        white-space: normal;
        word-break: break-word;
        overflow-wrap: anywhere;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
      }

      .packing-col--transpose-product {
        width: 27mm;
        min-width: 27mm;
        padding: 1.2mm 0.7mm;
        background: #ffffff;
        color: #0f172a;
        font-size: 11.16pt;
        font-weight: 800;
        text-align: left;
        white-space: nowrap;
      }

      .packing-col--transpose-total {
        width: 8mm;
        min-width: 8mm;
        padding: 1.2mm 0.2mm;
        background: #ffd400;
        color: #0f172a;
        font-size: 10.38pt;
        font-weight: 800;
        text-align: center;
        white-space: nowrap;
      }

      .packing-product-header {
        position: relative;
        height: 26mm;
        min-height: 26mm;
        max-height: 26mm;
        padding: 0.7mm 0.1mm 0.4mm;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
      }

      .packing-product-header__name {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 100%;
        max-width: 100%;
        max-height: 100%;
        gap: 0;
        font-size: 15pt;
        line-height: 1.25;
        font-weight: 800;
        color: #0f172a;
        white-space: nowrap;
        text-align: center;
        padding: 0;
        overflow: visible;
        box-sizing: border-box;
      }

      .packing-product-header__name > span {
        display: block;
        max-width: 100%;
        white-space: nowrap;
        overflow: visible;
        box-sizing: border-box;
      }

      .packing-product-header__name--compact {
        font-size: 12.5pt;
        line-height: 1.23;
      }

      .packing-product-header__name--dense {
        font-size: 10pt;
        line-height: 1.2;
      }

      .packing-product-header__icon {
        display: block;
        font-size: 7pt;
        line-height: 1;
        margin-bottom: 0.3mm;
        font-family: "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", var(--font-noto-sans-thai), "Noto Sans Thai", sans-serif;
      }

      .packing-product-header__unit {
        font-size: 8.99pt;
        font-weight: 700;
        line-height: 1.15;
        color: #475569;
        text-align: center;
        padding-left: 0;
        width: 100%;
        box-sizing: border-box;
      }

      .packing-transpose-header {
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        min-height: 14mm;
        padding: 0.55mm 0.05mm;
        width: 100%;
        min-width: 0;
        overflow: hidden;
        box-sizing: border-box;
      }

      .packing-transpose-header__name {
        display: -webkit-box;
        -webkit-line-clamp: 4;
        -webkit-box-orient: vertical;
        flex: 1;
        font-size: 11.16pt;
        line-height: 1.2;
        font-weight: 800;
        color: #0f172a;
        width: 100%;
        min-width: 0;
        overflow: hidden;
        white-space: normal;
        word-break: normal;
        overflow-wrap: break-word;
        text-align: left;
        padding-left: 0.8mm;
        padding-right: 0.8mm;
        padding-top: 0.5mm;
        box-sizing: border-box;
      }

      .packing-table--transposed .packing-table__row {
        height: var(--transposed-row-height);
      }

      .packing-table--transposed .packing-cell--qty,
      .packing-table--transposed .packing-cell--empty {
        font-size: 14.26pt;
      }

      .packing-cell {
        padding: 0;
        text-align: center;
        vertical-align: middle;
      }

      .packing-cell--store {
        padding: 0 0.6mm;
        text-align: left;
        font-size: 13.64pt;
        font-weight: 700;
        line-height: 1.16;
        color: #0f172a;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .packing-cell--transpose-product {
        padding: 0 0.45mm;
        text-align: left;
        background: #ffffff;
      }

      .packing-transpose-product {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 0.35mm;
      }

      .packing-transpose-product__name {
        display: -webkit-box;
        overflow: hidden;
        font-size: 13.02pt;
        font-weight: 700;
        line-height: 1.16;
        color: #0f172a;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
      }

      .packing-transpose-product__unit {
        flex-shrink: 0;
        font-size: 9.61pt;
        font-weight: 700;
        color: #475569;
        white-space: nowrap;
        text-align: right;
      }

      .packing-cell--qty,
      .packing-cell--total {
        font-size: 16.12pt;
        font-weight: 800;
        color: #0f172a;
      }

      .packing-table:not(.packing-table--transposed) .packing-cell--qty {
        font-size: 18.29pt;
        font-weight: 900;
        line-height: 1;
      }

      .packing-cell--transpose-total-value {
        background: #ffd400;
        font-size: 13.8pt;
        font-weight: 800;
        color: #0f172a;
      }

      .packing-cell--empty {
        font-size: 10.85pt;
        font-weight: 600;
        color: transparent;
      }

      .packing-table__total-row .packing-cell {
        border-top: 1.2px solid #111827;
      }

      .packing-table--transposed .packing-table__total-row {
        display: none;
      }

      .packing-cell--total-label {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        justify-content: center;
        gap: 0;
        padding: 0 0.8mm;
        text-align: left;
        font-size: 9.46pt;
        font-weight: 800;
        line-height: 1;
        color: #111827;
        background: #ffd400;
      }

      .packing-cell--total-label strong {
        font-size: 9.77pt;
        font-weight: 900;
        line-height: 1;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }

      .packing-cell--total {
        background: #ffd400;
      }

      /* The original 50-item layout uses its own highly legible print face.
         Keep the transposed layout and every other document unchanged. */
      .packing-sheet--standard {
        font-family: "Angsana New Order Print", "Sarabun", "Noto Sans Thai", sans-serif;
        font-synthesis: none;
        text-rendering: geometricPrecision;
        -webkit-font-smoothing: antialiased;
      }

      .packing-sheet--standard .packing-header__org,
      .packing-sheet--standard .packing-header__title,
      .packing-sheet--standard .packing-header__date,
      .packing-sheet--standard .packing-header__vehicle-main,
      .packing-sheet--standard .packing-header__meta-cell span,
      .packing-sheet--standard .packing-header__meta-cell strong,
      .packing-sheet--standard .packing-header__meta-cell small,
      .packing-sheet--standard .packing-col,
      .packing-sheet--standard .packing-cell--store,
      .packing-sheet--standard .packing-cell--total-label,
      .packing-sheet--standard .packing-cell--total-label strong {
        font-family: "Angsana New Order Print", "Sarabun", "Noto Sans Thai", sans-serif;
      }

      .packing-sheet--standard .packing-cell--store {
        font-weight: 700;
      }

      .packing-sheet--standard .packing-product-header__name {
        font-family: "Angsana New Order Print", "Sarabun", "Noto Sans Thai", sans-serif;
        font-size: 15pt;
        line-height: 1.25;
        font-weight: 700;
      }

      .packing-sheet--standard .packing-product-header__name--compact {
        font-size: 12.5pt;
        line-height: 1.23;
      }

      .packing-sheet--standard .packing-product-header__name--dense {
        font-size: 10pt;
        line-height: 1.2;
      }

      .packing-sheet--standard .packing-product-header__icon {
        font-family: "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif;
      }
    `}</style>
  );
}

export function PackingListLayout({
  data,
  layout = "standard",
}: {
  data: PackingListData;
  layout?: PackingListLayoutMode;
}) {
  const pages = layout === "transposed" ? buildTransposedPages(data) : buildStandardPages(data);

  return (
    <>
      <PackingListStyles />
      {pages.map((page) => (
        <div
          key={`${layout}-${page.vehicleId ?? "unassigned"}-stores-${page.storeChunk}-products-${page.productChunk}`}
          className="packing-sheet-shell"
        >
          {layout === "transposed" ? (
            <TransposedPackingListPage page={page} data={data} />
          ) : (
            <StandardPackingListPage page={page} data={data} />
          )}
        </div>
      ))}
    </>
  );
}
