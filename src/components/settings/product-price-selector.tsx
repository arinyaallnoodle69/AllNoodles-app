"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { Check, ChevronRight, Package2, Search, X } from "lucide-react";
import { upsertStoreProductPrice } from "@/app/dashboard/settings/actions";
import { confirmBelowCostSave, isBelowCostPrice } from "@/components/pricing/price-guard";
import type { SettingsSaleUnitOption } from "@/lib/settings/admin";
import { normalizeSearch } from "@/lib/utils/search";

type ProductPriceSelectorModalProps = {
  customerId: string;
  customerName: string;
  availableSaleUnits: SettingsSaleUnitOption[];
  onClose: () => void;
};

export function ProductPriceSelectorModal({
  customerId,
  customerName,
  availableSaleUnits,
  onClose,
}: ProductPriceSelectorModalProps) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("__all__");
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [selectedBrand, setSelectedBrand] = useState("__all__");
  const [isDesktopSearchOpen, setIsDesktopSearchOpen] = useState(false);
  const [selections, setSelections] = useState<Map<string, string>>(new Map());
  const [isPending, startTransition] = useTransition();

  const categoryOptions = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; sortOrder: number }>();

    for (const unit of availableSaleUnits) {
      unit.categoryIds.forEach((categoryId, index) => {
        const categoryName = unit.categoryNames[index] ?? "";
        const categorySortOrder = unit.categorySortOrders[index] ?? Number.MAX_SAFE_INTEGER;
        if (categoryId && categoryName && !byId.has(categoryId)) {
          byId.set(categoryId, {
            id: categoryId,
            name: categoryName,
            sortOrder: categorySortOrder,
          });
        }
      });
    }

    return Array.from(byId.values()).sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }

      return left.name.localeCompare(right.name, "th");
    });
  }, [availableSaleUnits]);

  const brandOptions = useMemo(() => {
    const brands = new Set<string>();

    for (const unit of availableSaleUnits) {
      const matchesCategory =
        selectedCategory === "__all__" || unit.categoryIds.includes(selectedCategory);
      if (!matchesCategory) continue;

      const brand = unit.brand.trim();
      if (brand) brands.add(brand);
    }

    return Array.from(brands).sort((left, right) => left.localeCompare(right, "th"));
  }, [availableSaleUnits, selectedCategory]);

  const q = normalizeSearch(search);
  const filtered = availableSaleUnits.filter((unit) => {
    if (selectedCategory !== "__all__" && !unit.categoryIds.includes(selectedCategory)) {
      return false;
    }

    if (selectedBrand !== "__all__" && unit.brand !== selectedBrand) {
      return false;
    }

    if (!q) return true;

    return (
      normalizeSearch(unit.productName).includes(q) ||
      normalizeSearch(unit.sku).includes(q) ||
      normalizeSearch(unit.label).includes(q) ||
      normalizeSearch(unit.brand).includes(q) ||
      unit.categoryNames.some((name) => normalizeSearch(name).includes(q))
    );
  });

  const skuCollator = new Intl.Collator("th", { numeric: true, sensitivity: "base" });
  const sorted = [...filtered].sort((a, b) => {
    const skuComp = skuCollator.compare(a.sku, b.sku);
    if (skuComp !== 0) return skuComp;
    return a.productName.localeCompare(b.productName, "th");
  });

  const categoryProductCount = useMemo(() => {
    const counts = new Map<string, number>();
    const seenByCategory = new Map<string, Set<string>>();

    for (const unit of availableSaleUnits) {
      unit.categoryIds.forEach((categoryId) => {
        const seen = seenByCategory.get(categoryId) ?? new Set<string>();
        seen.add(unit.productId);
        seenByCategory.set(categoryId, seen);
      });
    }

    for (const [categoryId, productIds] of seenByCategory) {
      counts.set(categoryId, productIds.size);
    }

    return counts;
  }, [availableSaleUnits]);

  function selectCategory(categoryId: string) {
    setSelectedCategory(categoryId);
    setExpandedCategory((current) => (current === categoryId ? null : categoryId));

    if (selectedBrand === "__all__") return;

    const hasBrandInCategory = availableSaleUnits.some((unit) => {
      const matchesCategory = categoryId === "__all__" || unit.categoryIds.includes(categoryId);
      return matchesCategory && unit.brand === selectedBrand;
    });

    if (!hasBrandInCategory) {
      setSelectedBrand("__all__");
    }
  }

  const toggleSelection = (unitId: string) => {
    setSelections((prev) => {
      const next = new Map(prev);
      if (next.has(unitId)) {
        next.delete(unitId);
      } else {
        next.set(unitId, "");
      }
      return next;
    });
  };

  const updatePrice = (unitId: string, price: string) => {
    setSelections((prev) => {
      const next = new Map(prev);
      next.set(unitId, price);
      return next;
    });
  };

  const handleSave = async () => {
    const toSave = Array.from(selections.entries())
      .map(([id, price]) => {
        const unit = availableSaleUnits.find((u) => u.id === id);
        return { unit, price: parseFloat(price) };
      })
      .filter((item) => item.unit && !isNaN(item.price));

    if (toSave.length === 0) return;

    // Check below cost for all
    for (const item of toSave) {
      if (
        isBelowCostPrice(item.price, item.unit!.effectiveCostPrice) &&
        !confirmBelowCostSave({
          productName: item.unit!.productName,
          saleUnitLabel: item.unit!.label,
          salePrice: item.price,
          effectiveCostPrice: item.unit!.effectiveCostPrice,
        })
      ) {
        return;
      }
    }

    startTransition(async () => {
      for (const item of toSave) {
        const formData = new FormData();
        formData.set("customerId", customerId);
        formData.set("productSaleUnitId", item.unit!.id);
        formData.set("salePrice", String(item.price));
        await upsertStoreProductPrice(formData);
      }
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center overflow-x-hidden bg-slate-950/55 p-0 sm:items-center sm:p-4">
      <div className="relative flex h-[92dvh] w-full max-w-[100vw] min-w-0 flex-col overflow-x-hidden overflow-y-hidden rounded-t-[2rem] bg-white shadow-2xl sm:h-[86dvh] sm:max-w-6xl sm:rounded-[2rem]">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[#EA80FC]/70 bg-[#4A148C] px-4 py-2.5 text-white sm:px-8 sm:py-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/70 sm:text-xs">
              เลือกสินค้าเพิ่ม
            </p>
            <h3 className="mt-0.5 truncate text-2xl font-black leading-tight tracking-tight text-white sm:text-3xl">
              {customerName}
            </h3>
            <p className="mt-0.5 truncate text-[10px] font-bold text-white/85 sm:text-xs">
              เลือกแล้ว {selections.size.toLocaleString("th-TH")} รายการ
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div
              className={`hidden items-center overflow-hidden rounded-2xl border border-white/15 bg-white/10 transition-all duration-300 ease-out lg:flex ${
                isDesktopSearchOpen ? "w-[34rem] opacity-100" : "w-0 border-transparent opacity-0"
              }`}
            >
              <Search className="ml-4 h-5 w-5 shrink-0 text-white/80" strokeWidth={2.5} />
              <input
                type="text"
                placeholder="ค้นหาสินค้า..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="min-w-0 flex-1 bg-transparent px-3 py-3 text-base font-bold text-white outline-none placeholder:text-white/55"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
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
              className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-white transition active:scale-95 lg:flex"
              aria-label="ค้นหาสินค้า"
            >
              <Search className="h-5 w-5" strokeWidth={2.7} />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white transition active:scale-95 sm:h-11 sm:w-11 sm:rounded-2xl"
              aria-label="ปิด"
            >
              <X className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={3} />
            </button>
          </div>
        </div>

        {/* Search and filters */}
        <div className="shrink-0 border-b border-[#EA80FC]/15 bg-white">
          <div className="px-4 py-3.5 sm:px-8 lg:hidden">
            <div className="flex items-center gap-3 rounded-2xl border border-[#EA80FC]/35 bg-[#F3E5F5]/25 px-4 py-3 transition focus-within:border-[#4A148C] focus-within:ring-2 focus-within:ring-[#4A148C]/10">
              <Search className="h-5 w-5 shrink-0 text-[#4A148C]" strokeWidth={2.4} />
              <input
                type="text"
                placeholder="ค้นหาสินค้า..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-base font-semibold text-[#4A148C] outline-none placeholder:text-[#4A148C]/50"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="text-[#4A148C]/70 transition hover:text-[#4A148C]"
                  aria-label="ล้างคำค้นหา"
                >
                  <X className="h-4.5 w-4.5" strokeWidth={2.5} />
                </button>
              ) : null}
            </div>
          </div>

          {categoryOptions.length > 0 ? (
            <div className="border-t border-[#EA80FC]/15 bg-white px-4 sm:px-8 lg:hidden">
              <div className="no-scrollbar relative flex gap-6 overflow-x-auto pb-0.5 pt-3.5 scroll-smooth">
                {[{ id: "__all__", name: "ทุกหมวดหมู่" }, ...categoryOptions].map((option) => {
                  const isActive = selectedCategory === option.id;

                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => selectCategory(option.id)}
                      className={`shrink-0 whitespace-nowrap pb-2.5 text-sm font-black tracking-wide underline decoration-[3px] underline-offset-[11px] transition-all ${
                        isActive
                          ? "scale-[1.03] text-[#4A148C] decoration-[#4A148C]"
                          : "text-slate-400 decoration-transparent hover:text-slate-600"
                      }`}
                    >
                      {option.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {brandOptions.length > 0 ? (
            <div className="border-t border-[#EA80FC]/15 bg-white px-4 sm:px-8 lg:hidden">
              <div className="no-scrollbar flex gap-6 overflow-x-auto pb-0.5 pt-3.5">
                {[{ id: "__all__", name: "ทุกแบรนด์" }, ...brandOptions.map((brand) => ({ id: brand, name: brand }))].map(
                  (option) => {
                    const isActive = selectedBrand === option.id;

                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setSelectedBrand(option.id)}
                        className={`shrink-0 whitespace-nowrap pb-2.5 text-sm font-black tracking-wide underline decoration-[3px] underline-offset-[11px] transition-all ${
                          isActive
                            ? "scale-[1.03] text-[#4A148C] decoration-[#4A148C]"
                            : "text-slate-400 decoration-transparent hover:text-slate-600"
                        }`}
                      >
                        {option.name}
                      </button>
                    );
                  },
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* Desktop category navigation and product table */}
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
                  setSelectedCategory("__all__");
                  setExpandedCategory(null);
                  setSelectedBrand("__all__");
                }}
                className={`flex min-h-11 w-full items-center justify-between border-b border-[#EA80FC]/20 px-3 text-left text-sm font-black transition ${
                  selectedCategory === "__all__"
                    ? "bg-[#4A148C] text-white"
                    : "text-slate-950 hover:bg-[#F3E5F5]"
                }`}
              >
                สินค้าทั้งหมด
                <span className="text-xs tabular-nums">{availableSaleUnits.length}</span>
              </button>

              {categoryOptions.map((category) => {
                const isSelected = selectedCategory === category.id;
                const isExpanded = expandedCategory === category.id;

                return (
                  <div key={category.id} className="border-b border-[#EA80FC]/20">
                    <button
                      type="button"
                      onClick={() => selectCategory(category.id)}
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
                      <span className="text-xs tabular-nums text-slate-500">
                        {categoryProductCount.get(category.id) ?? 0}
                      </span>
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
                        {brandOptions.length > 0 ? (
                          brandOptions.map((brand) => (
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
                          ))
                        ) : (
                          <p className="px-8 py-2 text-xs font-bold text-slate-400">
                            ไม่มีข้อมูลแบรนด์
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </nav>
          </aside>

          <section className="min-h-0 overflow-x-hidden overflow-y-auto bg-white">
            {sorted.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center gap-4 text-slate-300">
                <Search className="h-16 w-16" strokeWidth={1} />
                <p className="px-6 text-center text-lg font-black uppercase tracking-widest">
                  ไม่พบสินค้าที่ตรงกับการค้นหา
                </p>
              </div>
            ) : (
              <table className="w-full table-fixed border-collapse text-left">
                <thead className="sticky top-0 z-10 bg-[#4A148C] text-white">
                  <tr>
                    <th className="w-11 px-2 py-3 text-center text-xs font-black" />
                    <th className="w-24 px-2 py-3 text-left text-xs font-black">รหัสสินค้า</th>
                    <th className="px-3 py-3 text-left text-xs font-black">รูปและชื่อสินค้า</th>
                    <th className="w-24 px-2 py-3 text-center text-xs font-black">หน่วยขาย</th>
                    <th className="w-24 px-2 py-3 text-center text-xs font-black">ต้นทุน</th>
                    <th className="w-36 px-2 py-3 text-right text-xs font-black">ราคาขาย</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((unit, index) => {
                    const isSelected = selections.has(unit.id);
                    const priceVal = selections.get(unit.id) || "";
                    const parsedPrice = parseFloat(priceVal);
                    const isBelowCost = isBelowCostPrice(parsedPrice, unit.effectiveCostPrice);

                    return (
                      <tr
                        key={unit.id}
                        onClick={() => toggleSelection(unit.id)}
                        className={`cursor-pointer border-b border-[#EA80FC]/15 transition hover:bg-[#F3E5F5]/45 ${
                          isSelected ? "bg-[#F3E5F5]/35" : index % 2 === 1 ? "bg-[#fbf8ff]" : "bg-white"
                        }`}
                      >
                        <td className="px-2 py-3 text-center align-middle">
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleSelection(unit.id);
                            }}
                            className={`mx-auto flex h-6 w-6 items-center justify-center border-2 transition ${
                              isSelected
                                ? "border-[#4A148C] bg-[#4A148C] text-white"
                                : "border-slate-300 bg-white text-transparent"
                            }`}
                            aria-label={`เลือก ${unit.productName}`}
                          >
                            <Check className="h-4 w-4" strokeWidth={4} />
                          </button>
                        </td>
                        <td className="px-2 py-3 align-middle">
                          <span className="block truncate font-mono text-xs font-black text-[#4A148C]">
                            {unit.sku}
                          </span>
                        </td>
                        <td className="px-3 py-3 align-middle">
                          <div className="flex min-w-0 items-center gap-3 text-left">
                            <span className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden bg-slate-50 text-slate-500">
                              {unit.imageUrl ? (
                                <Image
                                  src={unit.imageUrl}
                                  alt={unit.productName}
                                  fill
                                  sizes="64px"
                                  className="object-contain"
                                />
                              ) : (
                                <Package2 className="h-8 w-8" strokeWidth={1.5} />
                              )}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-base font-black text-slate-950">
                                {unit.productName}
                              </span>
                              <span className="mt-1 block truncate text-xs font-bold text-slate-500">
                                {unit.brand || "ไม่ระบุแบรนด์"}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center align-middle text-sm font-black text-slate-700">
                          {unit.label}
                        </td>
                        <td className="px-3 py-3 text-center align-middle text-sm font-black tabular-nums text-slate-700">
                          ฿{unit.effectiveCostPrice.toLocaleString("th-TH")}
                        </td>
                        <td className="px-3 py-3 text-right align-middle">
                          {isSelected ? (
                          <div>
                            <div
                                className="relative ml-auto max-w-[8.5rem]"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">
                                  ฿
                                </span>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  value={priceVal}
                                  onChange={(event) => updatePrice(unit.id, event.target.value)}
                                  onClick={(event) => event.stopPropagation()}
                                  placeholder="0.00"
                                  className={`h-11 w-full border py-2 pl-8 pr-3 text-right text-base font-black outline-none transition focus:ring-2 focus:ring-[#4A148C]/15 ${
                                    isBelowCost
                                      ? "border-amber-300 bg-amber-50 text-amber-700"
                                      : "border-[#EA80FC]/35 bg-white text-slate-950 focus:border-[#4A148C]"
                                  }`}
                                />
                              </div>
                              {isBelowCost ? (
                                <p className="mt-1 text-xs font-black text-red-600">
                                  ต่ำกว่าทุน
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleSelection(unit.id);
                              }}
                              className="text-sm font-black text-red-600"
                            >
                              ไม่มีราคา
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </div>

        {/* Mobile/tablet card list */}
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-white px-3 py-3 lg:hidden">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Package2 className="mb-3 h-12 w-12 text-slate-200" />
              <p className="text-sm text-slate-400">ไม่พบสินค้าที่คุณค้นหา</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {sorted.map((unit) => {
                const isSelected = selections.has(unit.id);
                const priceVal = selections.get(unit.id) || "";
                const parsedPrice = parseFloat(priceVal);
                const isBelowCost = isBelowCostPrice(parsedPrice, unit.effectiveCostPrice);

                return (
                  <div
                    key={unit.id}
                    className={`relative min-w-0 overflow-hidden rounded-[1.4rem] border transition-all md:rounded-[1.8rem] md:border-2 md:shadow-sm ${
                      isSelected
                        ? isBelowCost
                          ? "border-[#FF0000]/60 bg-rose-50 ring-1 ring-[#FF0000]/10"
                          : "border-[#4A148C]/40 bg-[#4A148C]/15 ring-1 ring-[#4A148C]/5"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <button
                      type="button"
                      className="relative flex w-full min-w-0 flex-col items-center gap-2.5 px-3 py-3 text-left md:flex-row md:items-center md:gap-3 md:px-4 md:py-4"
                      onClick={() => toggleSelection(unit.id)}
                    >
                      <span
                        className="absolute right-3 top-3 flex h-6 w-6 shrink-0 items-center justify-center md:right-4 md:top-4"
                        aria-hidden="true"
                      >
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-all ${
                            isSelected ? "border-[#4A148C] bg-[#4A148C]" : "border-slate-300 bg-white"
                          }`}
                        >
                          <Check
                            className={`h-3.5 w-3.5 text-white transition-transform ${isSelected ? "scale-100" : "scale-0"}`}
                            strokeWidth={5}
                          />
                        </span>
                      </span>

                      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl md:h-24 md:w-24">
                        {unit.imageUrl ? (
                          <Image
                            src={unit.imageUrl}
                            alt={unit.productName}
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
                          {unit.sku}
                        </p>
                        <p className="mt-1 break-words text-[13px] font-black leading-tight text-slate-950 md:mt-0 md:text-[19px]">
                          <span className="mr-2 hidden font-bold uppercase tracking-tighter text-slate-950 md:inline">
                            {unit.sku}
                          </span>
                          {unit.productName}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center justify-center gap-2 md:justify-start">
                          <span className="inline-flex items-center rounded-lg bg-[#4A148C] px-2.5 py-1 text-[13.5px] font-black text-white shadow-sm">
                            {unit.label}
                          </span>
                          {unit.effectiveCostPrice > 0 ? (
                            <span className="inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-1 text-[12px] font-black text-slate-600">
                              ทุน ฿{unit.effectiveCostPrice.toLocaleString("th-TH")}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>

                    {/* Price Input Section */}
                    <div
                      className={`grid transition-all duration-300 ease-in-out ${
                        isSelected ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                      }`}
                    >
                      <div className="overflow-hidden">
                        <div className="bg-[#4A148C]/15 px-3 pb-4 pt-2 md:px-4 md:pb-4 md:pt-3">
                          <label className="mb-2 block text-[12px] font-black uppercase tracking-wide text-slate-600 md:text-[14px] md:tracking-wider">
                            ราคาขาย (บาท)
                          </label>
                          <div className="relative">
                            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-black text-slate-400">
                              ฿
                            </span>
                            <input
                              type="number"
                              inputMode="decimal"
                              value={priceVal}
                              onChange={(e) => updatePrice(unit.id, e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              placeholder="0.00"
                              className={`w-full rounded-xl border py-3 pl-9 pr-4 text-lg font-black outline-none transition-all focus:ring-4 focus:ring-[#4A148C]/10 ${
                                isBelowCost
                                  ? "border-amber-300 bg-amber-50 text-amber-700"
                                  : "border-slate-200 bg-slate-50 text-slate-900 focus:border-[#4A148C] focus:bg-white"
                              }`}
                            />
                          </div>

                          {isBelowCost && (
                            <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-[#FF0000] px-2 py-1.5 text-[10px] font-black text-white">
                              ⚠️ ต่ำกว่าทุน (฿{unit.effectiveCostPrice.toLocaleString("th-TH")})
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-slate-200 bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-8px_20px_rgba(0,0,0,0.03)]">
          <div className="mx-auto flex max-w-2xl gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-2xl border border-slate-200 py-4 text-sm font-bold text-slate-500 transition hover:bg-slate-50 active:scale-95"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending || selections.size === 0}
              className="flex-[2] rounded-2xl bg-[#4A148C] py-4 text-sm font-bold text-white shadow-xl shadow-[#4A148C]/20 transition enabled:hover:bg-[#4A148C] enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPending ? "กำลังบันทึก..." : `บันทึก ${selections.size} รายการ`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
