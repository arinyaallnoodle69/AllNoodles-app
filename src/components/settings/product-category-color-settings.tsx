"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check,
  CheckCircle2,
  FolderTree,
  Package2,
  Palette,
  RotateCcw,
  Save,
  Tag,
  X,
  XCircle,
} from "lucide-react";
import { saveProductCategoryPrintColorAction } from "@/app/settings/products/category-colors/actions";
import {
  buildCategoryPrintPalette,
  CATEGORY_PRINT_COLOR_PRESETS,
  normalizePrintColor,
} from "@/lib/products/category-print-colors";

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

function getInitialDrafts(categories: ProductCategoryColorSetting[]) {
  return Object.fromEntries(categories.map((category) => [category.id, category.printColor]));
}

export function ProductCategoryColorSettings({ categories }: ProductCategoryColorSettingsProps) {
  const [selectedId, setSelectedId] = useState(categories[0]?.id ?? "");
  const [savedColors, setSavedColors] = useState<Record<string, string | null>>(() => getInitialDrafts(categories));
  const [draftColors, setDraftColors] = useState<Record<string, string | null>>(() => getInitialDrafts(categories));
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<{
    show: boolean;
    message: string;
    type: "success" | "error";
  }>({ show: false, message: "", type: "success" });
  const router = useRouter();

  useEffect(() => {
    router.prefetch("/settings/products");
    router.prefetch("/settings/products?tab=categories");
    router.prefetch("/settings/products?tab=brands");
    router.prefetch("/settings/products/product-colors");
  }, [router]);

  useEffect(() => {
    if (toast.show) {
      const timer = setTimeout(() => {
        setToast((t) => ({ ...t, show: false }));
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast.show]);

  const selectedCategory = categories.find((category) => category.id === selectedId) ?? categories[0] ?? null;
  const selectedDraft = selectedCategory ? draftColors[selectedCategory.id] ?? null : null;
  const selectedDisplayColor = selectedDraft ?? selectedCategory?.defaultColor ?? "#EA80FC";
  const normalizedSelectedColor = normalizePrintColor(selectedDisplayColor) ?? selectedCategory?.defaultColor ?? "#EA80FC";
  const selectedOriginalColor = selectedCategory ? savedColors[selectedCategory.id] ?? null : null;
  const isDirty = selectedCategory ? selectedDraft !== selectedOriginalColor : false;

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
      setToast({ show: true, message: "รหัสสีต้องเป็นรูปแบบ #RRGGBB", type: "error" });
      return;
    }

    setIsLoading(true);
    saveProductCategoryPrintColorAction({
      categoryId: selectedCategory.id,
      color: normalizedColor,
    })
      .then((result) => {
        setMessage(result.message);
        if (result.status === "success") {
          setSavedColors((current) => ({
            ...current,
            [selectedCategory.id]: normalizedColor,
          }));
          setDraftColors((current) => ({
            ...current,
            [selectedCategory.id]: normalizedColor,
          }));
          setToast({ show: true, message: "บันทึกสีหมวดหมู่สำเร็จแล้ว", type: "success" });
          router.refresh();
        } else {
          setDraftColors((current) => ({
            ...current,
            [selectedCategory.id]: selectedOriginalColor,
          }));
          setToast({ show: true, message: result.message || "บันทึกสีหมวดหมู่ไม่สำเร็จ", type: "error" });
        }
      })
      .catch((error) => {
        console.error("[handleSave]", error);
        setDraftColors((current) => ({
          ...current,
          [selectedCategory.id]: selectedOriginalColor,
        }));
        setMessage("เกิดข้อผิดพลาดในการบันทึก");
        setToast({ show: true, message: "เกิดข้อผิดพลาดในการบันทึก", type: "error" });
      })
      .finally(() => {
        setIsLoading(false);
      });
  }

  return (
    <div className="min-h-screen bg-white text-slate-950">
      <style>{`
        @keyframes toastSlideIn {
          from { transform: translateX(120%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-toast-in {
          animation: toastSlideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      {/* Toast Notification */}
      {toast.show && (
        <div
          className={`fixed top-6 right-6 z-[9999] animate-toast-in flex w-96 max-w-[calc(100vw-3rem)] items-start gap-3 rounded-2xl border p-4 shadow-lg font-[family:var(--font-noto-sans-thai)] ${
            toast.type === "success"
              ? "border-emerald-100 bg-white shadow-[0_16px_48px_rgba(16,185,129,0.16)]"
              : "border-rose-100 bg-white shadow-[0_16px_48px_rgba(244,63,94,0.16)]"
          }`}
        >
          {toast.type === "success" ? (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" strokeWidth={2.5} />
            </div>
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-50">
              <XCircle className="h-5 w-5 text-rose-500" strokeWidth={2.5} />
            </div>
          )}
          <div className="flex-1 min-w-0 pt-0.5">
            <p
              className={`text-[10px] font-black uppercase tracking-[0.2em] ${
                toast.type === "success" ? "text-emerald-500" : "text-rose-500"
              }`}
            >
              {toast.type === "success" ? "บันทึกสำเร็จ" : "เกิดข้อผิดพลาด"}
            </p>
            <p
              className={`mt-1 text-sm font-black ${
                toast.type === "success" ? "text-emerald-800" : "text-rose-800"
              }`}
            >
              {toast.message}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setToast((t) => ({ ...t, show: false }))}
            className="text-slate-400 hover:text-slate-600 transition p-1 rounded-full hover:bg-slate-100"
          >
            <X className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>
      )}
      <main className="hidden min-w-0 lg:block">
        <MobileProductSettingsTabs />

        <div className="border-b border-slate-200 bg-slate-50/60 px-8 py-6">
          <PreviewPanel categories={previewCategories} fullWidth />
        </div>

        <section className="border-b border-slate-200 px-8 py-4">
          <MobileCategoryRail
            categories={categories}
            draftColors={draftColors}
            selectedId={selectedCategory?.id ?? ""}
            onSelect={selectCategory}
          />
        </section>

        <div className="w-full min-w-0 px-8 py-8">
          <CategoryColorEditor
            selectedCategory={selectedCategory}
            selectedColor={normalizedSelectedColor}
            isDirty={isDirty}
            isPending={isLoading}
            message={message}
            onHexChange={handleHexChange}
            onPickColor={setSelectedColor}
            onReset={() => setSelectedColor(null)}
            onSave={handleSave}
          />
        </div>
      </main>

      <main className="min-h-screen bg-white pb-24 lg:hidden">
        <MobileProductSettingsTabs />

        <section className="border-b border-slate-200 bg-slate-50/60 px-4 py-2.5">
          <PreviewPanel categories={previewCategories} fullWidth />
        </section>

        <section className="space-y-4 px-4 py-3">
          <MobileCategoryRail
            categories={categories}
            draftColors={draftColors}
            selectedId={selectedCategory?.id ?? ""}
            onSelect={selectCategory}
          />

          <MobileColorControls
            selectedCategory={selectedCategory}
            selectedColor={normalizedSelectedColor}
            isDirty={isDirty}
            isPending={isLoading}
            message={message}
            onHexChange={handleHexChange}
            onPickColor={setSelectedColor}
            onReset={() => setSelectedColor(null)}
            onSave={handleSave}
          />
        </section>
      </main>
    </div>
  );
}

function MobileProductSettingsTabs() {
  const tabs = [
    { href: "/settings/products", label: "สินค้า", icon: Package2, active: false },
    { href: "/settings/products?tab=categories", label: "หมวดหมู่", icon: FolderTree, active: false },
    { href: "/settings/products?tab=brands", label: "แบรนด์", icon: Tag, active: false },
    { href: "/settings/products/category-colors", label: "สีหมวดหมู่", icon: Palette, active: true },
    { href: "/settings/products/product-colors", label: "สีสินค้า", icon: Palette, active: false },
  ];

  return (
    <div className="sticky top-0 z-30 flex border-b border-slate-200 bg-white">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition active:scale-[0.98] ${
              tab.active ? "text-[#4A148C]" : "text-slate-500"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={2.2} />
            <span className="text-[11px] font-black leading-tight">{tab.label}</span>
            <span
              className={`absolute inset-x-0 bottom-0 mx-auto h-0.5 w-full bg-[#4A148C] transition-transform duration-200 ${
                tab.active ? "scale-x-100" : "scale-x-0"
              }`}
            />
          </Link>
        );
      })}
    </div>
  );
}

function MobileCategoryRail({
  categories,
  draftColors,
  selectedId,
  onSelect,
}: {
  categories: ProductCategoryColorSetting[];
  draftColors: Record<string, string | null>;
  selectedId: string;
  onSelect: (categoryId: string) => void;
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex min-w-max items-center gap-5">
        {categories.map((category) => {
          const draftColor = draftColors[category.id] ?? category.defaultColor;
          const isSelected = category.id === selectedId;

          return (
            <button
              key={category.id}
              type="button"
              onClick={() => onSelect(category.id)}
              className={`relative inline-flex min-w-max items-center gap-2 pb-2.5 pt-1.5 text-left transition active:scale-[0.98] ${
                isSelected ? "text-[#4A148C]" : "text-slate-700"
              }`}
            >
              <span
                className="h-5 w-5 shrink-0 rounded-[4px] border border-slate-200 shadow-inner"
                style={{ backgroundColor: draftColor }}
              />
              <span className="whitespace-nowrap text-[15px] font-black leading-none">
                {category.name}
              </span>
              <span
                className={`absolute bottom-0 left-0 h-[3px] w-full rounded-full bg-[#4A148C] transition-transform ${
                  isSelected ? "scale-x-100" : "scale-x-0"
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MobileColorControls({
  selectedCategory,
  selectedColor,
  isDirty,
  isPending,
  message,
  onHexChange,
  onPickColor,
  onReset,
  onSave,
}: {
  selectedCategory: ProductCategoryColorSetting | null;
  selectedColor: string;
  isDirty: boolean;
  isPending: boolean;
  message: string;
  onHexChange: (value: string) => void;
  onPickColor: (value: string | null) => void;
  onReset: () => void;
  onSave: () => void;
}) {
  if (!selectedCategory) {
    return <p className="text-sm font-bold text-slate-500">ยังไม่มีหมวดหมู่</p>;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[minmax(0,1fr)_112px] items-end gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black text-slate-500">หมวดหมู่</p>
          <h2 className="truncate text-xl font-black text-slate-950">{selectedCategory.name}</h2>
        </div>
        <label className="grid gap-1 text-xs font-black text-slate-600">
          HEX
          <input
            value={selectedColor}
            onChange={(event) => onHexChange(event.target.value)}
            className="h-10 rounded-md border border-slate-300 px-2 text-sm font-black text-slate-900 outline-none focus:border-[#4A148C] focus:ring-2 focus:ring-[#EA80FC]/25"
            inputMode="text"
            maxLength={7}
          />
        </label>
      </div>

      <div className="-mx-4 overflow-x-auto overflow-y-visible px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-w-max items-center gap-2">
          <label
            className="relative flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-[#E1BEE7] bg-white text-[#4A148C] shadow-sm transition active:scale-[0.96]"
            aria-label="เปิดจานสี"
          >
            <Palette className="h-5 w-5" strokeWidth={2.2} />
            <input
              type="color"
              value={selectedColor}
              onChange={(event) => onPickColor(event.target.value.toUpperCase())}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
          {CATEGORY_PRINT_COLOR_PRESETS.map((color) => {
            const active = color === selectedColor;
            return (
              <button
                key={color}
                type="button"
                onClick={() => onPickColor(color)}
                className={`relative h-9 w-9 rounded-md border transition active:scale-[0.96] ${
                  active ? "border-[#4A148C] outline outline-2 outline-offset-[-3px] outline-[#4A148C]" : "border-slate-200"
                }`}
                style={{ backgroundColor: color }}
                aria-label={`เลือกสี ${color}`}
              >
                {active ? (
                  <span className="absolute inset-0 m-auto flex h-5 w-5 items-center justify-center rounded-full bg-[#4A148C] text-white">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-2">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-black text-[#4A148C] transition active:scale-[0.98]"
        >
          <RotateCcw className="h-4 w-4" strokeWidth={2.2} />
          คืนค่าเริ่มต้น
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={isPending || !isDirty}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[#4A148C] px-3 text-sm font-black text-white shadow-[0_14px_28px_rgba(74,20,140,0.24)] transition active:scale-[0.98] disabled:opacity-50"
        >
          <Save className="h-4 w-4" strokeWidth={2.3} />
          บันทึก
        </button>
      </div>

      {message ? <p className="text-sm font-bold text-[#4A148C]">{message}</p> : null}
    </div>
  );
}

function CategoryColorEditor({
  selectedCategory,
  selectedColor,
  isDirty,
  isPending,
  message,
  onHexChange,
  onPickColor,
  onReset,
  onSave,
}: {
  selectedCategory: ProductCategoryColorSetting | null;
  selectedColor: string;
  isDirty: boolean;
  isPending: boolean;
  message: string;
  onHexChange: (value: string) => void;
  onPickColor: (value: string | null) => void;
  onReset: () => void;
  onSave: () => void;
}) {
  if (!selectedCategory) {
    return <div className="text-sm font-semibold text-slate-500">ยังไม่มีหมวดหมู่</div>;
  }

  return (
    <section className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-600">หมวดหมู่</p>
          <h2 className="mt-1 text-3xl font-black text-slate-950">{selectedCategory.name}</h2>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
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
        <div className="overflow-visible py-1">
          <div className="flex w-full min-w-0 flex-wrap items-center gap-4">
          {CATEGORY_PRINT_COLOR_PRESETS.map((color) => {
            const active = color === selectedColor;
            return (
              <button
                key={color}
                type="button"
                onClick={() => onPickColor(color)}
                className={`relative h-16 w-16 shrink-0 rounded-md border transition active:scale-[0.98] ${
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
      </div>

      {message ? <p className="text-sm font-bold text-[#4A148C]">{message}</p> : null}

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
    </section>
  );
}

function PreviewPanel({
  categories,
  fullWidth = false,
}: {
  categories: Array<ProductCategoryColorSetting & { color: string }>;
  fullWidth?: boolean;
}) {
  return (
    <section className={fullWidth ? "space-y-1.5" : "space-y-2 border-t border-slate-200 pt-4"}>
      <h3 className="text-sm font-black text-slate-900">Preview</h3>
      <div
        className={`overflow-hidden rounded-md border border-slate-300 bg-white ${
          fullWidth ? "-mx-2 lg:mx-0" : ""
        }`}
      >
        <table className="w-full table-fixed border-collapse text-center text-[6.2px] font-black leading-none lg:text-[13px]">
          <thead>
            <tr>
              {categories.map((category) => {
                const palette = buildCategoryPrintPalette(category.color);
                return (
                  <th
                    key={category.id}
                    colSpan={2}
                    className="h-12 border border-slate-300 px-0 py-0 text-slate-950 lg:h-16 lg:px-0.5"
                    style={{ backgroundColor: palette.header }}
                  >
                    <span className="inline-block origin-center scale-[0.56] whitespace-nowrap text-[10px] leading-none tracking-normal lg:scale-100 lg:text-[13px]">
                      {category.name}
                    </span>
                  </th>
                );
              })}
            </tr>
            <tr>
              {categories.map((category) => (
                <th
                  key={`${category.id}-label`}
                  colSpan={2}
                  className="h-8 border border-slate-300 bg-white px-0 py-0 leading-none text-slate-500 lg:h-10 lg:px-0.5 lg:text-[13px]"
                >
                  <span className="inline-block origin-center scale-[0.56] whitespace-nowrap text-[10px] leading-none tracking-normal lg:scale-100 lg:text-[13px]">
                    รายการ
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3].map((rowIndex) => (
              <tr key={`preview-row-${rowIndex}`}>
                {categories.map((category) => {
                  const palette = buildCategoryPrintPalette(category.color);
                  return (
                    <td
                      key={`${rowIndex}-${category.id}`}
                      colSpan={2}
                      className="h-9 border border-slate-200 px-0.5 py-0 text-center align-middle text-slate-500 lg:h-12"
                      style={{ backgroundColor: rowIndex % 2 === 1 ? palette.rowA : palette.rowB }}
                    >
                      1
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
