"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FolderTree,
  Package2,
  Palette,
  RotateCcw,
  Save,
  Tag,
  X,
} from "lucide-react";
import { saveProductPrintBackgroundColorsAction } from "@/app/settings/products/product-colors/actions";
import {
  buildCategoryPrintPalette,
  CATEGORY_PRINT_COLOR_PRESETS,
  normalizePrintColor,
} from "@/lib/products/category-print-colors";

const DESKTOP_PREVIEW_PRODUCTS_PER_PAGE = 12;
const MOBILE_PREVIEW_PRODUCTS_PER_PAGE = 6;

type ProductColorMode = "category" | "custom" | "unset";

export type ProductPrintColorCategory = {
  id: string;
  name: string;
  printColor: string | null;
  defaultColor: string;
  productCount: number;
  sortOrder: number;
};

export type ProductPrintColorProduct = {
  brand: string;
  categoryIds: string[];
  categoryName: string;
  defaultCategoryColor: string;
  displayName: string;
  id: string;
  printBackgroundColor: string | null;
  sku: string;
  sortOrder: number;
};

type ProductPrintBackgroundColorSettingsProps = {
  categories: ProductPrintColorCategory[];
  products: ProductPrintColorProduct[];
};

function getEffectiveColor(product: ProductPrintColorProduct, draftColor: string | null | undefined) {
  return draftColor ?? product.defaultCategoryColor;
}

function getMode(product: ProductPrintColorProduct, draftColor: string | null | undefined): ProductColorMode {
  if (draftColor) return "custom";
  return product.defaultCategoryColor ? "category" : "unset";
}

function pageForIndex(index: number, perPage: number) {
  return Math.floor(index / perPage) + 1;
}

function getInitialDrafts(products: ProductPrintColorProduct[]) {
  return Object.fromEntries(products.map((product) => [product.id, product.printBackgroundColor]));
}

export function ProductPrintBackgroundColorSettings({
  products,
}: ProductPrintBackgroundColorSettingsProps) {
  const [draftColors, setDraftColors] = useState<Record<string, string | null>>(() => getInitialDrafts(products));
  const [savedColors, setSavedColors] = useState<Record<string, string | null>>(() => getInitialDrafts(products));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [previewPage, setPreviewPage] = useState(1);
  const [previewProductsPerPage, setPreviewProductsPerPage] = useState(DESKTOP_PREVIEW_PRODUCTS_PER_PAGE);
  const [mobileEditorOpen, setMobileEditorOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    router.prefetch("/settings/products");
    router.prefetch("/settings/products?tab=categories");
    router.prefetch("/settings/products?tab=brands");
    router.prefetch("/settings/products/category-colors");
  }, [router]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const updatePreviewSize = () => {
      setPreviewProductsPerPage(media.matches ? MOBILE_PREVIEW_PRODUCTS_PER_PAGE : DESKTOP_PREVIEW_PRODUCTS_PER_PAGE);
    };

    updatePreviewSize();
    media.addEventListener("change", updatePreviewSize);
    return () => media.removeEventListener("change", updatePreviewSize);
  }, []);

  const totalPreviewPages = Math.max(1, Math.ceil(products.length / previewProductsPerPage));
  const selectedProducts = products.filter((product) => selectedIds.has(product.id));
  const activeProduct = selectedProducts[0] ?? null;
  const currentPreviewPage = Math.min(previewPage, totalPreviewPages);
  const previewProducts = products.slice(
    (currentPreviewPage - 1) * previewProductsPerPage,
    currentPreviewPage * previewProductsPerPage,
  );
  const tableProducts = previewProducts;
  const allVisibleSelected = tableProducts.length > 0 && tableProducts.every((product) => selectedIds.has(product.id));
  const selectedColor = activeProduct ? draftColors[activeProduct.id] ?? activeProduct.defaultCategoryColor : "#F2E6BD";

  function toggleProduct(product: ProductPrintColorProduct) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(product.id)) {
        next.delete(product.id);
      } else {
        next.add(product.id);
        const index = products.findIndex((item) => item.id === product.id);
        if (index >= 0) setPreviewPage(pageForIndex(index, previewProductsPerPage));
      }
      return next;
    });
    setMessage("");
  }

  function selectProductForEditor(product: ProductPrintColorProduct, openMobileEditor = false) {
    const index = products.findIndex((item) => item.id === product.id);
    setSelectedIds(new Set([product.id]));
    if (index >= 0) setPreviewPage(pageForIndex(index, previewProductsPerPage));
    setMobileEditorOpen(openMobileEditor);
    setMessage("");
  }

  function toggleVisibleProducts() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        tableProducts.forEach((product) => next.delete(product.id));
      } else {
        tableProducts.forEach((product) => next.add(product.id));
        const firstIndex = products.findIndex((item) => item.id === tableProducts[0]?.id);
        if (firstIndex >= 0) setPreviewPage(pageForIndex(firstIndex, previewProductsPerPage));
      }
      return next;
    });
  }

  function jumpToProduct(product: ProductPrintColorProduct) {
    const index = products.findIndex((item) => item.id === product.id);
    if (index >= 0) setPreviewPage(pageForIndex(index, previewProductsPerPage));
    setSelectedIds(new Set([product.id]));
    setMessage("");
  }

  function setProductsColor(productIds: string[], color: string | null) {
    setDraftColors((current) => {
      const next = { ...current };
      productIds.forEach((productId) => {
        next[productId] = color;
      });
      return next;
    });
    setMessage("");
  }

  function applySelectedColor(color: string | null) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setProductsColor(ids, color);
  }

  function applyAndSaveSingleProductColor(product: ProductPrintColorProduct, color: string) {
    const normalizedColor = normalizePrintColor(color);
    if (!normalizedColor) {
      setMessage("รหัสสีต้องเป็นรูปแบบ #RRGGBB");
      return;
    }

    setSelectedIds(new Set([product.id]));
    setProductsColor([product.id], normalizedColor);
    startTransition(async () => {
      const result = await saveProductPrintBackgroundColorsAction({
        updates: [{ productId: product.id, color: normalizedColor }],
      });
      setMessage(result.message);
      if (result.status === "success") {
        setSavedColors((current) => ({ ...current, [product.id]: normalizedColor }));
      }
    });
  }

  function handleSave() {
    const updates = Array.from(selectedIds)
      .filter((productId) => (draftColors[productId] ?? null) !== (savedColors[productId] ?? null))
      .map((productId) => ({
        productId,
        color: draftColors[productId] ?? null,
      }));

    if (updates.length === 0) {
      setMessage("ยังไม่มีรายการที่เปลี่ยนสี");
      return;
    }

    if (updates.some((update) => update.color !== null && !normalizePrintColor(update.color))) {
      setMessage("รหัสสีต้องเป็นรูปแบบ #RRGGBB");
      return;
    }

    startTransition(async () => {
      const result = await saveProductPrintBackgroundColorsAction({
        updates: updates.map((update) => ({
          productId: update.productId,
          color: update.color === null ? null : normalizePrintColor(update.color),
        })),
      });
      setMessage(result.message);
      if (result.status === "success") {
        setSavedColors((current) => {
          const next = { ...current };
          updates.forEach((update) => {
            next[update.productId] = update.color === null ? null : normalizePrintColor(update.color);
          });
          return next;
        });
      }
    });
  }

  return (
    <div className="min-h-screen bg-white text-slate-950">
      <ProductColorTabs />

      <div className="grid min-h-[calc(100vh-42px)] grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1fr)_260px]">
        <main className="min-w-0 space-y-3 px-1.5 py-3 pb-24 lg:px-5 lg:py-4">
          <PreviewPanel
            activeProductId={activeProduct?.id ?? null}
            currentPage={currentPreviewPage}
            products={previewProducts}
            totalPages={totalPreviewPages}
            draftColors={draftColors}
            onPageChange={setPreviewPage}
            onProductSelect={(product) => selectProductForEditor(product, true)}
          />

          <section className="rounded-lg border border-slate-200 bg-white">
            <ProductTable
              allVisibleSelected={allVisibleSelected}
              draftColors={draftColors}
              products={tableProducts}
              productsPerPage={previewProductsPerPage}
              selectedIds={selectedIds}
              totalCount={products.length}
              onColorPick={(product, color) => setProductsColor([product.id], color)}
              onMobileColorPick={applyAndSaveSingleProductColor}
              onJump={jumpToProduct}
              onModePick={(product, mode) => setProductsColor([product.id], mode === "category" ? null : getEffectiveColor(product, draftColors[product.id]))}
              onToggle={toggleProduct}
              onToggleVisible={toggleVisibleProducts}
            />
          </section>
        </main>

        <aside className="hidden border-l border-slate-200 bg-white p-3 lg:block">
          <ProductColorEditorPanel
            activeProduct={activeProduct}
            color={selectedColor}
            count={selectedIds.size}
            isPending={isPending}
            message={message}
            onApplyCategory={() => applySelectedColor(null)}
            onPickColor={(color) => applySelectedColor(color)}
            onSave={handleSave}
          />
        </aside>

        {mobileEditorOpen ? (
          <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 rounded-t-2xl border border-b-0 border-slate-200 bg-white px-4 pb-4 pt-2 shadow-[0_-16px_36px_rgba(15,23,42,0.18)] lg:hidden">
            <div className="mx-auto mb-2 h-1 w-12 rounded-full bg-slate-300" />
            <ProductColorEditorPanel
              activeProduct={activeProduct}
              color={selectedColor}
              count={selectedIds.size}
              isPending={isPending}
              message={message}
              compact
              onApplyCategory={() => applySelectedColor(null)}
              onClose={() => setMobileEditorOpen(false)}
              onPickColor={(color) => applySelectedColor(color)}
              onSave={handleSave}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ProductColorTabs() {
  const tabs = [
    { href: "/settings/products", label: "สินค้า", icon: Package2, active: false },
    { href: "/settings/products?tab=categories", label: "หมวดหมู่", icon: FolderTree, active: false },
    { href: "/settings/products?tab=brands", label: "แบรนด์", icon: Tag, active: false },
    { href: "/settings/products/category-colors", label: "สีหมวดหมู่", icon: Palette, active: false },
    { href: "/settings/products/product-colors", label: "สีพื้นหลังสินค้า", icon: Palette, active: true },
  ];

  return (
    <nav className="sticky top-0 z-40 flex overflow-x-auto border-b border-slate-200 bg-white [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`relative flex min-w-max flex-1 items-center justify-center gap-2 px-3 py-2.5 text-[13px] font-black transition active:scale-[0.98] ${
              tab.active ? "text-[#4A148C]" : "text-slate-500"
            }`}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
            {tab.label}
            <span className={`absolute inset-x-0 bottom-0 h-0.5 bg-[#4A148C] ${tab.active ? "scale-x-100" : "scale-x-0"}`} />
          </Link>
        );
      })}
    </nav>
  );
}

function PreviewPanel({
  activeProductId,
  currentPage,
  draftColors,
  onPageChange,
  onProductSelect,
  products,
  totalPages,
}: {
  activeProductId: string | null;
  currentPage: number;
  draftColors: Record<string, string | null>;
  onPageChange: (page: number) => void;
  onProductSelect: (product: ProductPrintColorProduct) => void;
  products: ProductPrintColorProduct[];
  totalPages: number;
}) {
  const rows = ["หน้าวัดใจ", "จอย", "ยุพา", "เฮียสมบัติ", "รวมยอด"];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-1.5 lg:p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-black text-slate-950">Preview ใบออเดอร์</h2>
          <p className="hidden text-[11px] font-bold text-slate-500 lg:block">คลิกชื่อสินค้าใน Preview เพื่อเปลี่ยนสี</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            className="grid h-8 w-8 place-items-center rounded-md border border-slate-300 text-slate-700"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="whitespace-nowrap text-[13px] font-black text-slate-800">หน้า {currentPage} / {totalPages}</span>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            className="grid h-8 w-8 place-items-center rounded-md border border-slate-300 text-slate-700"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-black bg-white">
        <div className="overflow-hidden lg:overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-center text-[4.75px] font-black leading-[1.15] lg:min-w-[700px] lg:text-[10px] lg:leading-tight">
            <thead>
              <tr>
                {products.map((product) => {
                  const color = getEffectiveColor(product, draftColors[product.id]);
                  return (
                    <th
                      key={product.id}
                      className={`h-14 border border-black p-0 align-middle lg:h-12 ${activeProductId === product.id ? "outline outline-2 outline-[#4A148C] outline-offset-[-2px]" : ""}`}
                      style={{ backgroundColor: color }}
                    >
                      <button
                        type="button"
                        onClick={() => onProductSelect(product)}
                        className="relative flex h-full w-full items-center justify-center px-[2px] py-1.5 text-center text-[4.75px] leading-[1.2] transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4A148C] lg:px-0.5 lg:py-0 lg:text-[10px] lg:leading-tight"
                        title={`${product.sku} ${product.displayName}`}
                      >
                        <span className="block max-w-full whitespace-normal break-words">{product.displayName}</span>
                        {activeProductId === product.id ? (
                          <span className="absolute -bottom-4 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-[#4A148C] px-1.5 py-0.5 text-[8px] font-black text-white lg:block">
                            {product.sku}
                          </span>
                        ) : null}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={row} className={rowIndex === rows.length - 1 ? "bg-[#FFD400]" : ""}>
                  {products.map((product, productIndex) => {
                    const palette = buildCategoryPrintPalette(getEffectiveColor(product, draftColors[product.id]));
                    const value = rowIndex === rows.length - 1 ? (productIndex + 1) * 5 : (rowIndex + productIndex) % 3 === 0 ? (rowIndex + 1) * 10 : "";
                    return (
                      <td
                        key={`${row}-${product.id}`}
                        className="border border-black py-0.5 text-[9px] lg:text-sm"
                        style={{ backgroundColor: rowIndex === rows.length - 1 ? "#FFD400" : rowIndex % 2 === 0 ? palette.rowA : palette.rowB }}
                      >
                        {value}
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

function ProductTable({
  allVisibleSelected,
  draftColors,
  onColorPick,
  onMobileColorPick,
  onJump,
  onModePick,
  onToggle,
  onToggleVisible,
  products,
  productsPerPage,
  selectedIds,
  totalCount,
}: {
  allVisibleSelected: boolean;
  draftColors: Record<string, string | null>;
  onColorPick: (product: ProductPrintColorProduct, color: string) => void;
  onMobileColorPick: (product: ProductPrintColorProduct, color: string) => void;
  onJump: (product: ProductPrintColorProduct) => void;
  onModePick: (product: ProductPrintColorProduct, mode: "category" | "custom") => void;
  onToggle: (product: ProductPrintColorProduct) => void;
  onToggleVisible: () => void;
  products: ProductPrintColorProduct[];
  productsPerPage: number;
  selectedIds: Set<string>;
  totalCount: number;
}) {
  return (
    <div>
      <div className="hidden grid-cols-[36px_82px_minmax(190px,1fr)_120px_58px_68px_118px_180px] border-b border-slate-200 bg-slate-50 text-[11px] font-black text-slate-500 lg:grid">
        <button type="button" onClick={onToggleVisible} className="grid place-items-center py-2">
          <span className={`grid h-4 w-4 place-items-center rounded border ${allVisibleSelected ? "border-[#4A148C] bg-[#4A148C]" : "border-slate-300 bg-white"}`}>
            {allVisibleSelected ? <Check className="h-3 w-3 text-white" strokeWidth={3} /> : null}
          </span>
        </button>
        <div className="py-2">รหัสสินค้า</div>
        <div className="py-2">ชื่อสินค้า</div>
        <div className="py-2">หมวดหมู่</div>
        <div className="py-2 text-center">หน้า</div>
        <div className="py-2 text-center">สีปัจจุบัน</div>
        <div className="py-2 text-center">โหมด</div>
        <div className="py-2">สีด่วน</div>
      </div>

      <div className="divide-y divide-slate-100">
        {products.map((product) => {
          const selected = selectedIds.has(product.id);
          const draftColor = draftColors[product.id] ?? null;
          const effectiveColor = getEffectiveColor(product, draftColor);
          const mode = getMode(product, draftColor);
          return (
            <div
              key={product.id}
              onClick={() => onToggle(product)}
              className={`grid cursor-pointer grid-cols-[30px_minmax(0,1fr)_40px] items-center gap-2 px-3 py-2 lg:grid-cols-[36px_82px_minmax(190px,1fr)_120px_58px_68px_118px_180px] lg:gap-0 lg:px-0 lg:py-0 ${
                selected ? "bg-[#F3E5F5]/55" : "bg-white"
              }`}
            >
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggle(product);
                }}
                className="grid place-items-center lg:py-2"
              >
                <span className={`grid h-[18px] w-[18px] place-items-center rounded border ${selected ? "border-[#4A148C] bg-[#4A148C]" : "border-slate-300 bg-white"}`}>
                  {selected ? <Check className="h-3 w-3 text-white" strokeWidth={3} /> : null}
                </span>
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onJump(product);
                }}
                className="hidden text-left text-xs font-bold text-slate-500 lg:block"
              >
                {product.sku}
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onJump(product);
                }}
                className="min-w-0 py-1 text-left"
              >
                <div className="overflow-hidden text-ellipsis whitespace-nowrap py-0.5 text-[13px] font-black leading-[1.6] text-slate-950 lg:truncate lg:py-0 lg:text-xs lg:leading-normal">{product.displayName}</div>
                <div className="mt-1 hidden items-center gap-2 text-xs font-bold text-slate-500 lg:flex">
                  <span>{product.sku}</span>
                  <span className="rounded bg-[#F3E5F5] px-1.5 text-[#4A148C]">หน้า {pageForIndex(product.sortOrder, productsPerPage)}</span>
                </div>
              </button>
              <div className="hidden truncate text-xs font-bold text-slate-600 lg:block">{product.categoryName}</div>
              <div className="hidden text-center lg:block">
                <span className="rounded bg-[#F3E5F5] px-1.5 py-0.5 text-[11px] font-black text-[#4A148C]">หน้า {pageForIndex(product.sortOrder, productsPerPage)}</span>
              </div>
              <div className="flex items-center justify-end lg:justify-center">
                <label
                  onClick={(event) => event.stopPropagation()}
                  className="grid h-8 w-8 cursor-pointer place-items-center rounded-md border border-slate-200 bg-white text-[#4A148C] shadow-sm lg:hidden"
                  aria-label={`เลือกสี ${product.displayName}`}
                >
                  <Palette className="h-[18px] w-[18px]" strokeWidth={2.4} />
                  <input
                    type="color"
                    value={effectiveColor}
                    onChange={(event) => {
                      event.stopPropagation();
                      onMobileColorPick(product, event.target.value.toUpperCase());
                    }}
                    className="sr-only"
                  />
                </label>
                <span className="hidden h-[22px] w-[22px] rounded-[4px] border border-slate-300 lg:block" style={{ backgroundColor: effectiveColor }} />
              </div>
              <div className="col-span-2 hidden items-center gap-1.5 lg:col-span-1 lg:flex lg:justify-center">
                {(["category", "custom"] as const).map((nextMode) => (
                  <button
                    key={nextMode}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onModePick(product, nextMode);
                    }}
                    className={`h-7 rounded-md border px-1.5 text-[11px] font-black ${
                      (nextMode === "category" && mode !== "custom") || (nextMode === "custom" && mode === "custom")
                        ? "border-[#4A148C] bg-[#F3E5F5] text-[#4A148C]"
                        : "border-slate-200 text-slate-500"
                    }`}
                  >
                    {nextMode === "category" ? "ตามหมวด" : "ตั้งเอง"}
                  </button>
                ))}
              </div>
              <div className="col-span-3 hidden gap-1 lg:col-span-1 lg:flex">
                {CATEGORY_PRINT_COLOR_PRESETS.slice(0, 8).map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onColorPick(product, color);
                    }}
                    className={`h-5 w-5 rounded-[4px] border ${color === draftColor ? "border-[#4A148C] ring-2 ring-[#4A148C]" : "border-slate-200"}`}
                    style={{ backgroundColor: color }}
                    aria-label={`เลือกสี ${color}`}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-500">
        <span>แสดง {products.length.toLocaleString("th-TH")} จาก {totalCount.toLocaleString("th-TH")} รายการ</span>
        <span>100+ รายการใช้ค้นหาและกรองเพื่อแก้เร็วขึ้น</span>
      </div>
    </div>
  );
}

function ProductColorEditorPanel({
  activeProduct,
  color,
  compact = false,
  count,
  isPending,
  message,
  onApplyCategory,
  onClose,
  onPickColor,
  onSave,
}: {
  activeProduct: ProductPrintColorProduct | null;
  color: string;
  compact?: boolean;
  count: number;
  isPending: boolean;
  message: string;
  onApplyCategory: () => void;
  onClose?: () => void;
  onPickColor: (color: string) => void;
  onSave: () => void;
}) {
  return (
    <div className={compact ? "space-y-3" : "sticky top-16 space-y-3"}>
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-black text-slate-950">แก้สีสินค้า</h2>
          <p className="truncate text-xs font-bold text-slate-500">
            {activeProduct ? `${activeProduct.sku} ${activeProduct.displayName}` : `เลือกแล้ว ${count.toLocaleString("th-TH")} รายการ`}
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600"
            aria-label="ปิด"
          >
            <X className="h-5 w-5" />
          </button>
        ) : null}
      </div>
      <div className="space-y-2">
        <button
          type="button"
          onClick={onApplyCategory}
          disabled={count === 0}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#4A148C] px-3 text-[13px] font-black text-white disabled:opacity-40"
        >
          <RotateCcw className="h-4 w-4" />
          ใช้สีหมวด
        </button>
        <label className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-[#4A148C] px-3 text-[13px] font-black text-[#4A148C]">
          <Palette className="h-4 w-4" />
          เลือกสีเอง
          <input type="color" value={color} onChange={(event) => onPickColor(event.target.value.toUpperCase())} className="sr-only" />
        </label>
      </div>
      <label className="grid gap-1.5 text-xs font-bold text-slate-700">
        รหัสสี (HEX)
        <input
          value={color}
          onChange={(event) => onPickColor(event.target.value.startsWith("#") ? event.target.value.toUpperCase().slice(0, 7) : `#${event.target.value}`.toUpperCase().slice(0, 7))}
          className="h-10 rounded-md border border-slate-300 px-3 text-sm font-black outline-none focus:border-[#4A148C] focus:ring-2 focus:ring-[#EA80FC]/25"
          maxLength={7}
        />
      </label>
      <div className="grid grid-cols-5 gap-1.5">
        {CATEGORY_PRINT_COLOR_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onPickColor(preset)}
            className={`h-8 rounded-md border ${preset === color ? "border-[#4A148C] ring-2 ring-[#4A148C]" : "border-slate-200"}`}
            style={{ backgroundColor: preset }}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={onSave}
        disabled={isPending || count === 0}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#4A148C] text-[13px] font-black text-white shadow-[0_10px_20px_rgba(74,20,140,0.2)] disabled:opacity-40"
      >
        <Save className="h-4 w-4" />
        บันทึกการเปลี่ยนแปลง
      </button>
      {message ? <p className="rounded-md bg-[#F3E5F5] px-3 py-2 text-xs font-bold text-[#4A148C]">{message}</p> : null}
    </div>
  );
}
