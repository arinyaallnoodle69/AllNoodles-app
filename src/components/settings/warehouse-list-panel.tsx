"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Box, Boxes, CheckCircle2, ChevronRight, Download, Info, ListFilter, Loader2, MapPin, Package2, PencilLine, Power, PowerOff, Save, Search, Store, Trash2, Upload, Warehouse, X } from "lucide-react";
import { importWarehouseProductModesAction, toggleWarehouseAction, deleteWarehouseAction, updateWarehouseProductFulfillmentModesAction } from "@/app/settings/warehouses/actions";
import type { WarehouseProductModeImportState } from "@/app/settings/warehouses/actions";
import type { WarehouseFormItem } from "@/components/settings/warehouse-form";
import { Button } from "@/components/ui/button";

type WarehouseWithCustomerCount = WarehouseFormItem & {
  customerCount: number;
  customers: Array<{ id: string; name: string; code: string }>;
};

type WarehouseProductMode = "disabled" | "fresh" | "stock";

type WarehouseProductModeItem = {
  brand: string;
  categoryNames: string[];
  id: string;
  modeByWarehouseId: Record<string, WarehouseProductMode>;
  name: string;
  supplierIdByWarehouseId: Record<string, string | null>;
  sku: string;
  imageUrl: string | null;
};

type WarehouseSupplierOption = {
  code: string;
  id: string;
  name: string;
};

type WarehouseListPanelProps = {
  products: WarehouseProductModeItem[];
  suppliers: WarehouseSupplierOption[];
  warehouses: WarehouseWithCustomerCount[];
};

const initialImportState: WarehouseProductModeImportState = {
  message: "",
  status: "idle",
};

function WarehouseProductModeImportModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [state, formAction, isPending] = useActionState(importWarehouseProductModesAction, initialImportState);

  useEffect(() => {
    if (state.status !== "success") return;

    router.refresh();

    const timer = window.setTimeout(() => {
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      onClose();
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [onClose, router, state.status]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/45 p-3 sm:p-4">
      <div className="flex max-h-[94dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#4A148C]">นำเข้าโหมดสินค้าในคลัง</p>
            <h3 className="mt-1 text-xl font-black text-[#1a1a1a]">อัปเดตจากไฟล์ Excel</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
            disabled={isPending}
          >
            <X className="h-5 w-5" strokeWidth={2.3} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div className="rounded-xl border border-[#EA80FC]/40 bg-[#FDF4FF] p-4">
            <p className="text-sm font-black text-[#1a1a1a]">รูปแบบไฟล์</p>
            <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">
              ใช้คอลัมน์ SKU, โหมดของแต่ละคลัง และโรงงานของแต่ละคลัง หากตั้งเป็นผลิตสดต้องระบุโรงงาน
            </p>
            <a
              href="/settings/warehouses/template"
              className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#EA80FC] bg-white px-4 text-xs font-black text-[#4A148C] shadow-sm transition hover:bg-slate-50 active:scale-[0.98]"
            >
              <Download className="h-4 w-4" strokeWidth={2.4} />
              ดาวน์โหลดเทมเพลต Excel
            </a>
          </div>

          <form action={formAction} className="space-y-4">
            <button
              type="button"
              onClick={() => !isPending && fileInputRef.current?.click()}
              className={`flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed p-7 text-center transition ${
                file ? "border-emerald-300 bg-emerald-50/20" : "border-slate-300 bg-white hover:border-[#EA80FC]"
              } ${isPending ? "pointer-events-none opacity-60" : ""}`}
            >
              <input
                ref={fileInputRef}
                type="file"
                name="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
              <Upload className="h-8 w-8 text-[#4A148C]" strokeWidth={2.3} />
              <span className="mt-3 text-sm font-black text-[#1a1a1a]">
                {file ? file.name : "เลือกไฟล์ Excel เพื่อนำเข้า"}
              </span>
              <span className="mt-1 text-xs font-semibold text-slate-500">
                รองรับไฟล์ .xlsx และ .xls
              </span>
            </button>

            {state.status === "success" ? (
              <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                {state.message}
              </div>
            ) : null}

            {state.status === "error" ? (
              <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{state.message}</span>
                </div>
                {state.errors?.length ? (
                  <div className="max-h-32 overflow-y-auto border-t border-red-200/70 pt-2 text-xs font-semibold">
                    {state.errors.map((error, index) => (
                      <p key={`${error}-${index}`}>• {error}</p>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={isPending || !file}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#4A148C] px-6 text-sm font-black text-white shadow-[0_12px_26px_rgba(74,20,140,0.2)] transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                นำเข้า
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function ToggleButton({
  isActive,
  warehouseId,
}: {
  isActive: boolean;
  warehouseId: string;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleToggle() {
    setIsPending(true);
    await toggleWarehouseAction(warehouseId, !isActive);
    router.refresh();
    setIsPending(false);
  }

  return (
    <Button
      type="button"
      onClick={handleToggle}
      disabled={isPending}
      variant="outline"
      size="sm"
      className={`rounded-md h-9 px-3.5 font-bold text-xs tracking-[0.5px] uppercase border transition-all duration-200 ${
        isActive
          ? "border-amber-200 bg-amber-50/50 text-amber-700 hover:bg-amber-100/50"
          : "border-emerald-200 bg-emerald-50/50 text-emerald-700 hover:bg-emerald-100/50"
      }`}
    >
      {isActive ? (
        <>
          <PowerOff className="size-3.5 mr-1.5" strokeWidth={2.4} />
          ปิดใช้งาน
        </>
      ) : (
        <>
          <Power className="size-3.5 mr-1.5" strokeWidth={2.4} />
          เปิดใช้งาน
        </>
      )}
    </Button>
  );
}

function DeleteButton({
  warehouseId,
  name,
  isMain,
}: {
  warehouseId: string;
  name: string;
  isMain: boolean;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  if (isMain) {
    return null;
  }

  async function handleDelete() {
    if (!window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบคลัง "${name}"?`)) {
      return;
    }
    setIsPending(true);
    const result = await deleteWarehouseAction(warehouseId);
    if (result && result.error) {
      alert(result.error);
    } else {
      router.refresh();
    }
    setIsPending(false);
  }

  return (
    <Button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      variant="outline"
      size="sm"
      className="rounded-md h-9 px-3.5 font-bold text-xs tracking-[0.5px] uppercase border border-red-200 bg-red-50/50 text-red-600 hover:bg-red-100/50 transition-all duration-200"
    >
      <Trash2 className="size-3.5 mr-1.5" strokeWidth={2.4} />
      ลบ
    </Button>
  );
}

function ProductModeEditModal({
  isOpen,
  onClose,
  product,
  initialMode,
  initialSupplierId,
  suppliers,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  product: WarehouseProductModeItem;
  initialMode: WarehouseProductMode;
  initialSupplierId: string;
  suppliers: WarehouseSupplierOption[];
  onSave: (productId: string, mode: WarehouseProductMode, supplierId: string) => void;
}) {
  const [tempMode, setTempMode] = useState<WarehouseProductMode>(initialMode);
  const [tempSupplierId, setTempSupplierId] = useState<string>(initialSupplierId);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/45 p-3 sm:p-4">
      {/* Backdrop click closes modal */}
      <div className="absolute inset-0" onClick={onClose} />
      
      <div className="relative flex max-h-[94dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            {/* Product Image */}
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-50">
              {product.imageUrl ? (
                <Image
                  src={product.imageUrl}
                  alt={product.name}
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400">
                  <Package2 className="h-5 w-5" strokeWidth={2} />
                </div>
              )}
            </div>

            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[#4A148C]">
                ตั้งค่าการจัดการสินค้า
              </p>
              <h3 className="mt-0.5 text-base font-black text-black leading-tight">
                {product.name}
              </h3>
              <p className="mt-0.5 text-xs font-bold text-slate-500">
                SKU: <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px]">{product.sku}</code>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
          >
            <X className="h-4.5 w-4.5" strokeWidth={2.3} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Mode Selection */}
          <div className="space-y-2.5">
            <label className="text-sm font-black text-black block">
              เลือกวิธีการจัดการสินค้าในคลังนี้
            </label>
            <div className="grid gap-2">
              {/* Option: Use Stock */}
              <button
                type="button"
                onClick={() => setTempMode("stock")}
                className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all ${
                  tempMode === "stock"
                    ? "border-emerald-500 bg-emerald-50/40 ring-1 ring-emerald-500 shadow-sm"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    tempMode === "stock"
                      ? "border-emerald-500 bg-emerald-500"
                      : "border-slate-300 bg-white"
                  }`}
                >
                  {tempMode === "stock" && (
                    <div className="h-1.5 w-1.5 rounded-full bg-white" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-emerald-950">ใช้สต็อก (Stock)</p>
                  <p className="mt-0.5 text-xs font-bold leading-relaxed text-slate-900">
                    ดึงสินค้าจากยอดสต็อกคงเหลือในคลังนี้
                  </p>
                </div>
              </button>

              {/* Option: Produce Fresh */}
              <button
                type="button"
                onClick={() => setTempMode("fresh")}
                className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all ${
                  tempMode === "fresh"
                    ? "border-[#4A148C] bg-[#FDF4FF]/60 ring-1 ring-[#4A148C] shadow-sm"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    tempMode === "fresh"
                      ? "border-[#4A148C] bg-[#4A148C]"
                      : "border-slate-300 bg-white"
                  }`}
                >
                  {tempMode === "fresh" && (
                    <div className="h-1.5 w-1.5 rounded-full bg-white" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-[#4A148C]">ผลิตสด (Fresh)</p>
                  <p className="mt-0.5 text-xs font-bold leading-relaxed text-slate-900">
                    ผลิตใหม่ตามออเดอร์และระบุโรงงานผู้ผลิต
                  </p>
                </div>
              </button>

              {/* Option: Disabled */}
              <button
                type="button"
                onClick={() => setTempMode("disabled")}
                className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all ${
                  tempMode === "disabled"
                    ? "border-slate-700 bg-slate-50 ring-1 ring-slate-700 shadow-sm"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    tempMode === "disabled"
                      ? "border-slate-700 bg-slate-700"
                      : "border-slate-300 bg-white"
                  }`}
                >
                  {tempMode === "disabled" && (
                    <div className="h-1.5 w-1.5 rounded-full bg-white" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-950">ไม่ใช้สินค้าในคลังนี้ (Disabled)</p>
                  <p className="mt-0.5 text-xs font-bold leading-relaxed text-slate-900">
                    ปิดไม่ให้สั่งซื้อสินค้าชนิดนี้ในคลังนี้
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Supplier/Factory Selection */}
          {tempMode === "fresh" && (
            <div className="space-y-2.5">
              <label className="text-sm font-black text-black block">
                ระบุโรงงานผู้ผลิตสด
              </label>
              <select
                value={tempSupplierId}
                onChange={(event) => setTempSupplierId(event.target.value)}
                className="h-11 w-full rounded-xl border border-[#D7DEE8] bg-white px-3 text-sm font-black text-black outline-none transition focus:border-[#4A148C] focus:ring-2 focus:ring-[#4A148C]/15"
              >
                <option value="">เลือกโรงงานผลิตสด</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
              {tempSupplierId === "" && (
                <p className="text-[11px] font-black text-amber-700 flex items-center gap-1">
                  <Info className="h-3 w-3 shrink-0" />
                  กรุณาเลือกโรงงานเพื่อไม่ให้ระบบทำงานผิดพลาด
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/50 p-4">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={() => {
              onSave(product.id, tempMode, tempMode === "fresh" ? tempSupplierId : "");
              onClose();
            }}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#4A148C] px-6 text-sm font-black text-white shadow-[0_12px_26px_rgba(74,20,140,0.2)] transition active:scale-[0.98]"
          >
            ยืนยัน
          </button>
        </div>
      </div>
    </div>
  );
}

function WarehouseProductModeManagerModal({
  isOpen,
  onClose,
  products,
  suppliers,
  warehouseId,
  warehouseName,
}: {
  isOpen: boolean;
  onClose: () => void;
  products: WarehouseProductModeItem[];
  suppliers: WarehouseSupplierOption[];
  warehouseId: string;
  warehouseName: string;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedBrand, setSelectedBrand] = useState("all");
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [modeFilter, setModeFilter] = useState<WarehouseProductMode | "all">("all");
  const [editingProduct, setEditingProduct] = useState<WarehouseProductModeItem | null>(null);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [mobileFilterDrawer, setMobileFilterDrawer] = useState<"brand" | "category" | null>(null);
  const [isMobileFilterDrawerClosing, setIsMobileFilterDrawerClosing] = useState(false);
  const mobileFilterDrawerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openMobileFilterDrawer = (type: "brand" | "category") => {
    if (mobileFilterDrawerTimerRef.current) {
      clearTimeout(mobileFilterDrawerTimerRef.current);
      mobileFilterDrawerTimerRef.current = null;
    }
    setIsMobileFilterDrawerClosing(false);
    setMobileFilterDrawer(type);
  };

  const closeMobileFilterDrawer = () => {
    if (!mobileFilterDrawer || isMobileFilterDrawerClosing) return;
    setIsMobileFilterDrawerClosing(true);
    mobileFilterDrawerTimerRef.current = setTimeout(() => {
      setMobileFilterDrawer(null);
      setIsMobileFilterDrawerClosing(false);
      mobileFilterDrawerTimerRef.current = null;
    }, 250);
  };

  useEffect(() => {
    return () => {
      if (mobileFilterDrawerTimerRef.current) {
        clearTimeout(mobileFilterDrawerTimerRef.current);
      }
    };
  }, []);
  
  const [modes, setModes] = useState<Record<string, WarehouseProductMode>>(() =>
    Object.fromEntries(products.map((product) => [product.id, product.modeByWarehouseId[warehouseId] ?? "stock"])),
  );
  const [supplierIds, setSupplierIds] = useState<Record<string, string>>(() =>
    Object.fromEntries(products.map((product) => [product.id, product.supplierIdByWarehouseId[warehouseId] ?? ""])),
  );

  const categories = useMemo(() => {
    return Array.from(new Set(products.flatMap((product) => product.categoryNames).filter(Boolean))).sort((a, b) => a.localeCompare(b, "th"));
  }, [products]);

  const brandsByCategory = useMemo(() => {
    const result = new Map<string, string[]>();
    for (const cat of categories) {
      const brands = new Set<string>();
      for (const product of products) {
        if (!product.categoryNames.includes(cat)) continue;
        const brand = product.brand?.trim();
        if (brand) brands.add(brand);
      }
      result.set(
        cat,
        [...brands].sort((left, right) => left.localeCompare(right, "th")),
      );
    }
    return result;
  }, [categories, products]);

  const brandOptions = useMemo(() => {
    if (selectedCategory === "all") {
      return Array.from(new Set(products.map((p) => p.brand).filter(Boolean))).sort((a, b) => a.localeCompare(b, "th"));
    }
    return brandsByCategory.get(selectedCategory) ?? [];
  }, [brandsByCategory, products, selectedCategory]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase("th");

    return products.filter((product) => {
      const mode = modes[product.id] ?? "stock";
      const matchesCategory = selectedCategory === "all" || product.categoryNames.includes(selectedCategory);
      if (!matchesCategory) return false;

      const matchesBrand = selectedBrand === "all" || product.brand === selectedBrand;
      if (!matchesBrand) return false;

      const matchesMode = modeFilter === "all" || mode === modeFilter;
      if (!matchesMode) return false;

      if (normalizedSearch) {
        const searchable = [
          product.name,
          product.sku,
          product.brand,
          product.categoryNames.join(" "),
        ].join(" ").toLocaleLowerCase("th");
        if (!searchable.includes(normalizedSearch)) return false;
      }

      return true;
    });
  }, [selectedCategory, selectedBrand, modeFilter, searchTerm, modes, products]);

  const totals = useMemo(() => {
    return products.reduce(
      (acc, product) => {
        const mode = modes[product.id] ?? "stock";
        acc[mode] += 1;
        return acc;
      },
      { disabled: 0, fresh: 0, stock: 0 } satisfies Record<WarehouseProductMode, number>,
    );
  }, [modes, products]);

  function handleSaveProductMode(productId: string, mode: WarehouseProductMode, supplierId: string) {
    setModes((current) => ({ ...current, [productId]: mode }));
    setSupplierIds((current) => ({ ...current, [productId]: supplierId }));
  }

  function handleCategorySelect(catName: string) {
    setSelectedCategory(catName);
    setSelectedBrand("all");
    setExpandedCategory((current) => (current === catName ? null : catName));
  }

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!isOpen) return null;
  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-4 animate-in fade-in duration-205">
      <div className="absolute inset-0" onClick={onClose} />
      
      <form
        action={updateWarehouseProductFulfillmentModesAction.bind(null, warehouseId)}
        className="relative flex h-[100dvh] w-full max-w-[100vw] min-w-0 flex-col overflow-hidden rounded-none bg-white shadow-2xl sm:h-[86dvh] sm:max-w-6xl sm:rounded-[2rem] animate-in slide-in-from-bottom-6 duration-300"
      >
        <div className="hidden">
          {products.map((product) => (
            <div key={product.id}>
              <input type="hidden" name="productId" value={product.id} />
              <input type="hidden" name="mode" value={modes[product.id] ?? "stock"} />
              <input type="hidden" name="supplierId" value={(modes[product.id] ?? "stock") === "fresh" ? (supplierIds[product.id] ?? "") : ""} />
            </div>
          ))}
        </div>

        {/* Modal Header */}
        <div className="flex shrink-0 flex-col border-b border-slate-200 bg-white px-4 py-2.5 sm:px-6">
          <div className="flex items-center justify-between gap-3 h-12">
            {!isMobileSearchOpen ? (
              <>
                <div className="min-w-0">
                  <span className="text-[10px] sm:text-xs font-black uppercase tracking-[0.14em] text-[#4A148C] block mb-0.5">
                    ตั้งค่าวิธีการจัดส่งสินค้าตามคลัง
                  </span>
                  <h3 className="text-sm sm:text-base font-black text-black truncate leading-tight">
                    คลัง: {warehouseName}
                  </h3>
                </div>
                
                <div className="flex items-center gap-1.5 ml-auto">
                  {/* Mobile Search Icon */}
                  <button
                    type="button"
                    onClick={() => setIsMobileSearchOpen(true)}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-[#4A148C] transition active:scale-95 lg:hidden"
                    aria-label="ค้นหา"
                  >
                    <Search className="h-5 w-5" strokeWidth={2.4} />
                  </button>

                  {/* Desktop Save Button */}
                  <button
                    type="submit"
                    className="hidden lg:inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#4A148C] px-5 text-sm font-black text-white shadow-[0_8px_20px_rgba(74,20,140,0.2)] transition hover:bg-[#3B0F70] active:scale-95 whitespace-nowrap"
                  >
                    <Save className="h-4 w-4" strokeWidth={2.4} />
                    บันทึกทั้งหมด
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 active:scale-95"
                  >
                    <X className="h-5 w-5" strokeWidth={2.2} />
                  </button>
                </div>
              </>
            ) : (
              /* Mobile Search Input (Full Width Overlay with Slide-in Animation) */
              <div className="flex items-center gap-2 w-full animate-in slide-in-from-right-4 duration-200">
                <div className="flex flex-1 items-center gap-2.5 rounded-xl border border-[#EA80FC]/35 bg-[#F3E5F5]/20 px-3 py-2">
                  <Search className="h-4.5 w-4.5 shrink-0 text-[#4A148C]" strokeWidth={2.4} />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="ค้นหาชื่อสินค้า SKU..."
                    autoFocus
                    className="min-w-0 flex-1 bg-transparent text-sm font-bold text-black outline-none placeholder:text-[#4A148C]/40"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm("")}
                      className="text-[#4A148C]/70 transition hover:text-[#4A148C]"
                      aria-label="ล้างคำค้นหา"
                    >
                      <X className="h-4 w-4" strokeWidth={2.5} />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileSearchOpen(false);
                    setSearchTerm("");
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition"
                >
                  ปิด
                </button>
              </div>
            )}
          </div>

          {/* Desktop Search, Stats, and Filters Bar */}
          <div className="hidden lg:flex flex-row items-center justify-between gap-3 mt-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={2.5} />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ค้นหาชื่อสินค้า SKU หมวดหมู่..."
                className="h-10 w-full rounded-xl border border-slate-200 pl-10 pr-3.5 text-sm font-bold text-slate-900 outline-none transition focus:border-[#4A148C] focus:ring-2 focus:ring-[#4A148C]/15"
              />
            </div>

            {/* Quick Stats & Reset Filter */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setModeFilter((c) => (c === "stock" ? "all" : "stock"))}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-black transition ${
                  modeFilter === "stock" ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                ใช้สต็อก ({totals.stock})
              </button>
              <button
                type="button"
                onClick={() => setModeFilter((c) => (c === "fresh" ? "all" : "fresh"))}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-black transition ${
                  modeFilter === "fresh" ? "border-[#4A148C] bg-[#FDF4FF] text-[#4A148C]" : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                ผลิตสด ({totals.fresh})
              </button>
              <button
                type="button"
                onClick={() => setModeFilter((c) => (c === "disabled" ? "all" : "disabled"))}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-black transition ${
                  modeFilter === "disabled" ? "border-slate-700 bg-slate-100 text-slate-800" : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                ไม่ใช้ ({totals.disabled})
              </button>
              
              {(selectedCategory !== "all" || selectedBrand !== "all" || modeFilter !== "all" || searchTerm !== "") && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory("all");
                    setSelectedBrand("all");
                    setModeFilter("all");
                    setSearchTerm("");
                    setExpandedCategory(null);
                  }}
                  className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  ล้างตัวกรอง
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Filters Area (Below Header on Mobile) */}
        <div className="flex flex-col bg-white border-b border-slate-150 lg:hidden shrink-0">
          {/* Row 1: Categories scroll + filter button */}
          <div className="flex items-center gap-5 px-4 sm:px-8 border-b border-slate-100 bg-white">
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
                onClick={() => {
                  setSelectedCategory("all");
                  setSelectedBrand("all");
                }}
                className={`relative h-12 shrink-0 px-1 text-sm font-black whitespace-nowrap transition-colors flex items-center ${
                  selectedCategory === "all" ? "text-[#4A148C]" : "text-slate-550 hover:text-black"
                }`}
              >
                ทุกหมวดหมู่
                {selectedCategory === "all" ? (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#4A148C]" />
                ) : null}
              </button>
              {categories.map((cat) => {
                const catProductCount = products.filter((p) => p.categoryNames.includes(cat)).length;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(cat);
                      setSelectedBrand("all");
                    }}
                    className={`relative h-12 shrink-0 px-1 text-sm font-black whitespace-nowrap transition-colors flex items-center ${
                      selectedCategory === cat ? "text-[#4A148C]" : "text-slate-550 hover:text-black"
                    }`}
                  >
                    {cat} ({catProductCount})
                    {selectedCategory === cat ? (
                      <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#4A148C]" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Row 2: Brands scroll + filter button */}
          <div className="flex items-center gap-5 border-t border-[#EA80FC]/15 bg-slate-50/30 px-4 sm:px-8 border-b border-slate-100/50">
            <button
              type="button"
              onClick={() => openMobileFilterDrawer("brand")}
              className="flex h-12 shrink-0 items-center gap-1.5 text-sm font-black text-[#4A148C]"
              aria-label="เปิดรายการแบรนด์ทั้งหมด"
            >
              แบรนด์
              <ListFilter className="h-4 w-4" strokeWidth={2.5} />
            </button>
            <div className="flex min-w-0 flex-1 items-center gap-6 overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => setSelectedBrand("all")}
                className={`relative flex h-12 shrink-0 items-center whitespace-nowrap px-1 text-sm font-black transition-colors ${
                  selectedBrand === "all" ? "text-[#4A148C]" : "text-slate-550 hover:text-black"
                }`}
              >
                ทั้งหมด
                {selectedBrand === "all" ? (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#4A148C]" />
                ) : null}
              </button>
              {brandOptions.map((brand) => (
                <button
                  key={brand}
                  type="button"
                  onClick={() => setSelectedBrand(brand)}
                  className={`relative flex h-12 shrink-0 items-center whitespace-nowrap px-1 text-sm font-black transition-colors ${
                    selectedBrand === brand ? "text-[#4A148C]" : "text-slate-550 hover:text-black"
                  }`}
                >
                  {brand}
                  {selectedBrand === brand ? (
                    <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#4A148C]" />
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          {/* Row 3: Quick Stats Filters */}
          <div className="flex gap-2 overflow-x-auto px-4 py-2 no-scrollbar bg-white">
            <button
              type="button"
              onClick={() => setModeFilter((c) => (c === "stock" ? "all" : "stock"))}
              className={`shrink-0 inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[10px] font-black transition ${
                modeFilter === "stock" ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              ใช้สต็อก ({totals.stock})
            </button>
            <button
              type="button"
              onClick={() => setModeFilter((c) => (c === "fresh" ? "all" : "fresh"))}
              className={`shrink-0 inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[10px] font-black transition ${
                modeFilter === "fresh" ? "border-[#4A148C] bg-[#FDF4FF] text-[#4A148C]" : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              ผลิตสด ({totals.fresh})
            </button>
            <button
              type="button"
              onClick={() => setModeFilter((c) => (c === "disabled" ? "all" : "disabled"))}
              className={`shrink-0 inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[10px] font-black transition ${
                modeFilter === "disabled" ? "border-slate-700 bg-slate-100 text-slate-800" : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              ไม่ใช้ ({totals.disabled})
            </button>
            {(selectedCategory !== "all" || selectedBrand !== "all" || modeFilter !== "all" || searchTerm !== "") && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory("all");
                  setSelectedBrand("all");
                  setModeFilter("all");
                  setSearchTerm("");
                  setExpandedCategory(null);
                }}
                className="shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-black text-slate-600 transition"
              >
                ล้าง
              </button>
            )}
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 min-h-0 flex bg-white">
          {/* Desktop Left Sidebar Category Navigation */}
          <aside className="hidden lg:block w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-[#FBF8FF] p-3">
            <nav className="space-y-1.5">
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory("all");
                  setSelectedBrand("all");
                  setExpandedCategory(null);
                }}
                className={`flex h-11 w-full items-center justify-between rounded-xl px-3 text-left text-sm font-black transition ${
                  selectedCategory === "all"
                    ? "bg-[#4A148C] text-white"
                    : "text-black hover:bg-[#F3E5F5]/60"
                }`}
              >
                <span>หมวดหมู่ทั้งหมด</span>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full font-mono">
                  {products.length}
                </span>
              </button>

              {categories.map((cat) => {
                const isSelected = selectedCategory === cat;
                const isExpanded = expandedCategory === cat;
                const catBrands = brandsByCategory.get(cat) ?? [];
                const catProductCount = products.filter((p) => p.categoryNames.includes(cat)).length;

                return (
                  <div key={cat} className="space-y-1">
                    <button
                      type="button"
                      onClick={() => handleCategorySelect(cat)}
                      className={`flex h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-black transition ${
                        isSelected ? "bg-[#F3E5F5] text-[#4A148C]" : "text-black hover:bg-[#F3E5F5]/60"
                      }`}
                    >
                      <ChevronRight
                        className={`h-4.5 w-4.5 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""} ${isSelected ? "text-[#4A148C]" : "text-slate-400"}`}
                        strokeWidth={2.4}
                      />
                      <span className="flex-1 truncate">{cat}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${
                        isSelected ? "bg-[#4A148C]/10 text-[#4A148C]" : "bg-slate-100 text-slate-500"
                      }`}>
                        {catProductCount}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="pl-6 space-y-1 bg-white/40 border-l border-[#EA80FC]/20 ml-5 py-1 rounded-r-lg">
                        <button
                          type="button"
                          onClick={() => setSelectedBrand("all")}
                          className={`flex h-8 w-full items-center px-3 text-left text-xs font-black rounded-lg transition ${
                            selectedBrand === "all" ? "bg-[#4A148C]/5 text-[#4A148C]" : "text-slate-700 hover:text-black"
                          }`}
                        >
                          ทุกแบรนด์
                        </button>
                        {catBrands.map((brand) => (
                          <button
                            key={brand}
                            type="button"
                            onClick={() => setSelectedBrand(brand)}
                            className={`flex h-8 w-full items-center px-3 text-left text-xs font-black rounded-lg transition ${
                              selectedBrand === brand ? "bg-[#4A148C]/5 text-[#4A148C]" : "text-slate-700 hover:text-[#4A148C]"
                            }`}
                          >
                            {brand}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </aside>

          {/* Right Product List Area */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-16 text-center text-slate-500 font-bold">
                <Package2 className="h-12 w-12 text-slate-300 mb-2" strokeWidth={1.5} />
                ไม่พบสินค้าในหมวดหมู่หรือตัวกรองที่เลือก
              </div>
            ) : (
              <>
                {/* Desktop Product Table */}
                <div className="hidden lg:block">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
                      <tr className="text-xs font-black text-slate-500 uppercase tracking-wider">
                        <th className="p-4">สินค้า</th>
                        <th className="p-4 w-[240px]">วิธีจัดการสินค้า</th>
                        <th className="p-4 w-[220px]">โรงงานผลิตสด</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150 bg-white">
                      {filteredProducts.map((product) => {
                        const mode = modes[product.id] ?? "stock";
                        const supplierId = supplierIds[product.id] ?? "";
                        const originalMode = product.modeByWarehouseId[warehouseId] ?? "stock";
                        const originalSupplierId = product.supplierIdByWarehouseId[warehouseId] ?? "";
                        const isUnsaved = mode !== originalMode || (mode === "fresh" && supplierId !== originalSupplierId);

                        return (
                          <tr key={product.id} className="hover:bg-slate-50/50 transition">
                            <td className="p-4">
                              <div className="flex items-center gap-3">
                                {/* Product Image */}
                                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-50">
                                  {product.imageUrl ? (
                                    <Image
                                      src={product.imageUrl}
                                      alt={product.name}
                                      fill
                                      sizes="48px"
                                      className="object-cover"
                                    />
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400">
                                      <Package2 className="h-5 w-5" strokeWidth={2} />
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-base font-black text-black tracking-tight leading-tight">
                                      {product.name}
                                    </span>
                                    <code className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">
                                      {product.sku}
                                    </code>
                                    {isUnsaved && (
                                      <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-black text-amber-800 animate-pulse">
                                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                        ยังไม่บันทึก
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-1 text-xs font-semibold text-slate-500">
                                    {[product.categoryNames[0] || "ไม่ระบุหมวดหมู่", product.brand || "ไม่ระบุแบรนด์"].join(" / ")}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="p-4">
                              <div className="grid grid-cols-3 gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleSaveProductMode(product.id, "stock", "")}
                                  className={`h-8 rounded-lg text-[10px] font-black border transition ${
                                    mode === "stock"
                                      ? "border-emerald-500 bg-emerald-500 text-white shadow-sm"
                                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                  }`}
                                >
                                  ใช้สต็อก
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSaveProductMode(product.id, "fresh", supplierId)}
                                  className={`h-8 rounded-lg text-[10px] font-black border transition ${
                                    mode === "fresh"
                                      ? "border-[#4A148C] bg-[#4A148C] text-white shadow-sm"
                                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                  }`}
                                >
                                  ผลิตสด
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSaveProductMode(product.id, "disabled", "")}
                                  className={`h-8 rounded-lg text-[10px] font-black border transition ${
                                    mode === "disabled"
                                      ? "border-slate-700 bg-slate-800 text-white shadow-sm"
                                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                  }`}
                                >
                                  ไม่ใช้
                                </button>
                              </div>
                            </td>
                            <td className="p-4">
                              <select
                                value={supplierId}
                                onChange={(event) => handleSaveProductMode(product.id, mode, event.target.value)}
                                disabled={mode !== "fresh"}
                                className={`h-9 w-full rounded-lg border px-2 text-xs font-bold outline-none transition ${
                                  mode === "fresh"
                                    ? !supplierId
                                      ? "border-red-300 bg-red-50/30 text-red-700 focus:border-red-500 focus:ring-2 focus:ring-red-500/15 animate-pulse"
                                      : "border-[#D7DEE8] bg-white text-[#4A148C] focus:border-[#4A148C] focus:ring-2 focus:ring-[#4A148C]/15"
                                    : "border-slate-100 bg-slate-50 text-slate-400"
                                }`}
                              >
                                <option value="">เลือกโรงงาน</option>
                                {suppliers.map((supplier) => (
                                  <option key={supplier.id} value={supplier.id}>
                                    {supplier.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Product Card Grid (Lineman design matching create-order add product picker) */}
                <div className="grid grid-cols-2 gap-3 p-4 lg:hidden max-h-[calc(100vh-295px)] overflow-y-auto w-full">
                  {filteredProducts.map((product) => {
                    const mode = modes[product.id] ?? "stock";
                    const supplierId = supplierIds[product.id] ?? "";
                    const supplierName = suppliers.find((s) => s.id === supplierId)?.name || "ไม่ได้เลือก";
                    const originalMode = product.modeByWarehouseId[warehouseId] ?? "stock";
                    const originalSupplierId = product.supplierIdByWarehouseId[warehouseId] ?? "";
                    const isUnsaved = mode !== originalMode || (mode === "fresh" && supplierId !== originalSupplierId);

                    return (
                      <div
                        key={product.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setEditingProduct(product)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setEditingProduct(product);
                          }
                        }}
                        className={`relative min-w-0 overflow-hidden rounded-[1.4rem] border transition-all cursor-pointer p-3.5 shadow-sm active:scale-[0.98] flex flex-col items-center text-center gap-2 outline-none ${
                          isUnsaved
                            ? "border-amber-400 bg-amber-50/20"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        {/* Unsaved indicator badge */}
                        {isUnsaved && (
                          <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[8.5px] font-black text-amber-800 animate-pulse">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            ยังไม่บันทึก
                          </span>
                        )}

                        {/* Product Image (Centered) */}
                        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-50 mt-1">
                          {product.imageUrl ? (
                            <Image
                              src={product.imageUrl}
                              alt={product.name}
                              fill
                              sizes="64px"
                              className="object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400">
                              <Package2 className="h-6 w-6" strokeWidth={2} />
                            </div>
                          )}
                        </div>

                        {/* Text Details */}
                        <div className="w-full min-w-0 space-y-1">
                          <p className="text-[10px] font-black uppercase tracking-tight text-slate-400">
                            {product.sku}
                          </p>
                          <h4 className="break-words text-[13px] font-black leading-tight text-black line-clamp-2">
                            {product.name}
                          </h4>
                          <p className="text-[10px] font-bold text-slate-500 truncate">
                            {[product.categoryNames[0] || "ไม่ระบุหมวดหมู่", product.brand || "ไม่ระบุแบรนด์"].join(" / ")}
                          </p>
                        </div>

                        {/* Status Badge (Centered) */}
                        <div className="w-full mt-1.5">
                          {mode === "stock" && (
                            <span className="inline-flex w-full items-center justify-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-800 shadow-sm">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              ใช้สต็อก
                            </span>
                          )}
                          {mode === "fresh" && (
                            <span
                              className={`inline-flex w-full items-center justify-center gap-1 rounded-xl border px-2 py-1 text-[10px] font-black shadow-sm transition ${
                                supplierId
                                  ? "border-[#E1BEE7] bg-[#FDF4FF] text-[#4A148C]"
                                  : "border-red-200 bg-red-50 text-red-700 animate-pulse"
                              }`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${supplierId ? "bg-[#4A148C]" : "bg-red-500"}`} />
                              ผลิตสด: {supplierId ? supplierName : "เลือกโรงงาน"}
                            </span>
                          )}
                          {mode === "disabled" && (
                            <span className="inline-flex w-full items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">
                              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                              ไม่ใช้สินค้า
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Mobile Modal Footer (Lineman design matching create-order add product picker) */}
        <div className="shrink-0 border-t border-slate-200 bg-white px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 sm:px-5 lg:hidden">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-slate-200 bg-white py-3.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 active:scale-[0.98]"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="rounded-2xl bg-[#4A148C] py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#3B0F70] active:scale-[0.98]"
            >
              บันทึกทั้งหมด
            </button>
          </div>
        </div>
      </form>

      {/* Editing product mode modal on Mobile */}
      {editingProduct && (
        <ProductModeEditModal
          key={editingProduct.id}
          isOpen={true}
          onClose={() => setEditingProduct(null)}
          product={editingProduct}
          initialMode={modes[editingProduct.id] ?? "stock"}
          initialSupplierId={supplierIds[editingProduct.id] ?? ""}
          suppliers={suppliers}
          onSave={handleSaveProductMode}
        />
      )}

      {/* Mobile Filters Drawer (Popup list of all categories and brands) */}
      {mobileFilterDrawer ? (
        <div
          className={`fixed inset-0 z-[10020] flex items-end bg-slate-950/45 lg:hidden ${
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

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2 pb-6">
              {mobileFilterDrawer === "category" ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategory("all");
                      setSelectedBrand("all");
                      closeMobileFilterDrawer();
                    }}
                    className={`flex min-h-14 w-full items-center justify-between border-b border-[#E1BEE7]/70 text-left text-base font-black ${
                      selectedCategory === "all" ? "text-[#4A148C]" : "text-slate-950"
                    }`}
                  >
                    ทุกหมวดหมู่ ({products.length})
                    {selectedCategory === "all" ? (
                      <span className="h-2.5 w-2.5 rounded-full bg-[#4A148C]" />
                    ) : null}
                  </button>
                  {categories.map((cat) => {
                    const catProductCount = products.filter((p) => p.categoryNames.includes(cat)).length;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          setSelectedCategory(cat);
                          setSelectedBrand("all");
                          closeMobileFilterDrawer();
                        }}
                        className={`flex min-h-14 w-full items-center justify-between border-b border-[#E1BEE7]/70 text-left text-base font-black ${
                          selectedCategory === cat ? "text-[#4A148C]" : "text-slate-950"
                        }`}
                      >
                        {cat} ({catProductCount})
                        {selectedCategory === cat ? (
                          <span className="h-2.5 w-2.5 rounded-full bg-[#4A148C]" />
                        ) : null}
                      </button>
                    );
                  })}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedBrand("all");
                      closeMobileFilterDrawer();
                    }}
                    className={`flex min-h-14 w-full items-center justify-between border-b border-[#E1BEE7]/70 text-left text-base font-black ${
                      selectedBrand === "all" ? "text-[#4A148C]" : "text-slate-950"
                    }`}
                  >
                    ทุกแบรนด์
                    {selectedBrand === "all" ? (
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
    </div>,
    document.body
  );
}

export function WarehouseListPanel({ products, suppliers, warehouses }: WarehouseListPanelProps) {
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(
    warehouses.length > 0 ? warehouses[0].id : null
  );
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isProductManagerOpen, setIsProductManagerOpen] = useState(false);

  const activeWarehouse = warehouses.find((w) => w.id === selectedWarehouseId) || warehouses[0] || null;

  // Compute metrics
  const totalWarehouses = warehouses.length;
  const activeWarehousesCount = warehouses.filter((w) => w.isActive).length;
  const totalStores = warehouses.reduce((sum, w) => sum + w.customerCount, 0);

  function formatFullAddress(w: WarehouseWithCustomerCount) {
    if (!w.address && !w.subdistrict && !w.district && !w.province) {
      return "ไม่ได้ระบุที่อยู่คลังสินค้า";
    }
    const parts = [];
    if (w.address) parts.push(w.address);
    if (w.subdistrict) parts.push(`ต.${w.subdistrict}`);
    if (w.district) parts.push(`อ.${w.district}`);
    if (w.province) parts.push(`จ.${w.province}`);
    if (w.postalCode) parts.push(w.postalCode);
    return parts.join(" ");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-[#EA80FC]/30 bg-white p-4 shadow-[0_2px_8px_rgba(26,26,26,0.06)] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-black text-[#1a1a1a]">ตั้งค่าโหมดสินค้าตามคลัง</p>
          <p className="mt-0.5 text-xs font-semibold text-slate-500">
            ดาวน์โหลดเทมเพลต แก้ค่าโหมดและโรงงานผลิตสด แล้วนำเข้ากลับมา
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <a
            href="/settings/warehouses/template"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#EA80FC] bg-white px-4 text-xs font-black text-[#4A148C] transition hover:bg-[#FDF4FF] active:scale-[0.98]"
          >
            <Download className="h-4 w-4" strokeWidth={2.4} />
            ดาวน์โหลดเทมเพลต
          </a>
          <button
            type="button"
            onClick={() => setIsImportOpen(true)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#4A148C] px-4 text-xs font-black text-white shadow-[0_10px_22px_rgba(74,20,140,0.18)] transition active:scale-[0.98]"
          >
            <Upload className="h-4 w-4" strokeWidth={2.4} />
            นำเข้า Excel
          </button>
        </div>
      </div>

      <WarehouseProductModeImportModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} />

      {/* Metrics Section: bold titles and dark black numbers (#1a1a1a) */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {/* Card 1: Total Warehouses (col-span-2 on mobile, col-span-1 on desktop) */}
        <div className="col-span-2 sm:col-span-1 relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-[0_2px_8px_rgba(26,26,26,0.08)]">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#F3E5F5] text-[#4A148C]">
              <Box className="h-6 w-6" strokeWidth={2.2} />
            </div>
            <div>
              <p className="text-[11px] sm:text-xs font-bold text-[#1a1a1a] uppercase tracking-[0.5px]">คลังทั้งหมด</p>
              <h3 className="mt-0.5 text-lg sm:text-2xl font-bold text-[#1a1a1a] whitespace-nowrap">{totalWarehouses} คลัง</h3>
            </div>
          </div>
        </div>

        {/* Card 2: Active Warehouses */}
        <div className="col-span-1 relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-[0_2px_8px_rgba(26,26,26,0.08)]">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-6 w-6" strokeWidth={2.2} />
            </div>
            <div>
              <p className="text-[11px] sm:text-xs font-bold text-[#1a1a1a] uppercase tracking-[0.5px]">เปิดใช้งานอยู่</p>
              <h3 className="mt-0.5 text-lg sm:text-2xl font-bold text-emerald-700 whitespace-nowrap">{activeWarehousesCount} คลัง</h3>
            </div>
          </div>
        </div>

        {/* Card 3: Connected Stores */}
        <div className="col-span-1 relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-[0_2px_8px_rgba(26,26,26,0.08)]">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#EA80FC]/5 text-[#EA80FC]">
              <Store className="h-6 w-6" strokeWidth={2.2} />
            </div>
            <div>
              <p className="text-[11px] sm:text-xs font-bold text-[#1a1a1a] uppercase tracking-[0.5px]">ร้านค้าเชื่อมโยง</p>
              <h3 className="mt-0.5 text-lg sm:text-2xl font-bold text-[#1a1a1a] whitespace-nowrap">{totalStores} ร้านค้า</h3>
            </div>
          </div>
        </div>
      </div>

      {warehouses.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 py-16 text-center text-sm text-[#1a1a1a] font-semibold">
          ยังไม่มีคลังสินค้าในระบบ กดปุ่ม &ldquo;เพิ่มคลังสินค้า&rdquo; เพื่อสร้างรายการแรก
        </div>
      ) : (
        /* HP Split-screen Dashboard Layout */
        <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
          {/* Left Column: Warehouse Select List */}
          <div className="md:col-span-5 flex flex-col gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.7px] text-[#1a1a1a] px-1">เลือกคลังเพื่อดูรายละเอียด</p>
            <div className="flex flex-col gap-2.5">
              {warehouses.map((w) => {
                const isSelected = w.id === selectedWarehouseId;
                return (
                  <button
                    key={w.id}
                    onClick={() => {
                      setSelectedWarehouseId(w.id);
                      setIsProductManagerOpen(true);
                    }}
                    className={`w-full text-left flex items-center justify-between p-4 rounded-2xl border transition-all duration-200 ${
                      isSelected
                        ? "border-[#4A148C] bg-[#F3E5F5]/50 shadow-sm"
                        : "border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition ${
                        w.isActive
                          ? isSelected
                            ? "bg-[#4A148C] text-white"
                            : "bg-[#F3E5F5] text-[#4A148C]"
                          : "bg-slate-100 text-slate-400"
                      }`}>
                        <Warehouse className="h-5 w-5" strokeWidth={2.2} />
                      </div>
                      <div>
                        <h4 className={`text-sm font-bold tracking-tight transition-colors ${
                          isSelected ? "text-[#4A148C]" : "text-[#1a1a1a]"
                        }`}>
                          {w.name}
                        </h4>
                        <code className="text-[10px] font-mono font-bold text-slate-600 uppercase tracking-wider">
                          {w.slug.toUpperCase()}
                        </code>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${w.isActive ? "bg-emerald-500" : "bg-slate-300"}`} />
                      <ChevronRight className={`h-4 w-4 transition-transform text-slate-400 ${
                        isSelected ? "translate-x-0.5 text-[#4A148C]" : ""
                      }`} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Warehouse Details & Linked Stores */}
          <div className="md:col-span-7">
            {activeWarehouse && (
              <div className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_8px_rgba(26,26,26,0.08)] overflow-hidden flex flex-col h-full min-h-[420px] animate-fade-in">
                {/* Panel Header */}
                <div className="border-b border-slate-100 p-6 bg-slate-50/40">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <span className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[10px] font-bold tracking-[0.5px] uppercase ${
                        activeWarehouse.isActive
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-slate-100 text-slate-500 border border-slate-200"
                      }`}>
                        {activeWarehouse.isActive ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                      </span>
                      <h3 className="mt-2.5 text-xl font-bold text-[#1a1a1a]">{activeWarehouse.name}</h3>
                      <code className="mt-1 inline-block text-[11px] font-mono font-bold text-slate-600 uppercase tracking-wider">
                        รหัสคลัง: {activeWarehouse.slug.toUpperCase()}
                      </code>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="rounded-md h-9 px-3.5 font-bold text-xs tracking-[0.5px] uppercase border-slate-200 text-slate-700 bg-white hover:border-[#4A148C]/30 hover:text-[#4A148C] transition duration-200"
                      >
                        <Link href={`/settings/warehouses?edit=${activeWarehouse.id}`}>
                          <PencilLine className="size-3.5 mr-1.5" strokeWidth={2} />
                          แก้ไข
                        </Link>
                      </Button>
                      <ToggleButton warehouseId={activeWarehouse.id} isActive={activeWarehouse.isActive} />
                      <DeleteButton
                        warehouseId={activeWarehouse.id}
                        name={activeWarehouse.name}
                        isMain={activeWarehouse.slug === "main"}
                      />
                    </div>
                  </div>
                </div>

                {/* Panel Body */}
                <div className="p-6 flex-1 flex flex-col gap-6">
                  {/* Address Section */}
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-bold uppercase tracking-[0.7px] text-[#1a1a1a] flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-[#1a1a1a]" />
                      ที่อยู่คลังสินค้า
                    </span>
                    <div className="rounded-md bg-slate-50 border border-slate-100 p-4 text-sm text-[#1a1a1a] leading-relaxed font-semibold">
                      {formatFullAddress(activeWarehouse)}
                    </div>
                  </div>

                  {/* Linked Stores Section */}
                  <div className="flex-1 flex flex-col gap-3">
                    <span className="text-xs font-bold uppercase tracking-[0.7px] text-[#1a1a1a] flex items-center gap-1.5">
                      <Store className="h-3.5 w-3.5 text-[#1a1a1a]" />
                      ร้านค้าที่เชื่อมโยง ({activeWarehouse.customerCount} ร้านค้า)
                    </span>

                    {activeWarehouse.customers.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-md p-8 text-center bg-slate-50/30">
                        <Info className="h-8 w-8 text-slate-400 mb-2" />
                        <p className="text-xs text-[#1a1a1a] font-bold">ยังไม่มีร้านค้าผูกกับคลังนี้</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">สามารถเลือกคลังนี้ให้เป็นคลังประจำได้ในหน้าจัดการร้านค้า</p>
                      </div>
                    ) : (
                      <div className="max-h-[220px] overflow-y-auto border border-slate-150 rounded-md divide-y divide-slate-100">
                        {activeWarehouse.customers.map((c) => (
                          <div key={c.id} className="flex items-center justify-between p-3.5 bg-white hover:bg-slate-50/50 transition">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#F3E5F5] text-[#4A148C]">
                                <Store className="h-4 w-4" strokeWidth={2.2} />
                              </div>
                              <div>
                                <p className="text-xs font-bold text-[#1a1a1a]">{c.name}</p>
                                <p className="text-[10px] font-mono font-bold text-slate-600">{c.code}</p>
                              </div>
                            </div>

                            <Link
                              href={`/settings/customers?edit=${c.id}`}
                              className="text-[11px] font-bold tracking-[0.5px] uppercase text-[#4A148C] hover:underline"
                            >
                              จัดการร้านค้า
                            </Link>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-3">
                    <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.7px] text-[#1a1a1a]">
                      <Package2 className="h-3.5 w-3.5 text-[#1a1a1a]" />
                      วิธีจัดการสินค้าในคลังนี้
                    </span>

                    <button
                      type="button"
                      onClick={() => setIsProductManagerOpen(true)}
                      className="group flex w-full items-center justify-between gap-4 rounded-2xl border border-[#EA80FC]/30 bg-white p-5 text-left shadow-sm transition hover:border-[#4A148C] hover:shadow-md active:scale-[0.99]"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#F3E5F5] text-[#4A148C]">
                          <Boxes className="h-6 w-6" strokeWidth={2.2} />
                        </div>
                        <div>
                          <h4 className="text-sm font-black text-[#1a1a1a] group-hover:text-[#4A148C] transition-colors">
                            ตั้งค่าสถานะและการจัดการสินค้า
                          </h4>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            กำหนดโหมดใช้สต็อก/ผลิตสด และโรงงานผลิตของแต่ละสินค้าในคลังนี้
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-slate-400 group-hover:translate-x-0.5 group-hover:text-[#4A148C] transition-all" />
                    </button>

                    <form
                      action={updateWarehouseProductFulfillmentModesAction.bind(null, activeWarehouse.id)}
                      className="hidden"
                    >
                      <div className="max-h-[320px] overflow-y-auto divide-y divide-slate-100">
                        {products.map((product) => {
                          const selectedMode = product.modeByWarehouseId[activeWarehouse.id] ?? "stock";
                          const selectedSupplierId = product.supplierIdByWarehouseId[activeWarehouse.id] ?? "";

                          return (
                            <div key={product.id} className="grid gap-3 p-3 lg:grid-cols-[1fr_10.5rem_12rem] lg:items-center">
                              <input type="hidden" name="productId" value={product.id} />
                              <div className="min-w-0">
                                <div className="flex min-w-0 items-center gap-2">
                                  <p className="truncate text-xs font-bold text-[#1a1a1a]">{product.name}</p>
                                  <code className="shrink-0 text-[10px] font-bold text-slate-500">{product.sku}</code>
                                </div>
                                <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-400">
                                  {[product.categoryNames[0], product.brand].filter(Boolean).join(" / ") || "ไม่ระบุหมวดหมู่"}
                                </p>
                              </div>
                              <select
                                name="mode"
                                defaultValue={selectedMode}
                                className="h-10 rounded-lg border border-[#D7DEE8] bg-white px-3 text-xs font-bold text-[#4A148C] outline-none transition focus:border-[#4A148C] focus:ring-2 focus:ring-[#4A148C]/15"
                              >
                                <option value="stock">ใช้สต็อก</option>
                                <option value="fresh">ผลิตสด</option>
                                <option value="disabled">ไม่ใช้ในคลังนี้</option>
                              </select>
                              <select
                                name="supplierId"
                                defaultValue={selectedSupplierId}
                                className="h-10 rounded-lg border border-[#D7DEE8] bg-white px-3 text-xs font-bold text-[#4A148C] outline-none transition focus:border-[#4A148C] focus:ring-2 focus:ring-[#4A148C]/15"
                              >
                                <option value="">เลือกโรงงานเมื่อผลิตสด</option>
                                {suppliers.map((supplier) => (
                                  <option key={supplier.id} value={supplier.id}>
                                    {supplier.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex justify-end border-t border-slate-100 bg-slate-50/50 p-3">
                        <button
                          type="submit"
                          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#4A148C] px-4 text-xs font-black text-white shadow-[0_10px_22px_rgba(74,20,140,0.18)] transition active:scale-[0.98]"
                        >
                          <Save className="h-4 w-4" strokeWidth={2.4} />
                          บันทึกโหมดสินค้า
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {isProductManagerOpen && activeWarehouse && (
        <WarehouseProductModeManagerModal
          key={activeWarehouse.id}
          isOpen={isProductManagerOpen}
          onClose={() => setIsProductManagerOpen(false)}
          products={products}
          suppliers={suppliers}
          warehouseId={activeWarehouse.id}
          warehouseName={activeWarehouse.name}
        />
      )}
    </div>
  );
}
