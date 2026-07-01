"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileDown, ListFilter, Loader2, Plus, Search, Upload, X } from "lucide-react";
import { importProductsFromExcelAction } from "@/app/dashboard/settings/actions";
import { MobileSearchDrawer } from "@/components/mobile-search/mobile-search-drawer";
import { ProductList } from "@/components/settings/product-list";
import { normalizeSearch } from "@/lib/utils/search";
import type { SettingsProduct, SettingsProductCategory, SettingsProductBrand, SettingsSupplier } from "@/lib/settings/admin";
import { ProductForm } from "@/components/settings/product-form";
import type { ProductImportActionState } from "@/app/dashboard/settings/actions";

type ProductFilterClientProps = {
  allProducts: SettingsProduct[];
  baseListHref: string;
  children?: React.ReactNode;
  categories: SettingsProductCategory[];
  brands: SettingsProductBrand[];
  suppliers: SettingsSupplier[];
  nextSku: string;
  initialCreate?: boolean;
  initialEditProduct?: SettingsProduct | null;
};

type SpreadsheetCell = string | number;

const initialImportState: ProductImportActionState = {
  message: "",
  status: "idle",
};

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

    output.push(
      0x50,
      0x4b,
      0x03,
      0x04,
      10,
      0,
      0,
      0,
      0,
      0,
      dosTime & 0xff,
      (dosTime >>> 8) & 0xff,
      dosDate & 0xff,
      (dosDate >>> 8) & 0xff,
      checksum & 0xff,
      (checksum >>> 8) & 0xff,
      (checksum >>> 16) & 0xff,
      (checksum >>> 24) & 0xff,
    );
    writeUInt32(output, contentBytes.length);
    writeUInt32(output, contentBytes.length);
    writeUInt16(output, nameBytes.length);
    writeUInt16(output, 0);
    output.push(...nameBytes);
    output.push(...contentBytes);

    centralDirectory.push(
      0x50,
      0x4b,
      0x01,
      0x02,
      20,
      0,
      10,
      0,
      0,
      0,
      0,
      0,
      dosTime & 0xff,
      (dosTime >>> 8) & 0xff,
      dosDate & 0xff,
      (dosDate >>> 8) & 0xff,
      checksum & 0xff,
      (checksum >>> 8) & 0xff,
      (checksum >>> 16) & 0xff,
      (checksum >>> 24) & 0xff,
    );
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

  const directoryOffset = output.length;
  output.push(...centralDirectory);

  output.push(
    0x50,
    0x4b,
    0x05,
    0x06,
    0,
    0,
    0,
    0,
  );
  writeUInt16(output, files.length);
  writeUInt16(output, files.length);
  writeUInt32(output, centralDirectory.length);
  writeUInt32(output, directoryOffset);
  writeUInt16(output, 0);

  return new Uint8Array(output);
}

function buildXlsxBlob(products: SettingsProduct[]) {
  const rows = [
    [
      "SKU",
      "ชื่อสินค้า",
      "หน่วยหลัก",
      "ราคาทุน",
      "จำนวนสต็อก",
      "ผู้ขาย",
      "หมวดหมู่",
      "แบรนด์",
      "ชื่อในใบจัดของ",
      "คำอธิบาย",
      "สถานะ",
      "หน่วยขาย",
      "อัตราต่อหน่วยหลัก",
      "ขั้นต่ำ",
      "เพิ่มทีละ",
      "โหมดต้นทุนหน่วยขาย",
      "ต้นทุนหน่วยขาย",
    ],
    ...products.map((product) => {
      const defaultUnit = product.saleUnits.find((unit) => unit.isDefault) ?? product.saleUnits[0];
      return [
        product.sku,
        product.name,
        product.baseUnit,
        product.costPrice,
        product.stockQuantity,
        product.supplierName ?? "",
        product.category || product.categoryNames[0] || "",
        product.brand ?? "",
        product.packingListName ?? "",
        product.description ?? "",
        product.isActive ? "พร้อมขาย" : "ปิดขาย",
        defaultUnit?.label ?? product.baseUnit,
        defaultUnit?.baseUnitQuantity ?? 1,
        defaultUnit?.minOrderQty ?? 1,
        defaultUnit?.stepOrderQty ?? "",
        defaultUnit?.costMode ?? "derived",
        defaultUnit?.costMode === "fixed" ? (defaultUnit.fixedCostPrice ?? "") : "",
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
  categories,
  brands,
  suppliers,
  nextSku,
  initialCreate,
  initialEditProduct,
}: ProductFilterClientProps) {
  const router = useRouter();
  const [editingProduct, setEditingProduct] = useState<SettingsProduct | null>(initialEditProduct ?? null);
  const [isCreating, setIsCreating] = useState(!!initialCreate);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | "__all__">("__all__");
  const [selectedBrand, setSelectedBrand] = useState<string | "__all__">("__all__");
  const [mobileFilterDrawer, setMobileFilterDrawer] = useState<"brand" | "category" | null>(null);
  const [isMobileFilterDrawerClosing, setIsMobileFilterDrawerClosing] = useState(false);
  const mobileFilterDrawerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [importState, importAction, isImportPending] = useActionState(
    importProductsFromExcelAction,
    initialImportState,
  );
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const importFormRef = useRef<HTMLFormElement>(null);
  const categoryOptions = useMemo(() => {
    return categories
      .filter((category) => category.isActive)
      .map((category) => ({ id: category.id, name: category.name }));
  }, [categories]);

  const brandOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const product of allProducts) {
      const matchesCategory =
        selectedCategory === "__all__" || (product.categoryIds && product.categoryIds.includes(selectedCategory));
      if (!matchesCategory) continue;

      if (product.brand) {
        const trimmed = product.brand.trim();
        if (trimmed) seen.add(trimmed);
      }
    }
    return Array.from(seen).sort((a, b) => a.localeCompare(b, "th"));
  }, [allProducts, selectedCategory]);



  const handleCategorySelect = (id: string, e: React.MouseEvent<HTMLButtonElement>) => {
    setSelectedCategory(id);
    if (id === "__all__") {
      setSelectedBrand("__all__");
    } else {
      // Find what brands are available in the newly selected category
      const availableBrands = new Set<string>();
      for (const product of allProducts) {
        if (product.categoryIds && product.categoryIds.includes(id) && product.brand) {
          const trimmed = product.brand.trim();
          if (trimmed) availableBrands.add(trimmed);
        }
      }
      if (selectedBrand !== "__all__" && !availableBrands.has(selectedBrand)) {
        setSelectedBrand("__all__");
      }
    }
    e.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  };

  const handleBrandSelect = (brand: string, e: React.MouseEvent<HTMLButtonElement>) => {
    setSelectedBrand(brand);
    e.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  };

  function openMobileFilterDrawer(type: "brand" | "category") {
    if (mobileFilterDrawerTimerRef.current) {
      clearTimeout(mobileFilterDrawerTimerRef.current);
      mobileFilterDrawerTimerRef.current = null;
    }
    setIsMobileFilterDrawerClosing(false);
    setMobileFilterDrawer(type);
  }

  function closeMobileFilterDrawer() {
    if (!mobileFilterDrawer || isMobileFilterDrawerClosing) return;

    setIsMobileFilterDrawerClosing(true);
    mobileFilterDrawerTimerRef.current = setTimeout(() => {
      setMobileFilterDrawer(null);
      setIsMobileFilterDrawerClosing(false);
      mobileFilterDrawerTimerRef.current = null;
    }, 250);
  }

  useEffect(() => {
    return () => {
      if (mobileFilterDrawerTimerRef.current) {
        clearTimeout(mobileFilterDrawerTimerRef.current);
      }
    };
  }, []);

  const filteredProducts = useMemo(() => {
    return allProducts.filter((product) => {
      const matchesCategory =
        selectedCategory === "__all__" || (product.categoryIds && product.categoryIds.includes(selectedCategory));
      if (!matchesCategory) return false;

      const matchesBrand =
        selectedBrand === "__all__" || (product.brand === selectedBrand);
      if (!matchesBrand) return false;

      if (!searchQuery) return true;
      const normalized = normalizeSearch(searchQuery);
      return (
        normalizeSearch(product.name).includes(normalized) ||
        normalizeSearch(product.sku).includes(normalized) ||
        (product.brand && normalizeSearch(product.brand).includes(normalized)) ||
        (product.categoryNames && product.categoryNames.some((name) => normalizeSearch(name).includes(normalized)))
      );
    });
  }, [allProducts, searchQuery, selectedCategory, selectedBrand]);
  function handleExport() {
    const blob = buildXlsxBlob(filteredProducts);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "all-noodles-products.xlsx";
    link.click();
    URL.revokeObjectURL(url);
  }

  function openImportFilePicker() {
    importFileInputRef.current?.click();
  }

  useEffect(() => {
    if (importState.status === "idle") return;
    const details = importState.errors?.length ? `\n${importState.errors.join("\n")}` : "";
    alert(`${importState.message}${details}`);
    if (importState.status === "success") {
      router.refresh();
    }
    if (importFileInputRef.current) {
      importFileInputRef.current.value = "";
    }
  }, [importState, router]);

  return (
    <>
      <form ref={importFormRef} action={importAction} className="hidden">
        <input
          ref={importFileInputRef}
          type="file"
          name="file"
          accept=".xlsx,.xls"
          onChange={() => {
            if (importFileInputRef.current?.files?.length) {
              importFormRef.current?.requestSubmit();
            }
          }}
        />
      </form>

      <div className="sticky top-0 z-40 -mx-3 mb-4 hidden border-b border-[#E1BEE7] bg-white/95 px-4 py-3 shadow-[0_10px_30px_rgba(31,42,68,0.08)] backdrop-blur lg:block">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex items-center gap-4">
            <div>
              <p className="text-lg font-black text-[#4A148C]">รายการสินค้า</p>
              <p className="text-xs font-semibold text-[#667085]">
                {filteredProducts.length.toLocaleString("th-TH")} รายการ
              </p>
            </div>
          </div>

          <div className="flex-1 max-w-md mx-8">
            <div className="relative group">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#667085]" strokeWidth={2} />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="ค้นหาข้ามทุกช่อง..."
                className="h-11 w-full rounded-lg border border-[#D7DEE8] bg-white pl-10 pr-4 text-sm font-semibold text-[#4A148C] outline-none transition placeholder:text-[#667085] focus:border-[#4A148C] focus:ring-4 focus:ring-[#4A148C]/10 placeholder-slate-400"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#4A148C] px-4 text-sm font-bold text-white shadow-[0_2px_8px_rgba(74,20,140,0.25)] transition hover:brightness-95 active:scale-[0.98]"
            >
              <Plus className="h-4.5 w-4.5" strokeWidth={2.4} />
              เพิ่มสินค้า
            </button>
          </div>
        </div>

        {categoryOptions.length > 0 && (
          <div className="flex items-center gap-6 overflow-x-auto no-scrollbar -mx-4 px-4 h-12 bg-white/50 border-t border-[#E1BEE7]/40 relative z-10 mt-3">
            <span className="text-xs font-black text-slate-400 uppercase tracking-wider min-w-[70px]">หมวดหมู่:</span>
            <button
              type="button"
              onClick={(e) => handleCategorySelect("__all__", e)}
              className={`h-full px-2 flex items-center relative text-sm font-black whitespace-nowrap transition-colors ${
                selectedCategory === "__all__"
                  ? "text-[#4A148C]"
                  : "text-slate-500 hover:text-[#4A148C]"
              }`}
            >
              ทุกหมวดหมู่
              {selectedCategory === "__all__" && (
                <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#4A148C]"></div>
              )}
            </button>

            {categoryOptions.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={(e) => handleCategorySelect(c.id, e)}
                className={`h-full px-2 flex items-center relative text-sm font-black whitespace-nowrap transition-colors ${
                  selectedCategory === c.id
                    ? "text-[#4A148C]"
                    : "text-slate-500 hover:text-[#4A148C]"
                }`}
              >
                {c.name}
                {selectedCategory === c.id && (
                  <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#4A148C]"></div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mobile-only Category & Brand Filter */}
      <div className="mb-4 block border-b border-[#E1BEE7]/50 bg-white px-4 lg:hidden">
        {categoryOptions.length > 0 && (
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => openMobileFilterDrawer("category")}
              className="flex h-12 shrink-0 items-center gap-1.5 text-sm font-black text-[#4A148C]"
              aria-label="เปิดรายการหมวดหมู่ทั้งหมด"
            >
              หมวดหมู่
              <ListFilter className="h-4 w-4" strokeWidth={2.5} />
            </button>
            <div className="flex min-w-0 flex-1 items-center gap-6 overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={(e) => handleCategorySelect("__all__", e)}
                className={`relative h-12 shrink-0 px-1 text-sm font-black whitespace-nowrap transition-colors ${
                  selectedCategory === "__all__"
                    ? "text-[#4A148C]"
                    : "text-slate-500"
                }`}
              >
                ทุกหมวดหมู่
                {selectedCategory === "__all__" ? (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#4A148C]" />
                ) : null}
              </button>

              {categoryOptions.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={(e) => handleCategorySelect(c.id, e)}
                  className={`relative h-12 shrink-0 px-1 text-sm font-black whitespace-nowrap transition-colors ${
                    selectedCategory === c.id
                      ? "text-[#4A148C]"
                      : "text-slate-500"
                  }`}
                >
                  {c.name}
                  {selectedCategory === c.id ? (
                    <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#4A148C]" />
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <MobileSearchDrawer title="ค้นหาสินค้า">
        <div className="space-y-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-[#667085]" strokeWidth={2} />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="ค้นหาสินค้า หรือรหัสสินค้า"
              className="h-12 w-full rounded-lg border border-[#D7DEE8] bg-white pl-11 pr-4 text-sm font-semibold text-[#4A148C] outline-none transition placeholder:text-[#667085] focus:border-[#4A148C] focus:ring-2 focus:ring-[#4A148C]/15"
            />
          </label>

          <div>
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#4A148C] px-4 text-sm font-bold text-white shadow-[0_12px_26px_rgba(142,36,170,0.22)] transition active:scale-[0.98]"
            >
              <Plus className="h-4.5 w-4.5" strokeWidth={2.4} />
              เพิ่มสินค้า
            </button>
          </div>
        </div>
      </MobileSearchDrawer>

      <button
        type="button"
        onClick={() => setIsCreating(true)}
        aria-label="เพิ่มสินค้า"
        className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom)+12px)] left-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#4A148C] text-white shadow-[0_14px_32px_rgba(142, 36, 170,0.32)] transition active:scale-95 lg:hidden"
      >
        <Plus className="h-7 w-7" strokeWidth={2.6} />
      </button>

      {/* Table block (Full width on Desktop, retaining table header toolbar) */}
      <div className="w-full border border-[#E1BEE7]/45 rounded-xl bg-white shadow-sm mt-4">
        {/* Table Toolbar */}
        <div className="px-4 py-4 border-b border-[#E1BEE7]/25 bg-white flex items-center justify-between rounded-t-xl">
          <div>
            <h2 className="text-base font-black text-[#4A148C]">
              {selectedBrand === "__all__" ? `${selectedCategory === "__all__" ? "สินค้าทุกหมวดหมู่" : categories.find(c => c.id === selectedCategory)?.name ?? ""}ทั้งหมด` : selectedBrand}
            </h2>
            <div className="flex items-center gap-2 mt-1 text-xs font-semibold text-slate-400">
              <span>Path:</span>
              <span className="text-[#4A148C] font-black">
                {selectedCategory === "__all__" ? "ทุกหมวดหมู่" : categories.find(c => c.id === selectedCategory)?.name ?? ""}
              </span>
              <span className="text-slate-300">/</span>
              <span className="text-[#4A148C] font-black">
                {selectedBrand === "__all__" ? "ทั้งหมด" : selectedBrand}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/settings/products/template"
              className="hidden items-center gap-2 rounded-lg border border-[#4A148C]/20 bg-white px-4 py-2 text-xs font-black text-[#4A148C] transition-colors hover:bg-slate-50 lg:flex btn-press"
            >
              <FileDown className="h-3.5 w-3.5" strokeWidth={2.5} />
              เทมเพลต
            </a>
            <button
              type="button"
              onClick={openImportFilePicker}
              disabled={isImportPending}
              className="hidden items-center gap-2 rounded-lg border border-[#4A148C]/20 bg-white px-4 py-2 text-xs font-black text-[#4A148C] transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 lg:flex btn-press"
            >
              {isImportPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} />
              ) : (
                <Upload className="h-3.5 w-3.5" strokeWidth={2.5} />
              )}
              นำเข้า Excel
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="hidden items-center gap-2 rounded-lg border border-[#4A148C]/20 bg-white px-4 py-2 text-xs font-black text-[#4A148C] transition-colors hover:bg-slate-50 lg:flex btn-press"
            >
              <Download className="h-3.5 w-3.5" strokeWidth={2.5} />
              ส่งออกข้อมูล
            </button>
            {children}
          </div>
        </div>

        {/* Brand row (moved here, above the table headers) */}
        {brandOptions.length > 0 && (
          <div className="relative z-10 flex h-12 items-center gap-5 border-b border-[#E1BEE7]/20 bg-slate-50/30 px-4 transition-all duration-300 lg:gap-6 lg:px-6">
            <span className="hidden min-w-[70px] text-xs font-black uppercase tracking-wider text-slate-400 lg:inline">
              แบรนด์:
            </span>
            <button
              type="button"
              onClick={() => openMobileFilterDrawer("brand")}
              className="flex shrink-0 items-center gap-1.5 text-sm font-black text-[#4A148C] lg:hidden"
              aria-label="เปิดรายการแบรนด์ทั้งหมด"
            >
              แบรนด์
              <ListFilter className="h-4 w-4" strokeWidth={2.5} />
            </button>
            <div className="flex h-full min-w-0 flex-1 items-center gap-6 overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={(e) => handleBrandSelect("__all__", e)}
                className={`relative flex h-full shrink-0 items-center whitespace-nowrap px-2 text-sm font-black transition-colors ${
                  selectedBrand === "__all__"
                    ? "text-[#4A148C]"
                    : "text-slate-500 hover:text-[#4A148C]"
                }`}
              >
                ทั้งหมด
                {selectedBrand === "__all__" && (
                  <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#4A148C]"></div>
                )}
              </button>

              {brandOptions.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={(e) => handleBrandSelect(b, e)}
                  className={`relative flex h-full shrink-0 items-center whitespace-nowrap px-2 text-sm font-black transition-colors ${
                    selectedBrand === b
                      ? "text-[#4A148C]"
                      : "text-slate-500 hover:text-[#4A148C]"
                  }`}
                >
                  {b}
                  {selectedBrand === b && (
                    <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[#4A148C]"></div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="w-full">
          <ProductList products={filteredProducts} onEdit={setEditingProduct} />
        </div>
      </div>

      {mobileFilterDrawer ? (
        <div
          className={`fixed inset-0 z-[120] flex items-end bg-slate-950/45 lg:hidden ${
            isMobileFilterDrawerClosing
              ? "animate-out fade-out duration-200"
              : "animate-in fade-in duration-200"
          }`}
        >
          <button
            type="button"
            className="absolute inset-0"
            onClick={closeMobileFilterDrawer}
            aria-label="ปิดรายการตัวกรอง"
          />
          <section
            className={`relative flex max-h-[78dvh] w-full flex-col overflow-hidden rounded-t-[1.5rem] bg-white shadow-[0_-20px_60px_rgba(15,23,42,0.22)] ${
              isMobileFilterDrawerClosing
                ? "animate-out slide-out-to-bottom-full duration-250 ease-in"
                : "animate-in slide-in-from-bottom-full duration-300 ease-out"
            }`}
          >
            <header className="flex items-center justify-between border-b border-[#E1BEE7] px-5 py-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-[#4A148C]">
                  ตัวกรองสินค้า
                </p>
                <h3 className="mt-1 text-xl font-black text-slate-950">
                  {mobileFilterDrawer === "category" ? "เลือกหมวดหมู่" : "เลือกแบรนด์"}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeMobileFilterDrawer}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-[#E1BEE7] text-[#4A148C]"
                aria-label="ปิด"
              >
                <X className="h-5 w-5" strokeWidth={2.5} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
              {mobileFilterDrawer === "category" ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategory("__all__");
                      setSelectedBrand("__all__");
                      closeMobileFilterDrawer();
                    }}
                    className={`flex min-h-14 w-full items-center justify-between border-b border-[#E1BEE7]/70 text-left text-base font-black ${
                      selectedCategory === "__all__" ? "text-[#4A148C]" : "text-slate-950"
                    }`}
                  >
                    ทุกหมวดหมู่
                    {selectedCategory === "__all__" ? (
                      <span className="h-2.5 w-2.5 rounded-full bg-[#4A148C]" />
                    ) : null}
                  </button>
                  {categoryOptions.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => {
                        setSelectedCategory(category.id);
                        setSelectedBrand("__all__");
                        closeMobileFilterDrawer();
                      }}
                      className={`flex min-h-14 w-full items-center justify-between border-b border-[#E1BEE7]/70 text-left text-base font-black ${
                        selectedCategory === category.id ? "text-[#4A148C]" : "text-slate-950"
                      }`}
                    >
                      {category.name}
                      {selectedCategory === category.id ? (
                        <span className="h-2.5 w-2.5 rounded-full bg-[#4A148C]" />
                      ) : null}
                    </button>
                  ))}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedBrand("__all__");
                      closeMobileFilterDrawer();
                    }}
                    className={`flex min-h-14 w-full items-center justify-between border-b border-[#E1BEE7]/70 text-left text-base font-black ${
                      selectedBrand === "__all__" ? "text-[#4A148C]" : "text-slate-950"
                    }`}
                  >
                    ทุกแบรนด์
                    {selectedBrand === "__all__" ? (
                      <span className="h-2.5 w-2.5 rounded-full bg-[#4A148C]" />
                    ) : null}
                  </button>
                  {brandOptions.map((brand) => (
                    <button
                      key={brand}
                      type="button"
                      onClick={() => {
                        setSelectedBrand(brand);
                        closeMobileFilterDrawer();
                      }}
                      className={`flex min-h-14 w-full items-center justify-between border-b border-[#E1BEE7]/70 text-left text-base font-black ${
                        selectedBrand === brand ? "text-[#4A148C]" : "text-slate-950"
                      }`}
                    >
                      {brand}
                      {selectedBrand === brand ? (
                        <span className="h-2.5 w-2.5 rounded-full bg-[#4A148C]" />
                      ) : null}
                    </button>
                  ))}
                </>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {isCreating && (
        <ProductForm
          categories={categories}
          brands={brands}
          suppliers={suppliers}
          nextSku={nextSku}
          productList={allProducts}
          returnHref={baseListHref}
          onClose={() => setIsCreating(false)}
        />
      )}
      {editingProduct && (
        <ProductForm
          categories={categories}
          brands={brands}
          editingProduct={editingProduct}
          suppliers={suppliers}
          nextSku={nextSku}
          productList={allProducts}
          returnHref={baseListHref}
          onClose={() => setEditingProduct(null)}
        />
      )}
    </>
  );
}
