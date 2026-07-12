"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  ExternalLink,
  Palette,
  RotateCcw,
  Save,
  Search,
  X,
} from "lucide-react";
import {
  buildCategoryPrintPalette,
  CATEGORY_PRINT_COLOR_PRESETS,
  normalizePrintColor,
} from "@/lib/products/category-print-colors";
import { saveProductCategoryPrintColorAction } from "@/app/settings/products/category-colors/actions";

export type ProductCategoryColorSetting = {
  id: string;
  name: string;
  printColor: string | null;
  defaultColor: string;
  productCount: number;
  sortOrder: number;
};

type ProductCategoryColorSettingsProps = {
  categories: ProductCategoryColorSetting[];
};

function pluralItems(count: number) {
  return `${count.toLocaleString("th-TH")} รายการ`;
}

function getInitialDrafts(categories: ProductCategoryColorSetting[]) {
  return Object.fromEntries(categories.map((category) => [category.id, category.printColor]));
}

export function ProductCategoryColorSettings({ categories }: ProductCategoryColorSettingsProps) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(categories[0]?.id ?? "");
  const [draftColors, setDraftColors] = useState<Record<string, string | null>>(() => getInitialDrafts(categories));
  const [message, setMessage] = useState("");
  const [isEditorOpen, setIsEditorOpen] = useState(Boolean(categories[0]));
  const [isPending, startTransition] = useTransition();

  const selectedCategory = categories.find((category) => category.id === selectedId) ?? categories[0] ?? null;
  const selectedDraft = selectedCategory ? draftColors[selectedCategory.id] ?? null : null;
  const selectedDisplayColor = selectedDraft ?? selectedCategory?.defaultColor ?? "#EA80FC";
  const normalizedSelectedColor = normalizePrintColor(selectedDisplayColor) ?? selectedCategory?.defaultColor ?? "#EA80FC";
  const selectedOriginalColor = selectedCategory?.printColor ?? null;
  const isDirty = selectedCategory ? selectedDraft !== selectedOriginalColor : false;

  const filteredCategories = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("th");
    if (!normalizedQuery) return categories;
    return categories.filter((category) => category.name.toLocaleLowerCase("th").includes(normalizedQuery));
  }, [categories, query]);

  const previewCategories = useMemo(
    () =>
      categories.slice(0, 8).map((category) => ({
        ...category,
        color: draftColors[category.id] ?? category.defaultColor,
      })),
    [categories, draftColors],
  );

  function selectCategory(categoryId: string) {
    setSelectedId(categoryId);
    setMessage("");
    setIsEditorOpen(true);
  }

  function setSelectedColor(value: string | null) {
    if (!selectedCategory) return;
    setDraftColors((current) => ({
      ...current,
      [selectedCategory.id]: value,
    }));
    setMessage("");
  }

  function handleHexChange(value: string) {
    const withHash = value.startsWith("#") ? value : `#${value}`;
    setSelectedColor(withHash.toUpperCase().slice(0, 7));
  }

  function handleSave() {
    if (!selectedCategory) return;
    const normalizedColor = selectedDraft === null ? null : normalizePrintColor(selectedDraft);
    if (selectedDraft !== null && !normalizedColor) {
      setMessage("รหัสสีต้องเป็นรูปแบบ #RRGGBB");
      return;
    }

    startTransition(async () => {
      const result = await saveProductCategoryPrintColorAction({
        categoryId: selectedCategory.id,
        color: normalizedColor,
      });
      setMessage(result.message);
      if (result.status === "success") {
        setDraftColors((current) => ({
          ...current,
          [selectedCategory.id]: normalizedColor,
        }));
      }
    });
  }

  return (
    <div className="min-h-screen bg-white text-slate-950 lg:grid lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="border-r border-slate-200 bg-white lg:min-h-screen">
        <div className="hidden border-b border-slate-200 px-5 py-6 lg:block">
          <Link
            href="/settings/products"
            className="mb-4 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[12px] font-black text-[#4A148C] transition hover:bg-slate-50 active:scale-[0.98]"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.7} />
            <span>กลับหน้าจัดการสินค้า</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[#E1BEE7] bg-white text-[#4A148C]">
              <Palette className="h-6 w-6" strokeWidth={2.1} />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-black text-slate-950">สีหมวดหมู่ในใบออเดอร์</h1>
              <p className="text-sm font-semibold text-slate-500">กำหนดสีสำหรับแยกหมวดหมู่ในใบออเดอร์</p>
            </div>
          </div>
        </div>

        <div className="sticky top-0 z-20 border-b border-slate-200 bg-white px-4 py-4 lg:hidden">
          <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2">
            <Link
              href="/settings/products"
              className="flex h-10 w-10 items-center justify-center rounded-md text-[#4A148C] transition active:scale-95"
              aria-label="กลับหน้าจัดการสินค้า"
            >
              <ArrowLeft className="h-5 w-5" strokeWidth={2.4} />
            </Link>
            <h1 className="truncate text-center text-lg font-black text-[#4A148C]">สีหมวดหมู่ในใบออเดอร์</h1>
            <button
              type="button"
              onClick={handleSave}
              disabled={!selectedCategory || isPending}
              className="flex h-10 w-10 items-center justify-center rounded-md text-[#4A148C] transition active:scale-95 disabled:opacity-45"
              aria-label="บันทึก"
            >
              <Save className="h-5 w-5" strokeWidth={2.4} />
            </button>
          </div>
        </div>

        {/* Mobile preview — full width above category list */}
        <div className="border-b border-slate-200 bg-slate-50/60 px-4 py-4 lg:hidden">
          <PreviewPanel categories={previewCategories} fullWidth />
        </div>

        <div className="space-y-3 px-4 py-4 lg:px-5 lg:py-5">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" strokeWidth={2.1} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-11 w-full rounded-md border border-slate-300 bg-white pl-10 pr-3 text-sm font-semibold text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#4A148C] focus:ring-2 focus:ring-[#EA80FC]/25"
              placeholder="ค้นหาหมวดหมู่"
            />
          </label>

          <button
            type="button"
            onClick={() => setSelectedColor(null)}
            disabled={!selectedCategory}
            className="inline-flex items-center gap-2 rounded-md px-1 py-2 text-sm font-bold text-[#4A148C] transition active:scale-[0.98] disabled:opacity-45"
          >
            <RotateCcw className="h-5 w-5" strokeWidth={2.2} />
            คืนค่าเริ่มต้น
          </button>

          <div className="divide-y divide-slate-200">
            {filteredCategories.map((category) => {
              const draftColor = draftColors[category.id] ?? category.defaultColor;
              const isSelected = category.id === selectedCategory?.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => selectCategory(category.id)}
                  className={`grid w-full grid-cols-[48px_minmax(0,1fr)_24px] items-center gap-3 border-l-4 py-3.5 pr-1 text-left transition ${
                    isSelected
                      ? "border-[#4A148C] bg-[#F6ECFF]"
                      : "border-transparent bg-white hover:bg-slate-50"
                  }`}
                >
                  <span
                    className="ml-2 h-11 w-11 rounded-md border border-slate-200 shadow-inner"
                    style={{ backgroundColor: draftColor }}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-base font-black text-slate-950">{category.name}</span>
                    <span className="block text-sm font-semibold text-slate-500">{pluralItems(category.productCount)}</span>
                  </span>
                  <ChevronRight className="h-5 w-5 text-slate-500" strokeWidth={2.2} />
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      <main className="hidden min-w-0 lg:block">
        {/* Desktop preview — full width within the editor column */}
        <div className="border-b border-slate-200 bg-slate-50/60 px-8 py-6">
          <PreviewPanel categories={previewCategories} fullWidth />
        </div>

        <div className="max-w-[580px] px-8 py-8">
          <CategoryColorEditor
            selectedCategory={selectedCategory}
            selectedColor={normalizedSelectedColor}
            isDirty={isDirty}
            isPending={isPending}
            message={message}
            onHexChange={handleHexChange}
            onPickColor={setSelectedColor}
            onReset={() => setSelectedColor(null)}
            onSave={handleSave}
          />
        </div>
      </main>

      {isEditorOpen && selectedCategory ? (
        <div className="fixed inset-x-0 bottom-0 z-40 rounded-t-3xl border border-slate-200 bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+88px)] pt-3 shadow-[0_-18px_45px_rgba(15,23,42,0.18)] lg:hidden">
          <div className="mx-auto mb-4 h-1 w-16 rounded-full bg-slate-300" />
          <CategoryColorEditor
            selectedCategory={selectedCategory}
            selectedColor={normalizedSelectedColor}
            isDirty={isDirty}
            isPending={isPending}
            message={message}
            compact
            onHexChange={handleHexChange}
            onPickColor={setSelectedColor}
            onReset={() => setSelectedColor(null)}
            onSave={handleSave}
            onClose={() => setIsEditorOpen(false)}
          />

          <div className="mt-3 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setIsEditorOpen(false)}
              className="h-12 rounded-md border border-slate-300 bg-white text-sm font-black text-[#4A148C] transition active:scale-[0.98]"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending || !isDirty}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#4A148C] text-sm font-black text-white shadow-[0_14px_28px_rgba(74,20,140,0.24)] transition active:scale-[0.98] disabled:opacity-50"
            >
              <Save className="h-4 w-4" strokeWidth={2.3} />
              บันทึก
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CategoryColorEditor({
  selectedCategory,
  selectedColor,
  isDirty,
  isPending,
  message,
  compact = false,
  onHexChange,
  onPickColor,
  onReset,
  onSave,
  onClose,
}: {
  selectedCategory: ProductCategoryColorSetting | null;
  selectedColor: string;
  isDirty: boolean;
  isPending: boolean;
  message: string;
  compact?: boolean;
  onHexChange: (value: string) => void;
  onPickColor: (value: string | null) => void;
  onReset: () => void;
  onSave: () => void;
  onClose?: () => void;
}) {
  if (!selectedCategory) {
    return <div className="text-sm font-semibold text-slate-500">ยังไม่มีหมวดหมู่</div>;
  }

  return (
    <section className={compact ? "space-y-4" : "space-y-7"}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-600">หมวดหมู่</p>
          <h2 className={compact ? "mt-1 text-xl font-black text-slate-950" : "mt-1 text-3xl font-black text-slate-950"}>
            {selectedCategory.name}
          </h2>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition active:scale-95"
            aria-label="ปิด"
          >
            <X className="h-5 w-5" strokeWidth={2.2} />
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-[96px_minmax(0,220px)] items-center gap-6">
        <span
          className="h-[88px] w-[88px] rounded-md border border-slate-300 shadow-inner"
          style={{ backgroundColor: selectedColor }}
        />
        <label className="grid gap-2 text-sm font-bold text-slate-700">
          รหัสสี (HEX)
          <input
            value={selectedColor}
            onChange={(event) => onHexChange(event.target.value)}
            className="h-12 rounded-md border border-slate-300 px-4 text-base font-bold text-slate-900 outline-none transition focus:border-[#4A148C] focus:ring-2 focus:ring-[#EA80FC]/25"
            inputMode="text"
            maxLength={7}
          />
        </label>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-bold text-slate-700">สีพรีเซ็ต (สีที่เหมาะสำหรับงานพิมพ์)</p>
        <div className="grid grid-cols-5 gap-4 sm:grid-cols-6">
          {CATEGORY_PRINT_COLOR_PRESETS.map((color) => {
            const active = color === selectedColor;
            return (
              <button
                key={color}
                type="button"
                onClick={() => onPickColor(color)}
                className={`relative h-16 rounded-md border transition active:scale-[0.98] ${
                  active ? "border-[#4A148C] ring-2 ring-[#4A148C]" : "border-slate-200"
                }`}
                style={{ backgroundColor: color }}
                aria-label={`เลือกสี ${color}`}
              >
                {active ? (
                  <span className="absolute inset-0 m-auto flex h-7 w-7 items-center justify-center rounded-full bg-[#4A148C] text-white">
                    <Check className="h-4 w-4" strokeWidth={3} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-black text-[#4A148C] transition active:scale-[0.98]">
          <Palette className="h-4 w-4" strokeWidth={2.2} />
          เลือกสีเอง
          <input
            type="color"
            value={selectedColor}
            onChange={(event) => onPickColor(event.target.value.toUpperCase())}
            className="sr-only"
          />
        </label>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-black text-slate-600 transition active:scale-[0.98]"
        >
          <RotateCcw className="h-4 w-4" strokeWidth={2.2} />
          คืนค่าเริ่มต้น
        </button>
      </div>

      {message ? <p className="text-sm font-bold text-[#4A148C]">{message}</p> : null}

      {!compact ? (
        <div className="fixed bottom-8 right-8 flex gap-3">
          <button
            type="button"
            onClick={onReset}
            className="h-12 min-w-28 rounded-md border border-slate-300 bg-white px-6 text-sm font-black text-slate-700 transition active:scale-[0.98]"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={isPending || !isDirty}
            className="inline-flex h-12 min-w-28 items-center justify-center gap-2 rounded-md bg-[#4A148C] px-6 text-sm font-black text-white shadow-[0_16px_30px_rgba(74,20,140,0.25)] transition active:scale-[0.98] disabled:opacity-50"
          >
            <Save className="h-4 w-4" strokeWidth={2.3} />
            บันทึก
          </button>
        </div>
      ) : null}
    </section>
  );
}

function PreviewPanel({
  categories,
  compact = false,
  fullWidth = false,
}: {
  categories: Array<ProductCategoryColorSetting & { color: string }>;
  compact?: boolean;
  fullWidth?: boolean;
}) {
  const rows = ["ก๋วยจั๊บญวน", "เส้นเล็กน้ำ", "เกาเหลาหมึก"];

  return (
    <section className={compact ? "mt-5 space-y-2" : fullWidth ? "space-y-3" : "space-y-4 border-t border-slate-200 pt-6"}>
      <div className="flex items-center justify-between gap-3">
        <h3 className={compact ? "text-sm font-black text-slate-800" : "text-base font-black text-slate-900"}>
          ตัวอย่างในใบออเดอร์
        </h3>
        {!compact ? (
          <a
            href="/orders/packing-list"
            className="inline-flex items-center gap-2 text-sm font-black text-[#4A148C]"
            target="_blank"
            rel="noreferrer"
          >
            ดูตัวอย่างเต็มหน้า
            <ExternalLink className="h-4 w-4" strokeWidth={2.2} />
          </a>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-md border border-slate-300 bg-white">
        <table className="w-full table-fixed border-collapse text-center text-[10px] font-bold text-slate-900">
          <thead>
            <tr>
              {categories.map((category) => {
                const palette = buildCategoryPrintPalette(category.color);
                return (
                  <th
                    key={category.id}
                    colSpan={2}
                    className="border border-slate-300 px-1 py-2"
                    style={{ backgroundColor: palette.header }}
                  >
                    {category.name}
                  </th>
                );
              })}
            </tr>
            <tr>
              {categories.map((category) => (
                <th key={`${category.id}-label`} colSpan={2} className="border border-slate-300 bg-white px-1 py-1 text-[8px] text-slate-600">
                  รายการ&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;จำนวน
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={row}>
                {categories.map((category) => {
                  const palette = buildCategoryPrintPalette(category.color);
                  return (
                    <td
                      key={`${row}-${category.id}`}
                      colSpan={2}
                      className="border border-slate-200 px-1 py-2"
                      style={{ backgroundColor: rowIndex % 2 === 0 ? palette.rowA : palette.rowB }}
                    >
                      <span className="line-clamp-1">{row}</span>
                      <strong className="block">1</strong>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
