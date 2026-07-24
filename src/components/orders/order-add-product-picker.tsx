"use client";

import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ChevronRight,
  Check,
  ListFilter,
  Loader2,
  Minus,
  Package2,
  Plus,
  Search,
  ShoppingBag,
  ShoppingCart,
  X,
  Boxes,
} from "lucide-react";
import { fetchCustomerPricesAction } from "@/app/orders/incoming/actions";
import { getEffectiveSaleUnitCost } from "@/lib/products/sale-unit-cost";
import type { OrderProductOption } from "@/lib/orders/manage";
import { normalizeSearch } from "@/lib/utils/search";
import { useClientRole } from "@/lib/auth/client-role";

export type AddedOrderItemDraft = {
  imageUrl: string | null;
  key: string;
  productId: string;
  productName: string;
  productSaleUnitId: string | null;
  quantity: number;
  sku: string;
  unitLabel: string;
  unitPrice: number;
};

type ProductUnit = {
  baseUnitQuantity: number;
  costMode: string | null;
  fixedCostPrice: number | null;
  id: string | null;
  isDefault: boolean;
  label: string;
  minOrderQty: number;
  stepOrderQty: number | null;
};

type SelectionDraft = {
  price: string;
  quantity: number;
  unitId: string | null;
};

type Props = {
  addedItems: AddedOrderItemDraft[];
  customerId: string;
  customerWarehouseId: string | null;
  onAddMany: (items: AddedOrderItemDraft[]) => void;
  products: OrderProductOption[];
};

function formatTHB(value: number) {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getUnits(product: OrderProductOption): ProductUnit[] {
  if (product.saleUnits.length > 0) {
    return product.saleUnits.map((unit) => ({
      baseUnitQuantity: unit.baseUnitQuantity,
      costMode: unit.costMode ?? null,
      fixedCostPrice: unit.fixedCostPrice ?? null,
      id: unit.id,
      isDefault: unit.isDefault,
      label: product.unit,
      minOrderQty: Number(unit.minOrderQty ?? 1),
      stepOrderQty:
        unit.stepOrderQty === null || unit.stepOrderQty === undefined
          ? null
          : Number(unit.stepOrderQty),
    }));
  }

  return [
    {
      baseUnitQuantity: 1,
      costMode: null,
      fixedCostPrice: null,
      id: null,
      isDefault: true,
      label: product.unit,
      minOrderQty: 1,
      stepOrderQty: null,
    },
  ];
}

function getEffectiveStep(stepOrderQty: number | null) {
  return stepOrderQty && Number.isFinite(stepOrderQty) && stepOrderQty > 0 ? stepOrderQty : 1;
}

function normalizeQuantity(value: number, minOrderQty: number, stepOrderQty: number | null) {
  const safeMin = Number.isFinite(minOrderQty) && minOrderQty > 0 ? minOrderQty : 1;
  const clamped = Math.max(value, safeMin);
  const step = getEffectiveStep(stepOrderQty);
  return Number((Math.round((clamped - safeMin) / step) * step + safeMin).toFixed(3));
}

function getDefaultUnit(product: OrderProductOption) {
  const units = getUnits(product);
  return units.find((unit) => unit.isDefault) ?? units[0] ?? null;
}

function getPriceKey(productId: string, unitId: string | null) {
  return unitId ?? productId;
}

function getUnitPrice(productId: string, unitId: string | null, priceMap: Record<string, number>) {
  return priceMap[getPriceKey(productId, unitId)] ?? priceMap[productId] ?? 0;
}

function getDisplayStockQuantity(product: OrderProductOption, warehouseId: string | null) {
  if (!warehouseId) {
    return product.stockQuantity;
  }

  return product.warehouseStocks.find((stock) => stock.warehouseId === warehouseId)?.stockQuantity
    ?? product.stockQuantity;
}

function getWarehouseFulfillmentMode(product: OrderProductOption, warehouseId: string | null) {
  if (!warehouseId) return "stock";
  return product.warehouseModes.find((mode) => mode.warehouseId === warehouseId)?.mode === "fresh" ? "fresh" : "stock";
}

function WarehouseModeBadge({ mode }: { mode: "disabled" | "fresh" | "stock" }) {
  if (mode === "fresh") {
    return (
      <span className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-700">
        ผลิตสด
      </span>
    );
  }

  if (mode === "disabled") {
    return (
      <span className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-500">
        ไม่ใช้
      </span>
    );
  }

  return (
    <span className="inline-flex items-center justify-center rounded-full border border-[#4A148C]/20 bg-[#F3E5F5] px-2 py-0.5 text-[11px] font-black text-[#4A148C]">
      ใช้สต็อก
    </span>
  );
}

export function OrderAddProductPicker({
  addedItems,
  customerId,
  customerWarehouseId,
  onAddMany,
  products,
}: Props) {
  const [open, setOpen] = useState(false);
  const role = useClientRole();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [isDesktopSearchOpen, setIsDesktopSearchOpen] = useState(false);
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});
  const [selections, setSelections] = useState<Record<string, SelectionDraft>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [selectedCategoryId, setSelectedCategoryId] = useState("__all__");
  const [selectedBrand, setSelectedBrand] = useState("__all__");
  const [priceFilter, setPriceFilter] = useState<"all" | "priced">("all");
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);
  const [displayLimit, setDisplayLimit] = useState(40);

  const handleCategorySelect = (id: string, e?: React.MouseEvent<HTMLButtonElement>) => {
    setSelectedCategoryId(id);
    setDisplayLimit(40);
    if (id === "__all__") {
      setSelectedBrand("__all__");
    } else {
      const availableBrands = new Set<string>();
      for (const product of products) {
        if (!product.categoryIds.includes(id)) continue;
        const brand = product.brand.trim();
        if (brand) availableBrands.add(brand);
      }
      if (selectedBrand !== "__all__" && !availableBrands.has(selectedBrand)) {
        setSelectedBrand("__all__");
      }
    }
    e?.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  };

  const handleBrandSelect = (brand: string, e?: React.MouseEvent<HTMLButtonElement>) => {
    setSelectedBrand(brand);
    setDisplayLimit(40);
    e?.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  };

  function handleDesktopCategorySelect(categoryId: string) {
    setSelectedCategoryId(categoryId);
    setSelectedBrand("__all__");
    setDisplayLimit(40);
    setExpandedCategoryId((current) => (current === categoryId ? null : categoryId));
  };

  useEffect(() => {
    if (!open) return;

    startTransition(async () => {
      const prices = await fetchCustomerPricesAction(customerId);
      setPriceMap(prices);
    });
  }, [customerId, open]);

  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product] as const)),
    [products],
  );

  const categoryOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const product of products) {
      for (let i = 0; i < product.categoryIds.length; i++) {
        const id = product.categoryIds[i];
        const name = product.categoryNames[i];
        if (id && name && !seen.has(id)) seen.set(id, name);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [products]);

  const brandsByCategory = useMemo(() => {
    const result = new Map<string, string[]>();

    for (const category of categoryOptions) {
      const brands = new Set<string>();
      for (const product of products) {
        if (!product.categoryIds.includes(category.id)) continue;
        const brand = product.brand.trim();
        if (brand) brands.add(brand);
      }
      result.set(category.id, [...brands].sort((left, right) => left.localeCompare(right, "th")));
    }

    return result;
  }, [categoryOptions, products]);

  const brandOptions = useMemo(() => {
    if (selectedCategoryId === "__all__") {
      const brands = new Set<string>();
      for (const product of products) {
        const brand = product.brand.trim();
        if (brand) brands.add(brand);
      }
      return [...brands].sort((left, right) => left.localeCompare(right, "th"));
    }
    return brandsByCategory.get(selectedCategoryId) ?? [];
  }, [brandsByCategory, products, selectedCategoryId]);

  const filteredProducts = useMemo(() => {
    const normalized = normalizeSearch(deferredQuery);
    const source = products.filter((product) => {
      const matchesCategory = selectedCategoryId === "__all__" || product.categoryIds.includes(selectedCategoryId);
      if (!matchesCategory) return false;
      const matchesBrand = selectedBrand === "__all__" || product.brand === selectedBrand;
      if (!matchesBrand) return false;
      if (priceFilter === "priced") {
        const defaultUnit = getDefaultUnit(product);
        const linkedPrice = getUnitPrice(product.id, defaultUnit?.id ?? null, priceMap);
        if (linkedPrice <= 0) return false;
      }
      if (!normalized) return true;
      return (
        normalizeSearch(product.name).includes(normalized) ||
        normalizeSearch(product.sku).includes(normalized) ||
        normalizeSearch(product.brand).includes(normalized) ||
        product.categoryNames.some((category) => normalizeSearch(category).includes(normalized))
      );
    });

    return source;
  }, [products, deferredQuery, selectedCategoryId, selectedBrand, priceFilter, priceMap]);

  const selectedCount = Object.keys(selections).length;

  function toggleProduct(product: OrderProductOption) {
    setError(null);
    setSelections((current) => {
      if (current[product.id]) {
        const next = { ...current };
        delete next[product.id];
        return next;
      }

      const defaultUnit = getDefaultUnit(product);
      if (!defaultUnit) return current;
      const defaultPrice = getUnitPrice(product.id, defaultUnit.id, priceMap);

      return {
        ...current,
        [product.id]: {
          price: defaultPrice === 0 ? "" : String(defaultPrice),
          quantity: defaultUnit.minOrderQty,
          unitId: defaultUnit.id,
        },
      };
    });
  }

  function updateSelection(productId: string, updater: (draft: SelectionDraft) => SelectionDraft) {
    setError(null);
    setSelections((current) => {
      const draft = current[productId];
      if (!draft) return current;
      return { ...current, [productId]: updater(draft) };
    });
  }

  function changeUnit(product: OrderProductOption, unitId: string | null) {
    const unit = getUnits(product).find((item) => item.id === unitId) ?? getDefaultUnit(product);
    if (!unit) return;
    const unitPrice = getUnitPrice(product.id, unit.id, priceMap);

    updateSelection(product.id, (curr) => ({
      ...curr,
      unitId: unit.id,
      price: unitPrice === 0 ? "" : String(unitPrice),
      quantity: Math.max(curr.quantity, unit.minOrderQty),
    }));
  }

  function stepQuantity(product: OrderProductOption, direction: -1 | 1) {
    const draft = selections[product.id];
    if (!draft) return;
    const unit = getUnits(product).find((item) => item.id === draft.unitId) ?? getDefaultUnit(product);
    if (!unit) return;

    updateSelection(product.id, (current) => ({
      ...current,
      quantity: normalizeQuantity(
        current.quantity + direction * getEffectiveStep(unit.stepOrderQty),
        unit.minOrderQty,
        unit.stepOrderQty,
      ),
    }));
  }

  function getSelectionIssue(product: OrderProductOption, draft: SelectionDraft) {
    const unit = getUnits(product).find((item) => item.id === draft.unitId) ?? getDefaultUnit(product);
    if (!unit) return "ไม่พบหน่วยขาย";

    const linkedPrice = getUnitPrice(product.id, unit.id, priceMap);
    if (role === "member") {
      return null;
    }

    if (linkedPrice > 0) {
      return null;
    }

    const price = Number(draft.price);
    if (!Number.isFinite(price) || price <= 0) return "กรุณาใส่ราคามากกว่า 0";

    const cost = getEffectiveSaleUnitCost({
      baseCostPrice: product.baseCostPrice,
      baseUnitQuantity: unit.baseUnitQuantity,
      costMode: unit.costMode,
      fixedCostPrice: unit.fixedCostPrice,
    });

    if (cost > 0 && price < cost) {
      return `ราคาต่ำกว่าต้นทุน ฿${formatTHB(cost)}`;
    }

    return null;
  }

  function addSelectedProducts() {
    const selectedItems = Object.entries(selections)
      .map(([productId, draft]) => {
        const product = productsById.get(productId);
        if (!product) return null;
        const unit = getUnits(product).find((item) => item.id === draft.unitId) ?? getDefaultUnit(product);
        if (!unit) return null;
        const issue = getSelectionIssue(product, draft);
        if (issue) {
          setError(`${product.name}: ${issue}`);
          return null;
        }

        const linkedPrice = getUnitPrice(product.id, unit.id, priceMap);
        const unitPrice = linkedPrice > 0 ? linkedPrice : Number(draft.price) || 0;

        return {
          imageUrl: product.imageUrl,
          key: `${product.id}:${unit.id ?? "base"}:${crypto.randomUUID()}`,
          productId: product.id,
          productName: product.name,
          productSaleUnitId: unit.id,
          quantity: draft.quantity,
          sku: product.sku,
          unitLabel: unit.label,
          unitPrice,
        };
      })
      .filter((item): item is AddedOrderItemDraft => Boolean(item));

    if (selectedItems.length !== selectedCount) {
      return;
    }
    if (selectedItems.length === 0) {
      setError("กรุณาเลือกสินค้าอย่างน้อย 1 รายการ");
      return;
    }

    onAddMany(selectedItems);
    handleClose();
  }

  function handleClose() {
    setOpen(false);
    setQuery("");
    setIsDesktopSearchOpen(false);
    setSelections({});
    setError(null);
    setSelectedCategoryId("__all__");
    setSelectedBrand("__all__");
    setPriceFilter("all");
    setExpandedCategoryId(null);
  }

  return (
    <>
      <div className="rounded-[1.35rem] border border-slate-200 bg-white p-3 shadow-sm">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-left transition hover:bg-slate-100 active:scale-[0.99]"
        >
          <span className="inline-flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#4A148C] text-white">
              <ShoppingBag className="h-4.5 w-4.5" strokeWidth={2.3} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-slate-950">เพิ่มสินค้าใหม่</span>
              {addedItems.length > 0 ? (
                <span className="block text-xs font-medium text-slate-500">
                  เพิ่มใหม่ {addedItems.length} รายการ
                </span>
              ) : null}
            </span>
          </span>
          <Plus className="h-5 w-5 shrink-0 text-[#4A148C]" />
        </button>
      </div>
      {open && typeof document !== "undefined" ? createPortal((
        <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-[#001D3F]/70 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
          <button
            type="button"
            className="absolute inset-0"
            onClick={handleClose}
            aria-label="ปิดหน้าต่างเพิ่มสินค้า"
          />
          <div className="relative flex h-full w-full max-h-full flex-col overflow-hidden border-[#EA80FC]/45 bg-white shadow-[0_30px_90px_rgba(0,29,63,0.35)] sm:h-[90dvh] sm:max-h-[90dvh] sm:max-w-6xl sm:rounded-[2.5rem] sm:border">
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[#EA80FC]/70 bg-[#4A148C] px-4 py-2.5 text-white sm:px-8 sm:py-4">
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-2xl font-black leading-tight tracking-tight text-white sm:text-3xl">
                  เพิ่มสินค้าใหม่
                </h3>
                <p className="mt-0.5 text-[10px] font-black uppercase tracking-[0.16em] text-white/70 sm:text-xs">
                  เลือกสินค้าเพิ่ม
                </p>
              </div>
              <div
                className={`hidden items-center overflow-hidden rounded-2xl border border-white/15 bg-white/10 transition-all duration-300 ease-out lg:flex ${
                  isDesktopSearchOpen ? "w-[34rem] opacity-100" : "w-0 border-transparent opacity-0"
                }`}
              >
                <Search className="ml-4 h-5 w-5 shrink-0 text-white/80" strokeWidth={2.5} />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ค้นหาสินค้า..."
                  className="min-w-0 flex-1 bg-transparent px-3 py-3 text-base font-bold text-white outline-none placeholder:text-white/55"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="mr-3 text-white/70 transition hover:text-white"
                    aria-label="ล้างคำค้นหา"
                  >
                    <X className="h-4.5 w-4.5" strokeWidth={2.6} />
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setIsDesktopSearchOpen((current) => !current)}
                className="relative hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white transition active:scale-95 lg:flex"
                aria-label="ค้นหาสินค้า"
              >
                <Search className="h-5 w-5" strokeWidth={2.7} />
                {query && !isDesktopSearchOpen ? (
                  <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#EA80FC]" aria-hidden="true" />
                ) : null}
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white transition active:scale-95 sm:h-11 sm:w-11 sm:rounded-2xl"
                aria-label="ปิด"
              >
                <X className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={3} />
              </button>
            </div>

            <div className="shrink-0 border-b border-[#EA80FC]/15 bg-white lg:hidden">
              <div className="hidden px-4 py-3.5 sm:px-8">
                <div className="flex items-center gap-3 rounded-2xl border border-[#EA80FC]/35 bg-[#F3E5F5]/25 px-4 py-3 transition focus-within:border-[#4A148C] focus-within:ring-2 focus-within:ring-[#4A148C]/10">
                  <Search className="h-5 w-5 shrink-0 text-[#4A148C]" strokeWidth={2.4} />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="ค้นหาสินค้า..."
                    className="min-w-0 flex-1 bg-transparent text-base font-semibold text-[#4A148C] outline-none placeholder:text-[#4A148C]/50"
                  />
                  {query ? (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="action-touch-safe text-[#4A148C]/70 transition hover:text-[#4A148C]"
                      aria-label="ล้างคำค้นหา"
                    >
                      <X className="h-4.5 w-4.5" strokeWidth={2.5} />
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="bg-white">
                <div className="grid w-full grid-cols-2 overflow-hidden border-y border-[#4A148C]">
                  <button
                    type="button"
                    onClick={() => setPriceFilter("all")}
                    className={`h-11 text-center text-sm font-black transition-all ${
                      priceFilter === "all"
                        ? "bg-[#4A148C] text-white"
                        : "bg-white text-[#4A148C] hover:bg-[#F3E5F5]/50"
                    }`}
                  >
                    ทั้งหมด
                  </button>
                  <button
                    type="button"
                    onClick={() => setPriceFilter("priced")}
                    className={`h-11 border-l border-[#4A148C] text-center text-sm font-black transition-all ${
                      priceFilter === "priced"
                        ? "bg-[#4A148C] text-white"
                        : "bg-white text-[#4A148C] hover:bg-[#F3E5F5]/50"
                    }`}
                  >
                    ผูกราคาแล้ว
                  </button>
                </div>
              </div>

              {categoryOptions.length > 0 ? (
                <div className="bg-white lg:hidden">
                  <div className="flex items-center gap-5 px-4 sm:px-8">
                    <button
                      type="button"
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
                          selectedCategoryId === "__all__"
                            ? "text-[#4A148C]"
                            : "text-slate-500"
                        }`}
                      >
                        ทุกหมวดหมู่
                        {selectedCategoryId === "__all__" ? (
                          <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#4A148C]" />
                        ) : null}
                      </button>
                      {categoryOptions.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={(e) => handleCategorySelect(c.id, e)}
                          className={`relative h-12 shrink-0 px-1 text-sm font-black whitespace-nowrap transition-colors ${
                            selectedCategoryId === c.id
                              ? "text-[#4A148C]"
                              : "text-slate-500"
                          }`}
                        >
                          {c.name}
                          {selectedCategoryId === c.id ? (
                            <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#4A148C]" />
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </div>

                  {brandOptions.length > 0 ? (
                    <div className="flex items-center gap-5 border-t border-[#EA80FC]/15 bg-slate-50/30 px-4 sm:px-8">
                      <button
                        type="button"
                        className="flex h-12 shrink-0 items-center gap-1.5 text-sm font-black text-[#4A148C]"
                        aria-label="เปิดรายการแบรนด์ทั้งหมด"
                      >
                        แบรนด์
                        <ListFilter className="h-4 w-4" strokeWidth={2.5} />
                      </button>
                      <div className="flex min-w-0 flex-1 items-center gap-6 overflow-x-auto no-scrollbar">
                        <button
                          type="button"
                          onClick={(e) => handleBrandSelect("__all__", e)}
                          className={`relative flex h-12 shrink-0 items-center whitespace-nowrap px-1 text-sm font-black transition-colors ${
                            selectedBrand === "__all__"
                              ? "text-[#4A148C]"
                              : "text-slate-500"
                          }`}
                        >
                          ทั้งหมด
                          {selectedBrand === "__all__" ? (
                            <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#4A148C]" />
                          ) : null}
                        </button>
                        {brandOptions.map((brand) => (
                          <button
                            key={brand}
                            type="button"
                            onClick={(e) => handleBrandSelect(brand, e)}
                            className={`relative flex h-12 shrink-0 items-center whitespace-nowrap px-1 text-sm font-black transition-colors ${
                              selectedBrand === brand
                                ? "text-[#4A148C]"
                                : "text-slate-500"
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
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="hidden min-h-0 flex-1 grid-cols-[20%_80%] bg-white lg:grid">
              <aside className="min-h-0 overflow-y-auto border-r border-[#EA80FC]/25 bg-[#fbf8ff]">
                <div className="sticky top-0 z-10 border-b border-[#EA80FC]/25 bg-white px-4 py-3">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#4A148C]">
                    หมวดหมู่สินค้า
                  </p>
                  <p className="mt-1 text-xs font-bold text-slate-600">
                    เลือกหมวดและแบรนด์
                  </p>
                </div>

                <nav className="px-2 py-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategoryId("__all__");
                      setSelectedBrand("__all__");
                      setExpandedCategoryId(null);
                    }}
                    className={`flex min-h-11 w-full items-center justify-between border-b border-[#EA80FC]/20 px-3 text-left text-sm font-black transition ${
                      selectedCategoryId === "__all__"
                        ? "bg-[#4A148C] text-white"
                        : "text-slate-950 hover:bg-[#F3E5F5]"
                    }`}
                  >
                    สินค้าทั้งหมด
                    <span className="text-xs tabular-nums">{products.length}</span>
                  </button>

                  {categoryOptions.map((category) => {
                    const brands = brandsByCategory.get(category.id) ?? [];
                    const isExpanded = expandedCategoryId === category.id;
                    const isSelected = selectedCategoryId === category.id;
                    const productCount = products.filter((product) =>
                      product.categoryIds.includes(category.id),
                    ).length;

                    return (
                      <div key={category.id} className="border-b border-[#EA80FC]/20">
                        <button
                          type="button"
                          onClick={() => handleDesktopCategorySelect(category.id)}
                          className={`flex min-h-12 w-full items-center gap-2 px-3 text-left text-sm font-black transition ${
                            isSelected
                              ? "bg-[#F3E5F5] text-[#4A148C]"
                              : "text-slate-950 hover:bg-[#F3E5F5]/60"
                          }`}
                        >
                          <ChevronRight
                            className={`h-4 w-4 shrink-0 transition-transform ${
                              isExpanded ? "rotate-90" : ""
                            }`}
                            strokeWidth={2.5}
                          />
                          <span className="min-w-0 flex-1 truncate">{category.name}</span>
                          <span className="text-xs tabular-nums text-slate-500">{productCount}</span>
                        </button>

                        {isExpanded ? (
                          <div className="border-t border-[#EA80FC]/15 bg-white py-1">
                            <button
                              type="button"
                              onClick={() => setSelectedBrand("__all__")}
                              className={`flex min-h-9 w-full items-center border-l-2 px-8 text-left text-xs font-black ${
                                selectedBrand === "__all__"
                                  ? "border-[#4A148C] text-[#4A148C]"
                                  : "border-transparent text-slate-600 hover:text-[#4A148C]"
                              }`}
                            >
                              ทุกแบรนด์
                            </button>
                            {brands.map((brand) => (
                              <button
                                key={brand}
                                type="button"
                                onClick={() => setSelectedBrand(brand)}
                                className={`flex min-h-9 w-full items-center border-l-2 px-8 text-left text-xs font-black ${
                                  selectedBrand === brand
                                    ? "border-[#4A148C] text-[#4A148C]"
                                    : "border-transparent text-slate-600 hover:text-[#4A148C]"
                                }`}
                              >
                                {brand}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </nav>
              </aside>

              <section className="flex min-h-0 flex-col bg-white">
                <div className="shrink-0 border-b border-[#EA80FC]/15 bg-white px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPriceFilter("all")}
                      className={`rounded-full px-4 py-1.5 text-sm font-black transition-all ${
                        priceFilter === "all"
                          ? "bg-[#4A148C] text-white shadow-sm"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      }`}
                    >
                      ทั้งหมด
                    </button>
                    <button
                      type="button"
                      onClick={() => setPriceFilter("priced")}
                      className={`rounded-full px-4 py-1.5 text-sm font-black transition-all ${
                        priceFilter === "priced"
                          ? "bg-[#4A148C] text-white shadow-sm"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      }`}
                    >
                      ผูกราคาแล้ว
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-auto">
                  {pending ? (
                    <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 text-slate-500">
                      <Loader2 className="h-8 w-8 animate-spin text-[#4A148C]" />
                      <p className="text-sm font-black">กำลังโหลดสินค้า...</p>
                    </div>
                  ) : filteredProducts.length === 0 ? (
                    <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 text-slate-400">
                      <Search className="h-10 w-10" strokeWidth={1.7} />
                      <p className="text-sm font-black">ไม่พบสินค้าที่ตรงกับตัวกรอง</p>
                    </div>
                  ) : (
                    <table className="w-full min-w-[62rem] table-fixed border-collapse">
                      <thead className="sticky top-0 z-10 bg-[#4A148C] text-white">
                        <tr>
                          <th className="w-12 px-3 py-3 text-center text-xs font-black" aria-label="เลือก" />
                          <th className="w-28 px-3 py-3 text-left text-xs font-black">รหัสสินค้า</th>
                          <th className="px-3 py-3 text-left text-xs font-black">รูปและชื่อสินค้า</th>
                          <th className="w-28 px-3 py-3 text-center text-xs font-black">โหมด</th>
                          <th className="w-32 px-3 py-3 text-center text-xs font-black">สต็อก</th>
                          <th className="w-44 px-3 py-3 text-center text-xs font-black">จำนวน</th>
                          <th className="w-44 px-3 py-3 text-right text-xs font-black">ราคาขาย</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProducts.map((product) => {
                          const draft = selections[product.id];
                          const units = getUnits(product);
                          const selectedUnit =
                            units.find((unit) => unit.id === draft?.unitId) ?? getDefaultUnit(product);
                          const stockQuantity = getDisplayStockQuantity(product, customerWarehouseId);
                          const fulfillmentMode = getWarehouseFulfillmentMode(product, customerWarehouseId);
                          const linkedPrice = selectedUnit
                            ? getUnitPrice(product.id, selectedUnit.id, priceMap)
                            : 0;
                          const currentPrice = linkedPrice > 0
                            ? linkedPrice
                            : draft?.price
                              ? Number(draft.price)
                              : 0;

                          return (
                            <tr
                              key={product.id}
                              onClick={() => toggleProduct(product)}
                              className={`cursor-pointer border-b border-slate-200 transition-colors ${
                                draft ? "bg-[#F3E5F5]/75" : "bg-white hover:bg-[#F3E5F5]/25"
                              }`}
                            >
                              <td className="w-12 px-3 py-3 text-center">
                                <span className={`inline-flex h-5 w-5 items-center justify-center border-2 ${
                                  draft ? "border-[#4A148C] bg-[#4A148C]" : "border-slate-300 bg-white"
                                }`}>
                                  {draft ? <Check className="h-3.5 w-3.5 text-white" strokeWidth={4} /> : null}
                                </span>
                              </td>
                              <td className="w-28 px-3 py-3 font-mono text-sm font-black text-[#4A148C]">
                                {product.sku}
                              </td>
                              <td className="min-w-[18rem] px-3 py-3">
                                <div className="flex items-center gap-3">
                                  <div className="relative h-12 w-12 shrink-0 overflow-hidden bg-slate-50">
                                    {product.imageUrl ? (
                                      <Image src={product.imageUrl} alt={product.name} fill sizes="48px" className="object-contain" />
                                    ) : (
                                      <div className="flex h-full w-full items-center justify-center">
                                        <Package2 className="h-6 w-6 text-slate-300" strokeWidth={1.7} />
                                      </div>
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-black text-slate-950">{product.name}</p>
                                    <div className="mt-1 flex items-center gap-2 text-xs font-bold text-slate-500">
                                      {product.brand ? <span>{product.brand}</span> : null}
                                      <span>{selectedUnit?.label ?? product.unit}</span>
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="w-28 px-3 py-3 text-center">
                                <WarehouseModeBadge mode={fulfillmentMode} />
                              </td>
                              <td className="w-32 px-3 py-3 text-center">
                                {fulfillmentMode === "fresh" ? (
                                  <span className="text-sm font-black text-emerald-700">
                                    ขายแล้ว {(draft?.quantity ?? 0).toLocaleString("th-TH")} {selectedUnit?.label ?? product.unit}
                                  </span>
                                ) : (
                                  <span className={`text-sm font-black ${
                                    stockQuantity < 0 ? "text-red-600" : "text-slate-950"
                                  }`}>
                                    {stockQuantity.toLocaleString("th-TH")} {product.unit}
                                  </span>
                                )}
                              </td>
                              <td className="w-44 px-3 py-3" onClick={(event) => event.stopPropagation()}>
                                {draft && selectedUnit ? (
                                  <div className="flex items-center justify-center gap-1.5">
                                    <button type="button" onClick={() => stepQuantity(product, -1)} className="flex h-8 w-8 items-center justify-center border border-[#EA80FC]/40 bg-white text-[#4A148C]">
                                      <Minus className="h-4 w-4" strokeWidth={2.8} />
                                    </button>
                                    <input
                                      type="number"
                                      min={selectedUnit.minOrderQty}
                                      step={getEffectiveStep(selectedUnit.stepOrderQty)}
                                      value={draft.quantity}
                                      onChange={(event) => {
                                        const value = Number(event.target.value);
                                        updateSelection(product.id, (current) => ({
                                          ...current,
                                          quantity: Number.isFinite(value) ? value : selectedUnit.minOrderQty,
                                        }));
                                      }}
                                      className="h-8 w-20 border border-[#EA80FC]/40 bg-white px-2 text-center text-sm font-black text-slate-950 outline-none focus:border-[#4A148C]"
                                    />
                                    <button type="button" onClick={() => stepQuantity(product, 1)} className="flex h-8 w-8 items-center justify-center border border-[#EA80FC]/40 bg-white text-[#4A148C]">
                                      <Plus className="h-4 w-4" strokeWidth={2.8} />
                                    </button>
                                  </div>
                                ) : (
                                  <span className="block text-center text-xs font-bold text-slate-300">-</span>
                                )}
                              </td>
                              <td className="w-44 px-3 py-3 text-right" onClick={(event) => event.stopPropagation()}>
                                {draft && selectedUnit ? (
                                  role !== "member" ? (
                                    (() => {
                                      const linkedPrice = getUnitPrice(product.id, selectedUnit.id, priceMap);
                                      if (linkedPrice > 0) {
                                        return (
                                          <span className="font-black text-slate-950">
                                            {formatTHB(linkedPrice)}
                                          </span>
                                        );
                                      }
                                      return (
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          value={draft.price}
                                          onChange={(event) =>
                                            updateSelection(product.id, (current) => ({
                                              ...current,
                                              price: event.target.value,
                                            }))
                                          }
                                          className="ml-auto h-8 w-28 border border-[#EA80FC]/40 bg-white px-2 text-right text-sm font-black text-slate-950 outline-none focus:border-[#4A148C]"
                                        />
                                      );
                                    })()
                                  ) : (
                                    <span className={`font-black ${currentPrice <= 0 ? "text-amber-700" : "text-slate-950"}`}>
                                      {currentPrice > 0 ? formatTHB(currentPrice) : "ยังไม่มีราคา"}
                                    </span>
                                  )
                                ) : (
                                  <span className="block text-center text-xs font-bold text-slate-300">-</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>
            </div>

            <div className="flex-1 overflow-y-auto bg-white lg:hidden">
              {error ? (
                <div className="mb-3 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} />
                  <p>{error}</p>
                </div>
              ) : null}

              <div className="space-y-4 p-3 md:space-y-0 md:p-5">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-3">
                {filteredProducts.slice(0, displayLimit).map((product) => {
                  const draft = selections[product.id];
                  const units = getUnits(product);
                  const selectedUnit =
                    units.find((unit) => unit.id === draft?.unitId) ?? getDefaultUnit(product);
                  const issue = draft ? getSelectionIssue(product, draft) : null;
                  const fulfillmentMode = getWarehouseFulfillmentMode(product, customerWarehouseId);
                  const cost = selectedUnit
                    ? getEffectiveSaleUnitCost({
                        baseCostPrice: product.baseCostPrice,
                        baseUnitQuantity: selectedUnit.baseUnitQuantity,
                        costMode: selectedUnit.costMode,
                        fixedCostPrice: selectedUnit.fixedCostPrice,
                      })
                    : 0;

                  const linkedPrice = selectedUnit
                    ? getUnitPrice(product.id, selectedUnit.id, priceMap)
                    : 0;
                  const currentPriceNum = linkedPrice > 0
                    ? linkedPrice
                    : draft?.price
                      ? Number.parseFloat(draft.price)
                      : 0;
                  const isBelowCost = role !== "member" && linkedPrice <= 0 && draft && cost > 0 && currentPriceNum > 0 && currentPriceNum < (cost - 0.001);

                  return (
                    <div
                      key={product.id}
                      className={`relative min-w-0 overflow-hidden rounded-[1.4rem] border transition-all md:rounded-[1.8rem] md:border-2 md:shadow-sm ${
                        draft
                          ? isBelowCost
                            ? "border-[#FF0000]/60 bg-rose-50 ring-1 ring-[#FF0000]/10"
                            : "border-[#4A148C]/40 bg-[#4A148C]/15 ring-1 ring-[#4A148C]/5"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleProduct(product)}
                        className="relative flex w-full min-w-0 flex-col items-center gap-2.5 px-3 py-3 text-left md:flex-row md:items-center md:gap-3 md:px-4 md:py-4"
                      >
                        <span
                          className="absolute right-3 top-3 flex h-6 w-6 shrink-0 items-center justify-center md:right-4 md:top-4"
                          aria-hidden="true"
                        >
                          <span
                            className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-all ${
                              draft ? "border-[#4A148C] bg-[#4A148C]" : "border-slate-300 bg-white"
                            }`}
                          >
                            <Check
                              className={`h-3.5 w-3.5 text-white transition-transform ${draft ? "scale-100" : "scale-0"}`}
                              strokeWidth={5}
                            />
                          </span>
                        </span>
                        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl md:h-24 md:w-24">
                          {product.imageUrl ? (
                            <Image
                              src={product.imageUrl}
                              alt={product.name}
                              fill
                              sizes="(max-width: 768px) 80px, 96px"
                              className="object-contain"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-slate-100">
                              <Package2 className="h-12 w-12" strokeWidth={1} />
                            </div>
                          )}
                        </div>
                        <div className="w-full min-w-0 text-center md:flex-1 md:text-left">
                          <p className="text-[11px] font-black uppercase tracking-tight text-slate-500 md:hidden">
                            {product.sku}
                          </p>
                          <p className="mt-1 break-words text-[13px] font-black leading-tight text-slate-950 md:mt-0 md:text-[19px]">
                            <span className="mr-2 hidden font-bold uppercase tracking-tighter text-slate-950 md:inline">
                              {product.sku}
                            </span>
                            {product.name}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 md:justify-start">
                            <WarehouseModeBadge mode={fulfillmentMode} />
                            {fulfillmentMode === "fresh" ? (
                              <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1 text-[13.5px] font-black text-white shadow-sm">
                                <Boxes className="h-4 w-4" strokeWidth={2.5} />
                                ขายแล้ว: {(draft?.quantity ?? 0).toLocaleString("th-TH")} {selectedUnit?.label ?? product.unit}
                              </span>
                            ) : (
                              <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13.5px] font-black shadow-sm ${
                                getDisplayStockQuantity(product, customerWarehouseId) < 0 
                                  ? "bg-[#FF0000] text-white" 
                                  : "bg-[#4A148C] text-white"
                              }`}>
                                <Boxes className="h-4 w-4" strokeWidth={2.5} />
                                สต็อก: {getDisplayStockQuantity(product, customerWarehouseId).toLocaleString("th-TH")} {product.unit}
                              </span>
                            )}
                            
                            {cost > 0 && isBelowCost && (
                              <div className="inline-flex items-center rounded-lg bg-[#FF0000] px-2 py-1 text-[10px] font-black text-white animate-pulse">
                                ต่ำกว่าทุน!
                              </div>
                            )}
                          </div>
                        </div>
                      </button>

                      {draft && selectedUnit ? (
                        <div className="bg-[#4A148C]/15 px-3 pb-4 pt-2 md:px-4 md:pb-4 md:pt-1">
                          {units.length > 1 ? (
                            <div className="mb-3 flex gap-2 overflow-x-auto pb-1 no-scrollbar md:mb-4">
                              {units.map((unit) => (
                                <button
                                  key={unit.id ?? "__base__"}
                                  type="button"
                                  onClick={() => changeUnit(product, unit.id)}
                                  className={`shrink-0 rounded-xl border-2 px-4 py-2 text-sm font-black transition-all ${
                                    selectedUnit.id === unit.id
                                      ? "border-[#4A148C] bg-[#4A148C] text-white shadow-md shadow-[#4A148C]/20"
                                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                                  }`}
                                >
                                  {unit.label}
                                </button>
                              ))}
                            </div>
                          ) : null}

                          <div className="space-y-3">
                            <div className="space-y-1.5 md:space-y-2">
                              <label className="text-[12px] font-black uppercase tracking-wide text-slate-600 md:text-[14px] md:tracking-wider">
                                จำนวน ({selectedUnit.label})
                              </label>
                              <div className="flex items-center gap-1.5 md:gap-2.5">
                                <button
                                  type="button"
                                  onClick={() => stepQuantity(product, -1)}
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white text-slate-700 shadow-md active:scale-90 md:h-10 md:w-10 md:rounded-2xl"
                                >
                                  <Minus className="h-5 w-5 md:h-6 md:w-6" strokeWidth={3} />
                                </button>
                                <input
                                  type="number"
                                  min={selectedUnit.minOrderQty}
                                  step={getEffectiveStep(selectedUnit.stepOrderQty)}
                                  value={draft.quantity}
                                  onChange={(e) => {
                                    const val = Number(e.target.value);
                                    updateSelection(product.id, (curr) => ({
                                      ...curr,
                                      quantity: isNaN(val) ? selectedUnit.minOrderQty : val,
                                    }));
                                  }}
                                  onBlur={() => {
                                    updateSelection(product.id, (curr) => ({
                                      ...curr,
                                      quantity: normalizeQuantity(
                                        curr.quantity,
                                        selectedUnit.minOrderQty,
                                        selectedUnit.stepOrderQty,
                                      ),
                                    }));
                                  }}
                                  className="h-9 w-full min-w-0 rounded-xl border-2 border-transparent bg-white px-1.5 text-center text-lg font-black text-slate-950 shadow-md outline-none focus:border-[#4A148C]/30 md:h-10 md:rounded-2xl md:px-2 md:text-xl"
                                />
                                <button
                                  type="button"
                                  onClick={() => stepQuantity(product, 1)}
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-white text-slate-700 shadow-md active:scale-90 md:h-10 md:w-10 md:rounded-2xl"
                                >
                                  <Plus className="h-5 w-5 md:h-6 md:w-6" strokeWidth={3} />
                                </button>
                              </div>
                            </div>

                            {role === "member" && (() => {
                              const linkedPrice = getUnitPrice(product.id, selectedUnit.id, priceMap);
                              if (linkedPrice > 0) return null;
                              return (
                                <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-800">
                                  <AlertTriangle className="h-5 w-5 shrink-0" strokeWidth={2.2} />
                                  <p>สินค้านี้ยังไม่มีราคา</p>
                                </div>
                              );
                            })()}

                            {role !== "member" && (() => {
                              const linkedPrice = getUnitPrice(product.id, selectedUnit.id, priceMap);
                              const hasPricedLinked = linkedPrice > 0;
                              if (hasPricedLinked) {
                                return null;
                              }
                              return (
                                <div className="space-y-1.5 md:space-y-2">
                                  <div className="flex items-center justify-between">
                                    <label
                                      className={`text-[12px] font-black uppercase tracking-wide md:text-[14px] md:tracking-wider ${
                                        isBelowCost ? "text-[#FF0000]" : "text-slate-600"
                                      }`}
                                    >
                                      ราคาต่อ{selectedUnit.label}
                                    </label>
                                    {cost > 0 && (
                                      <span
                                        className={`rounded-full border px-1.5 py-0.5 text-[10px] font-black md:px-2 md:text-[11px] ${
                                          isBelowCost
                                            ? "animate-pulse border-[#FF0000] bg-white text-[#FF0000] shadow-sm"
                                            : "border-slate-200 text-slate-400"
                                        }`}
                                      >
                                        ทุน ฿{formatTHB(cost)}
                                      </span>
                                    )}
                                  </div>
                                  <div className="relative">
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={draft.price}
                                      onFocus={(e) => e.target.select()}
                                      placeholder="0.00"
                                      onChange={(event) =>
                                        updateSelection(product.id, (current) => ({
                                          ...current,
                                          price: event.target.value,
                                        }))
                                      }
                                      className={`h-9 w-full rounded-xl border-2 pl-3 pr-12 text-lg font-black shadow-md outline-none transition-all md:h-10 md:rounded-2xl md:pl-4 md:pr-16 md:text-xl ${
                                        isBelowCost
                                          ? "!border-[#FF0000] !bg-rose-50 !text-[#FF0000]"
                                          : "border-transparent bg-white text-slate-950 focus:border-[#4A148C]/30"
                                      }`}
                                    />
                                    <span
                                      className={`absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-black md:right-4 md:text-xs ${
                                        isBelowCost ? "text-[#FF0000]" : "text-slate-500"
                                      }`}
                                    >
                                      บาท
                                    </span>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>

                          {isBelowCost && (
                            <div className="mt-3 flex items-center gap-3 rounded-2xl border border-white/20 bg-[#FF0000] px-4 py-3 text-[13px] font-black text-white shadow-xl shadow-rose-500/30 animate-in zoom-in-95 duration-200 md:mt-4 md:border-2 md:px-5 md:py-4 md:text-[16px] md:shadow-rose-500/40">
                              <AlertTriangle className="h-6 w-6 shrink-0 text-yellow-300" strokeWidth={3} />
                              <div className="min-w-0 flex-1">
                                <p className="leading-tight">ราคาต่ำกว่าทุน!</p>
                                <p className="mt-1 text-[13px] font-bold uppercase tracking-tight opacity-90">
                                  ต้นทุนของ {selectedUnit.label} นี้คือ ฿{formatTHB(cost)}
                                </p>
                              </div>
                            </div>
                          )}

                          {issue ? (
                            <div className="mt-3 flex items-start gap-2 rounded-xl border-2 border-rose-200 bg-rose-50 px-3 py-2 text-sm font-black text-rose-700">
                              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} />
                              <p>{issue}</p>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                </div>
                {filteredProducts.length > displayLimit && (
                  <div className="flex justify-center py-6">
                    <button
                      type="button"
                      onClick={() => setDisplayLimit((prev) => prev + 40)}
                      className="action-touch-safe rounded-2xl border-2 border-[#EA80FC]/45 bg-[#F3E5F5]/40 px-6 py-2.5 text-sm font-black text-[#4A148C] transition-all hover:bg-[#F3E5F5]/60 active:scale-95"
                    >
                      แสดงเพิ่มเติม ({filteredProducts.length - displayLimit} รายการ)
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="shrink-0 border-t border-[#EA80FC]/35 bg-white px-5 py-4 pb-safe-or-4 shadow-[0_-10px_40px_rgba(142,36,170,0.10)] sm:px-8">
              <div className="flex items-center justify-between gap-6">
                <div className="min-w-0">
                  <p className="mb-1 text-[10px] font-black uppercase leading-none tracking-widest text-[#4A148C]">เลือกแล้ว</p>
                  <p className="text-2xl font-black text-[#4A148C] tabular-nums leading-none">
                    {selectedCount.toLocaleString("th-TH")} <span className="text-xs">รายการ</span>
                  </p>
                </div>
                <div className="flex flex-1 items-center gap-3 lg:max-w-md lg:flex-none">
                <button
                  type="button"
                  onClick={handleClose}
                  className="hidden flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-white py-3.5 text-sm font-black text-slate-600 transition hover:bg-slate-50 active:scale-[0.98] sm:flex"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={addSelectedProducts}
                  disabled={pending || selectedCount === 0}
                  className="flex flex-1 items-center justify-center gap-3 rounded-2xl border border-[#EA80FC]/75 bg-[#4A148C] py-3.5 text-xl font-black text-white shadow-xl shadow-[#4A148C]/30 transition-all hover:bg-[#4A148C] disabled:opacity-40 active:scale-[0.98] lg:px-10"
                >
                  <ShoppingCart className="h-5 w-5" strokeWidth={3} />
                  เพิ่ม รายการ
                </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ), document.body) : null}
    </>
  );
}
