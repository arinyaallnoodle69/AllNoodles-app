"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Plus, Search } from "lucide-react";
import { MobileSearchDrawer } from "@/components/mobile-search/mobile-search-drawer";
import { ProductList } from "@/components/settings/product-list";
import { normalizeSearch } from "@/lib/utils/search";
import type { SettingsProduct } from "@/lib/settings/admin";

type ProductFilterClientProps = {
  allProducts: SettingsProduct[];
  baseListHref: string;
  children?: React.ReactNode;
};

type SpreadsheetCell = string | number;

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

function getColumnName(index: number) {
  let column = "";
  let value = index + 1;

  while (value > 0) {
    const remainder = (value - 1) % 26;
    column = String.fromCharCode(65 + remainder) + column;
    value = Math.floor((value - 1) / 26);
  }

  return column;
}

function buildWorksheetXml(rows: SpreadsheetCell[][]) {
  const sheetRows = rows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const cells = row
        .map((cell, columnIndex) => {
          const reference = `${getColumnName(columnIndex)}${rowNumber}`;
          if (typeof cell === "number") {
            return `<c r="${reference}"><v>${cell}</v></c>`;
          }

          return `<c r="${reference}" t="inlineStr"><is><t>${escapeXml(cell)}</t></is></c>`;
        })
        .join("");

      return `<row r="${rowNumber}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetRows}</sheetData>
</worksheet>`;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function writeUInt16(output: number[], value: number) {
  output.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeUInt32(output: number[], value: number) {
  output.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function createZip(files: Array<{ name: string; content: string }>) {
  const encoder = new TextEncoder();
  const output: number[] = [];
  const centralDirectory: number[] = [];
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const contentBytes = encoder.encode(file.content);
    const checksum = crc32(contentBytes);
    const localOffset = output.length;

    writeUInt32(output, 0x04034b50);
    writeUInt16(output, 20);
    writeUInt16(output, 0);
    writeUInt16(output, 0);
    writeUInt16(output, dosTime);
    writeUInt16(output, dosDate);
    writeUInt32(output, checksum);
    writeUInt32(output, contentBytes.length);
    writeUInt32(output, contentBytes.length);
    writeUInt16(output, nameBytes.length);
    writeUInt16(output, 0);
    output.push(...nameBytes, ...contentBytes);

    writeUInt32(centralDirectory, 0x02014b50);
    writeUInt16(centralDirectory, 20);
    writeUInt16(centralDirectory, 20);
    writeUInt16(centralDirectory, 0);
    writeUInt16(centralDirectory, 0);
    writeUInt16(centralDirectory, dosTime);
    writeUInt16(centralDirectory, dosDate);
    writeUInt32(centralDirectory, checksum);
    writeUInt32(centralDirectory, contentBytes.length);
    writeUInt32(centralDirectory, contentBytes.length);
    writeUInt16(centralDirectory, nameBytes.length);
    writeUInt16(centralDirectory, 0);
    writeUInt16(centralDirectory, 0);
    writeUInt16(centralDirectory, 0);
    writeUInt16(centralDirectory, 0);
    writeUInt32(centralDirectory, 0);
    writeUInt32(centralDirectory, localOffset);
    centralDirectory.push(...nameBytes);
  }

  const centralDirectoryOffset = output.length;
  output.push(...centralDirectory);
  writeUInt32(output, 0x06054b50);
  writeUInt16(output, 0);
  writeUInt16(output, 0);
  writeUInt16(output, files.length);
  writeUInt16(output, files.length);
  writeUInt32(output, centralDirectory.length);
  writeUInt32(output, centralDirectoryOffset);
  writeUInt16(output, 0);

  return new Uint8Array(output);
}

function buildXlsxBlob(products: SettingsProduct[]) {
  const rows = [
    ["รหัสสินค้า", "ชื่อสินค้า", "หน่วย", "ต้นทุน", "สถานะ"],
    ...products.map((product) => {
      const defaultUnit = product.saleUnits.find((unit) => unit.isDefault) ?? product.saleUnits[0];
      return [
        product.sku,
        product.name,
        product.baseUnit,
        defaultUnit?.effectiveCostPrice ?? "",
        product.isActive ? "พร้อมขาย" : "ไม่พร้อมขาย",
      ];
    }),
  ];

  const bytes = createZip([
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Products" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
    },
    {
      name: "xl/worksheets/sheet1.xml",
      content: buildWorksheetXml(rows),
    },
  ]);

  return new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function ProductFilterClient({
  allProducts,
  baseListHref,
  children,
}: ProductFilterClientProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredProducts = useMemo(() => {
    return allProducts.filter((product) => {
      if (!searchQuery) return true;
      const normalized = normalizeSearch(searchQuery);
      return (
        normalizeSearch(product.name).includes(normalized) ||
        normalizeSearch(product.sku).includes(normalized) ||
        product.categoryNames.some((name) => normalizeSearch(name).includes(normalized))
      );
    });
  }, [allProducts, searchQuery]);

  function handleExport() {
    const blob = buildXlsxBlob(filteredProducts);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "all-noodles-products.xlsx";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="sticky top-0 z-40 -mx-3 mb-4 hidden border-b border-[#E8DCC7] bg-white/95 px-4 py-3 shadow-[0_10px_30px_rgba(31,42,68,0.08)] backdrop-blur lg:block">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-lg font-black text-[#082A63]">รายการสินค้า</p>
            <p className="text-xs font-semibold text-[#667085]">
              แสดง {filteredProducts.length.toLocaleString("th-TH")} จาก {allProducts.length.toLocaleString("th-TH")} รายการ
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(14rem,1fr)_auto_auto] lg:w-[48rem]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-[#667085]" strokeWidth={2} />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="ค้นหาสินค้า หรือรหัสสินค้า"
                className="h-12 w-full rounded-lg border border-[#D7DEE8] bg-white pl-11 pr-4 text-sm font-semibold text-[#1F2A44] outline-none transition placeholder:text-[#667085] focus:border-[#082A63] focus:ring-2 focus:ring-[#082A63]/15"
              />
            </label>

            <Link
              href={`${baseListHref}${baseListHref.includes("?") ? "&" : "?"}create=1`}
              scroll={false}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#082A63] px-4 text-sm font-bold text-white shadow-[0_12px_26px_rgba(8,42,99,0.22)] transition hover:bg-[#103B82] active:scale-[0.98]"
            >
              <Plus className="h-4.5 w-4.5" strokeWidth={2.4} />
              เพิ่มสินค้า
            </Link>

            <button
              type="button"
              onClick={handleExport}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-[#082A63]/20 bg-white px-4 text-sm font-bold text-[#082A63] transition hover:border-[#082A63] hover:bg-[#082A63]/[0.04] active:scale-[0.98]"
            >
              <Download className="h-4.5 w-4.5" strokeWidth={2.2} />
              ส่งออกข้อมูล
            </button>
          </div>
        </div>
      </div>

      {children}

      <MobileSearchDrawer title="ค้นหาสินค้า">
        <div className="space-y-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-[#667085]" strokeWidth={2} />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="ค้นหาสินค้า หรือรหัสสินค้า"
              className="h-12 w-full rounded-lg border border-[#D7DEE8] bg-white pl-11 pr-4 text-sm font-semibold text-[#1F2A44] outline-none transition placeholder:text-[#667085] focus:border-[#082A63] focus:ring-2 focus:ring-[#082A63]/15"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <Link
              href={`${baseListHref}${baseListHref.includes("?") ? "&" : "?"}create=1`}
              scroll={false}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#082A63] px-4 text-sm font-bold text-white shadow-[0_12px_26px_rgba(8,42,99,0.22)] transition active:scale-[0.98]"
            >
              <Plus className="h-4.5 w-4.5" strokeWidth={2.4} />
              เพิ่มสินค้า
            </Link>

            <button
              type="button"
              onClick={handleExport}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-[#082A63]/20 bg-white px-4 text-sm font-bold text-[#082A63] transition active:scale-[0.98]"
            >
              <Download className="h-4.5 w-4.5" strokeWidth={2.2} />
              ส่งออกข้อมูล
            </button>
          </div>
        </div>
      </MobileSearchDrawer>

      <Link
        href={`${baseListHref}${baseListHref.includes("?") ? "&" : "?"}create=1`}
        scroll={false}
        aria-label="เพิ่มสินค้า"
        className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom)+12px)] left-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#082A63] text-white shadow-[0_14px_32px_rgba(8,42,99,0.32)] transition active:scale-95 lg:hidden"
      >
        <Plus className="h-7 w-7" strokeWidth={2.6} />
      </Link>

      <ProductList products={filteredProducts} baseListHref={baseListHref} />
    </>
  );
}
