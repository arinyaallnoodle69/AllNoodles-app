"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Package, Search, X } from "lucide-react";
import { normalizeSearch } from "@/lib/utils/search";

type ProductOption = {
  categoryNames: string[];
  id: string;
  name: string;
  sku: string;
  imageUrl: string | null;
};

export function ProductFilter({
  products,
  selectedIds,
}: {
  products: ProductOption[];
  selectedIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds));
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const [selectedCategory, setSelectedCategory] = useState<string | "__all__">("__all__");
  const categoryTabsContainerRef = useRef<HTMLDivElement>(null);
  const [categoryUnderlineStyle, setCategoryUnderlineStyle] = useState<React.CSSProperties | null>(null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const product of products) {
      for (const name of product.categoryNames) {
        if (name) set.add(name);
      }
    }
    return Array.from(set).sort();
  }, [products]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  useEffect(() => {
    const container = categoryTabsContainerRef.current;
    if (!container) return;
    const timer = setTimeout(() => {
      const activeEl = container.querySelector('[data-active="true"]') as HTMLElement;
      if (activeEl) {
        setCategoryUnderlineStyle({
          left: `${activeEl.offsetLeft}px`,
          width: `${activeEl.offsetWidth}px`,
        });
      } else {
        setCategoryUnderlineStyle(null);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [selectedCategory, open]);

  const handleCategorySelect = (id: string, e: React.MouseEvent<HTMLButtonElement>) => {
    setSelectedCategory(id);
    setCategoryUnderlineStyle({
      left: `${e.currentTarget.offsetLeft}px`,
      width: `${e.currentTarget.offsetWidth}px`,
    });
    e.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  };

  const filtered = products.filter((product) => {
    const term = normalizeSearch(search);
    const matchesSearch =
      normalizeSearch(product.name).includes(term) ||
      normalizeSearch(product.sku).includes(term) ||
      product.categoryNames.some((categoryName) =>
        normalizeSearch(categoryName).includes(term),
      );
    const matchesCategory =
      selectedCategory === "__all__" || product.categoryNames.includes(selectedCategory);
    return matchesSearch && matchesCategory;
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const selectAll = () => setSelected(new Set(products.map((product) => product.id)));
  const clearAll = () => setSelected(new Set<string>());

  const noneSelected = selected.size === 0;
  const allSelected = selected.size === products.length && products.length > 0;

  const label = noneSelected
    ? "ทุกสินค้า"
    : allSelected
      ? "เลือกสินค้าทั้งหมด"
      : `${selected.size} รายการที่เลือก`;

  return (
    <div ref={containerRef} className="relative">
      <input type="hidden" name="products" value={[...selected].join(",")} />

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-2 rounded-xl border-0 bg-white py-2.5 pl-3 pr-3 text-sm shadow-sm transition focus:outline-none focus:ring-2 focus:ring-[#4A148C]/20 ${
          open ? "ring-2 ring-[#4A148C]/20" : "ring-1 ring-slate-200"
        }`}
      >
        <Package className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} />
        <span className={`flex-1 truncate text-left ${noneSelected ? "text-slate-400" : "font-medium text-slate-800"}`}>
          {label}
        </span>
        {!noneSelected && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              clearAll();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                clearAll();
              }
            }}
            className="shrink-0 text-slate-400 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          strokeWidth={2}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-full min-w-[320px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 p-2">
            <div className="relative">
              <Search
                className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                strokeWidth={2}
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ค้นหาสินค้า..."
                className="w-full rounded-lg py-1.5 pl-8 pr-3 text-sm text-slate-700 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-[#4A148C]/20"
              />
            </div>
          </div>

          {/* Category Tabs */}
          {categories.length > 0 && (
            <div className="relative border-b border-slate-100 bg-slate-50/50 overflow-hidden">
              <div
                ref={categoryTabsContainerRef}
                className="flex gap-4 overflow-x-auto px-3 pb-2 pt-2 scrollbar-none relative"
              >
                {/* Underline indicator */}
                <span
                  className="absolute bottom-0 h-[2.5px] rounded-full bg-[#4A148C] transition-all duration-200 ease-out"
                  style={{
                    ...(categoryUnderlineStyle ?? { left: 0, width: 0 }),
                    opacity: categoryUnderlineStyle ? 1 : 0,
                  }}
                />

                <button
                  type="button"
                  data-active={selectedCategory === "__all__"}
                  onClick={(e) => handleCategorySelect("__all__", e)}
                  className={`relative shrink-0 pb-1 text-xs font-black transition ${
                    selectedCategory === "__all__"
                      ? "text-[#4A148C]"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  ทั้งหมด
                </button>

                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    data-active={selectedCategory === cat}
                    onClick={(e) => handleCategorySelect(cat, e)}
                    className={`relative shrink-0 pb-1 text-xs font-black transition ${
                      selectedCategory === cat
                        ? "text-[#4A148C]"
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 border-b border-slate-100 px-3 py-2">
            <button
              type="button"
              onClick={selectAll}
              className="text-xs font-semibold text-[#4A148C] hover:underline"
            >
              เลือกทั้งหมด
            </button>
            <span className="text-slate-200">|</span>
            <button
              type="button"
              onClick={clearAll}
              className="text-xs font-semibold text-slate-400 hover:underline"
            >
              ยกเลิกทั้งหมด
            </button>
            {!noneSelected && (
              <span className="ml-auto text-xs text-slate-400">
                เลือก {selected.size}/{products.length}
              </span>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-center text-sm text-slate-400">
                ไม่พบสินค้า
              </p>
            ) : (
              filtered.map((product) => (
                <label
                  key={product.id}
                  className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm transition hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(product.id)}
                    onChange={() => toggle(product.id)}
                    className="h-4 w-4 rounded border-slate-300 accent-[#4A148C]"
                  />
                  {product.imageUrl ? (
                    <Image
                      src={product.imageUrl}
                      alt={product.name}
                      width={36}
                      height={36}
                      className="h-9 w-9 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                      <Package className="h-4.5 w-4.5 text-slate-400" strokeWidth={1.8} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={`truncate ${selected.has(product.id) ? "font-medium text-slate-800" : "text-slate-700"}`}>
                      {product.name}
                    </p>
                    <p className="truncate font-mono text-xs text-slate-400">{product.sku}</p>
                    {product.categoryNames.length > 0 ? (
                      <p className="truncate text-xs text-[#4A148C]">
                        หมวดหมู่: {product.categoryNames.join(", ")}
                      </p>
                    ) : null}
                  </div>
                  {selected.has(product.id) && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#4A148C]" />
                  )}
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
