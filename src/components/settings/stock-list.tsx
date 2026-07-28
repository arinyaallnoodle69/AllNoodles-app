"use client";

import React, { memo, useState, useEffect, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Boxes, Package2, Plus, ClipboardEdit, Coins, Wallet, Warehouse, Search, PackagePlus, ListFilter, X } from "lucide-react";
import { MobileSearchDrawer } from "@/components/mobile-search/mobile-search-drawer";
import { useMobileSearch } from "@/components/mobile-search/mobile-search-context";
import {
  SettingsEmptyState,
  SettingsPanel,
  SettingsPanelBody,
} from "@/components/settings/settings-ui";
import { normalizeSearch } from "@/lib/utils/search";
import { StockReceiveForm } from "./stock-receive-form";
import { StockAdjustForm } from "./stock-adjust-form";
import { StockTabs } from "./stock-tabs";
import type { StockProductOption, StockSupplierOption } from "@/lib/stock/admin";
import { useClientRole } from "@/lib/auth/client-role";

// ─── Utilities ───────────────────────────────────────────────────────────────

function formatMoney(value: number) {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatQuantity(value: number) {
  return value.toLocaleString("th-TH", { maximumFractionDigits: 3 });
}

type DisplayStock = {
  onHandQuantity: number;
  reservedQuantity: number;
  stockValue: number;
};

type WarehouseFulfillmentMode = "disabled" | "fresh" | "stock";

function getDefaultUnit(product: StockProductOption) {
  return product.saleUnits.find((unit) => unit.isDefault) || product.saleUnits[0];
}

function getDisplayStock(product: StockProductOption, warehouseId: string): DisplayStock {
  const defaultUnit = getDefaultUnit(product);
  const warehouseStock = product.warehouseStocks.find((stock) => stock.warehouseId === warehouseId);
  const onHandQuantity = warehouseStock?.onHandQuantity ?? 0;
  const reservedQuantity = warehouseStock?.reservedQuantity ?? 0;

  return {
    onHandQuantity,
    reservedQuantity,
    stockValue: onHandQuantity * (defaultUnit?.effectiveCostPrice ?? 0),
  };
}

function getWarehouseFulfillmentMode(
  product: StockProductOption,
  warehouseId: string,
): WarehouseFulfillmentMode {
  return product.warehouseModes.find((mode) => mode.warehouseId === warehouseId)?.mode ?? "stock";
}

function getWarehouseFactoryName(product: StockProductOption, warehouseId: string) {
  return product.warehouseModes.find((mode) => mode.warehouseId === warehouseId)?.supplierName?.trim() || "ไม่ระบุโรงงาน";
}

function buildUrl(baseHref: string, params: Record<string, string>) {
  const query = new URLSearchParams(params);
  const queryString = query.toString();
  return queryString ? `${baseHref}?${queryString}` : baseHref;
}

// ─── Sub-Components (Memoized for Performance) ───────────────────────────────

const MobileStockCard = memo(({ 
  product, 
  displayStock,
  selectedWarehouseId,
  onAdjust
}: { 
  product: StockProductOption; 
  displayStock: DisplayStock;
  selectedWarehouseId: string;
  onAdjust: (productId: string) => void;
}) => {
  const role = useClientRole();
  const defaultUnit = getDefaultUnit(product);
  const factoryName = getWarehouseFactoryName(product, selectedWarehouseId);

  return (
    <article
      className={`mx-2 mb-4 overflow-hidden rounded-[18px] border border-[#D7E0EA] bg-white shadow-[0_10px_28px_rgba(15,23,42,0.055)] ${
        product.isActive ? "" : "opacity-70"
      }`}
    >
      <div className="grid grid-cols-[7.15rem_minmax(0,1fr)] gap-4 px-4 py-3">
        <div className="flex min-w-0 flex-col items-stretch gap-2">
          <div className="relative flex h-20 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white">
            {product.imageUrl ? (
              <Image
                src={product.imageUrl}
                alt={product.name}
                fill
                sizes="115px"
                className="object-contain"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-xl border border-slate-100 bg-slate-50">
                <Package2 className="h-9 w-9 text-slate-300" strokeWidth={1.5} />
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => onAdjust(product.id)}
            className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-[#4A148C] px-2 text-[0.84rem] font-black text-white shadow-[0_10px_24px_rgba(74,20,140,0.2)] transition active:scale-95"
          >
            <ClipboardEdit className="h-4 w-4" strokeWidth={2.5} />
            ปรับยอด
          </button>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex h-full flex-col justify-center gap-1">
            <p className="line-clamp-2 py-0.5 text-[1.22rem] font-black leading-[1.38] text-slate-950">
              {product.name}
            </p>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[0.92rem] font-bold tracking-tight text-slate-500 uppercase">
                {product.sku}
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-black tracking-tight shadow-sm ring-1 ring-inset ${
                  product.isActive
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                    : "bg-slate-50 text-slate-600 ring-slate-500/20"
                }`}
              >
                {product.isActive ? "พร้อมขาย" : "ปิดใช้งาน"}
              </span>
            </div>
            <p className="truncate py-0.5 text-[0.92rem] font-black leading-[1.45] text-slate-900">
              โรงงาน: {factoryName}
            </p>
          </div>
        </div>
      </div>

      <div
        className={`grid items-stretch border-t border-[#D7E0EA] bg-white ${
          role === "member" ? "grid-cols-1" : "grid-cols-3"
        }`}
      >
        <div className="min-w-0 space-y-1 border-r border-[#D7E0EA] px-2.5 py-2.5">
          <div className="flex min-w-0 items-center gap-1 text-slate-500">
            <Boxes className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
            <p className="whitespace-nowrap text-[10px] font-black leading-[1.3]">คงเหลือ</p>
          </div>
          <div className="flex min-w-0 items-baseline gap-1">
            <span className={`text-[1.36rem] font-black leading-none tracking-tight ${displayStock.onHandQuantity < 0 ? "text-rose-600" : "text-[#4A148C]"}`}>
              {formatQuantity(displayStock.onHandQuantity)}
            </span>
            <span className="whitespace-nowrap text-[0.82rem] font-bold text-slate-500">{product.unit}</span>
          </div>
        </div>

        {role !== "member" && (
          <div className="min-w-0 space-y-1 border-r border-[#D7E0EA] px-2.5 py-2.5">
            <div className="flex min-w-0 items-center gap-1 text-slate-500">
              <Coins className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
              <p className="whitespace-nowrap text-[10px] font-black leading-[1.3]">ต้นทุน</p>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-[1.3rem] font-black leading-none tracking-tight text-[#4A148C]">
                {formatMoney(defaultUnit?.effectiveCostPrice ?? 0)}
              </span>
            </div>
          </div>
        )}

        {role !== "member" && (
          <div className="min-w-0 space-y-1 border-r border-[#D7E0EA] px-2.5 py-2.5">
            <div className="flex min-w-0 items-center gap-1 text-slate-500">
              <Wallet className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
              <p className="whitespace-nowrap text-[10px] font-black leading-[1.3]">มูลค่า</p>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-[1.3rem] font-black leading-none tracking-tight ${displayStock.stockValue < 0 ? "text-rose-600" : "text-[#4A148C]"}`}>
                {formatMoney(displayStock.stockValue)}
              </span>
            </div>
          </div>
        )}
      </div>
    </article>
  );
});
MobileStockCard.displayName = "MobileStockCard";

const DesktopStockRow = memo(({ 
  product, 
  displayStock,
  selectedWarehouseId,
  selectedWarehouseName,
  onAdjust
}: { 
  product: StockProductOption; 
  displayStock: DisplayStock;
  selectedWarehouseId: string;
  selectedWarehouseName: string;
  onAdjust: (productId: string) => void;
}) => {
  const role = useClientRole();
  const factoryName = getWarehouseFactoryName(product, selectedWarehouseId);

  return (
    <tr className="hover:bg-slate-50 transition-colors group">
      <td className="whitespace-nowrap border-b border-l border-r border-slate-300 px-5 py-2.5 text-center font-mono font-bold text-slate-500 uppercase tracking-tight align-middle">
        {product.sku}
      </td>
      <td className="border-b border-r border-slate-300 px-5 py-2.5 align-middle">
        <div className="flex items-center gap-4">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-white p-1">
            {product.imageUrl ? (
              <Image
                src={product.imageUrl}
                alt={product.name}
                fill
                sizes="56px"
                 className="object-contain"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slate-200">
                <Package2 className="h-8 w-8" strokeWidth={1} />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="line-clamp-2 py-0.5 text-[15px] font-black leading-normal text-slate-900 group-hover:text-[#4A148C]">
              {product.name}
            </p>
            <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#F3E5F5] px-2 py-0.5 text-[10px] font-black text-[#4A148C]">
              <Warehouse className="h-3 w-3" strokeWidth={2.4} />
              {selectedWarehouseName}
            </p>
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap border-b border-r border-slate-300 px-5 py-2.5 text-center text-base font-medium text-slate-600 align-middle">
        {product.unit}
      </td>
      <td className="whitespace-nowrap border-b border-r border-slate-300 px-5 py-2.5 text-center align-middle">
        <span className="inline-flex items-center justify-center rounded-full border border-[#4A148C]/15 bg-[#F3E5F5] px-2.5 py-1 text-[11px] font-black leading-[1.35] text-[#4A148C]">
          {factoryName}
        </span>
      </td>
      {role !== "member" && (
        <td className="whitespace-nowrap border-b border-r border-slate-300 px-5 py-2.5 text-center align-middle">
          <div className="flex flex-col gap-1">
            {product.saleUnits.length > 0 ? (
              product.saleUnits.map((unit) => (
                <div key={unit.id} className="flex items-center justify-center">
                  <span className="text-sm font-bold text-slate-700">
                    {formatMoney(unit.effectiveCostPrice)}
                  </span>
                </div>
              ))
            ) : (
              <div className="flex items-center justify-center">
                <span className="text-sm font-bold text-slate-700">
                  {formatMoney(product.costPrice ?? 0)}
                </span>
              </div>
            )}
          </div>
        </td>
      )}
      <td className="whitespace-nowrap border-b border-r border-slate-300 px-5 py-2.5 text-center align-middle">
        <div className="flex flex-col items-center gap-1">
          <span className={`text-base font-bold ${displayStock.onHandQuantity < 0 ? 'text-rose-700' : 'text-[#4A148C]'}`}>
            {formatQuantity(displayStock.onHandQuantity)}
          </span>
          <button
            type="button"
            onClick={() => onAdjust(product.id)}
            className="p-1 text-[#4A148C] hover:text-[#4A148C] transition-colors"
            title="ปรับปรุงยอด"
          >
            <ClipboardEdit className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>
      </td>
      {role !== "member" && (
        <td className="whitespace-nowrap border-b border-r border-slate-300 px-5 py-2.5 text-center align-middle">
          <span className="text-base font-bold text-slate-900">
            {formatMoney(displayStock.stockValue)}
          </span>
        </td>
      )}
    </tr>
  );
});
DesktopStockRow.displayName = "DesktopStockRow";

// ─── Main Component ──────────────────────────────────────────────────────────

export function StockList({ products, warehouses, initialWarehouseId, baseHref = "/stock", onChangeTab, brands }: StockListProps) {
  const role = useClientRole();
  const canEditStock = role === "admin" || role === "member";
  const searchParams = useSearchParams();
  const { close: closeMobileSearch } = useMobileSearch();

  // Local state for immediate UI response
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustProductId, setAdjustProductId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const fallbackWarehouseId =
    initialWarehouseId && warehouses.some((warehouse) => warehouse.id === initialWarehouseId)
      ? initialWarehouseId
      : warehouses[0]?.id ?? "";
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(fallbackWarehouseId);
  const [selectedFactory, setSelectedFactory] = useState<string | "__all__">("__all__");
  const [selectedBrand, setSelectedBrand] = useState<string | "__all__">("__all__");
  const [mobileFilterDrawer, setMobileFilterDrawer] = useState<"brand" | "factory" | null>(null);
  const [isMobileFilterDrawerClosing, setIsMobileFilterDrawerClosing] = useState(false);

  const selectedWarehouseName = warehouses.find((warehouse) => warehouse.id === selectedWarehouseId)?.name ?? "คลังสินค้า";

  const selectedFormWarehouseId = selectedWarehouseId;

  const stockProductsForWarehouse = useMemo(
    () => products.filter((product) => getWarehouseFulfillmentMode(product, selectedWarehouseId) === "stock"),
    [products, selectedWarehouseId],
  );

  const factoryOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const p of stockProductsForWarehouse) {
      const factoryName = getWarehouseFactoryName(p, selectedWarehouseId).trim();
      if (factoryName) {
        seen.add(factoryName);
      }
    }
    return Array.from(seen).sort((a, b) => a.localeCompare(b, "th"));
  }, [selectedWarehouseId, stockProductsForWarehouse]);

  const brandOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const p of stockProductsForWarehouse) {
      const matchesFactory =
        selectedFactory === "__all__" || getWarehouseFactoryName(p, selectedWarehouseId) === selectedFactory;
      if (!matchesFactory) continue;

      if (p.brandName) {
        const trimmed = p.brandName.trim();
        if (trimmed) seen.add(trimmed);
      }
    }
    const unsortedBrands = Array.from(seen);
    if (brands && brands.length > 0) {
      return unsortedBrands.sort((a, b) => {
        const indexA = brands.indexOf(a);
        const indexB = brands.indexOf(b);
        if (indexA === -1 && indexB === -1) return a.localeCompare(b, "th");
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
      });
    }
    return unsortedBrands.sort((a, b) => a.localeCompare(b, "th"));
  }, [stockProductsForWarehouse, selectedFactory, selectedWarehouseId, brands]);

  const handleFactorySelect = (factory: string, e?: React.MouseEvent<HTMLButtonElement>) => {
    setSelectedFactory(factory);
    if (factory === "__all__") {
      setSelectedBrand("__all__");
    } else {
      const availableBrands = new Set<string>();
      for (const p of stockProductsForWarehouse) {
        if (getWarehouseFactoryName(p, selectedWarehouseId) === factory && p.brandName) {
          const trimmed = p.brandName.trim();
          if (trimmed) availableBrands.add(trimmed);
        }
      }
      if (selectedBrand !== "__all__" && !availableBrands.has(selectedBrand)) {
        setSelectedBrand("__all__");
      }
    }
    if (e) {
      e.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  };

  const handleBrandSelect = (brand: string, e?: React.MouseEvent<HTMLButtonElement>) => {
    setSelectedBrand(brand);
    if (e) {
      e.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  };

  const openMobileFilterDrawer = (type: "brand" | "factory") => {
    setIsMobileFilterDrawerClosing(false);
    setMobileFilterDrawer(type);
  };

  const closeMobileFilterDrawer = () => {
    setIsMobileFilterDrawerClosing(true);
    setTimeout(() => {
      setMobileFilterDrawer(null);
      setIsMobileFilterDrawerClosing(false);
    }, 200);
  };

  const filteredProducts = useMemo(() => {
    const query = normalizeSearch(searchQuery);

    return stockProductsForWarehouse.filter((product) => {
      if (selectedFactory !== "__all__" && getWarehouseFactoryName(product, selectedWarehouseId) !== selectedFactory) {
        return false;
      }
      if (selectedBrand !== "__all__" && product.brandName !== selectedBrand) {
        return false;
      }
      if (!query) return true;

      return (
        normalizeSearch(product.name).includes(query) ||
        normalizeSearch(product.sku).includes(query) ||
        normalizeSearch(product.unit).includes(query)
      );
    });
  }, [searchQuery, selectedBrand, selectedFactory, selectedWarehouseId, stockProductsForWarehouse]);

  const warehouseOptions = warehouses.map((warehouse) => ({
      id: warehouse.id,
      name: warehouse.name,
      subtitle: warehouse.slug,
    }));

  // Sync with URL on mount only (or when URL changes externally)
  useEffect(() => {
    const receive = searchParams.get("receive") === "1";
    const adjust = searchParams.get("adjust") === "1";
    const product = searchParams.get("product") || "";
    const warehouse = searchParams.get("warehouse") || fallbackWarehouseId;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- Initial sync with URL params
    setSelectedWarehouseId(
      warehouse && warehouses.some((item) => item.id === warehouse)
        ? warehouse
        : fallbackWarehouseId,
    );
    if (canEditStock && receive) setReceiveOpen(true);
    if (canEditStock && adjust) {
      setAdjustOpen(true);
      if (product) setAdjustProductId(product);
    }
  }, [canEditStock, fallbackWarehouseId, searchParams, warehouses]);

  const buildCurrentUrl = (params: Record<string, string> = {}) => {
    const nextParams: Record<string, string> = {};
    if (selectedWarehouseId) {
      nextParams.warehouse = selectedWarehouseId;
    }

    return buildUrl(baseHref, { ...nextParams, ...params });
  };

  const handleWarehouseChange = (warehouseId: string) => {
    setSelectedWarehouseId(warehouseId);
    setSelectedFactory("__all__");
    setSelectedBrand("__all__");
    closeMobileSearch();
    const params: Record<string, string> = warehouseId ? { warehouse: warehouseId } : {};
    window.history.pushState({}, "", buildUrl(baseHref, params));
  };

  const handleAdjust = (productId: string) => {
    if (!canEditStock) return;
    setAdjustProductId(productId);
    setAdjustOpen(true);
    // Silent URL update for deep linking
    window.history.pushState(
      {},
      "",
      buildCurrentUrl(productId ? { adjust: "1", product: productId } : { adjust: "1" }),
    );
  };

  const handleReceive = () => {
    if (!canEditStock) return;
    setReceiveOpen(true);
    window.history.pushState({}, "", buildCurrentUrl({ receive: "1" }));
  };

  const closeModals = () => {
    setReceiveOpen(false);
    setAdjustOpen(false);
    setAdjustProductId("");
    window.history.pushState(
      {},
      "",
      selectedWarehouseId ? buildUrl(baseHref, { warehouse: selectedWarehouseId }) : baseHref,
    );
  };

  return (
    <>
      <div className="sticky top-0 z-40 -mx-3 mb-4 hidden border-b border-[#E1BEE7] bg-white/95 px-4 py-3 shadow-[0_10px_30px_rgba(31,42,68,0.08)] backdrop-blur lg:block">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
            <div className="min-w-0 shrink-0">
              <p className="text-lg font-black text-[#4A148C]">จัดการสต็อก</p>
              <p className="text-xs font-semibold text-[#667085]">
                แสดง {filteredProducts.length.toLocaleString("th-TH")} จาก {stockProductsForWarehouse.length.toLocaleString("th-TH")} รายการ
              </p>
            </div>

            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3 flex-1 justify-end max-w-5xl">
              <div className="flex-1 min-w-[12rem] max-w-xs">
                <label className="relative block w-full">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-[#667085]" strokeWidth={2} />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="ค้นหาสินค้า หรือรหัสสินค้า"
                    className="h-11 w-full rounded-lg border border-[#D7DEE8] bg-white pl-11 pr-4 text-sm font-semibold text-[#4A148C] outline-none transition placeholder:text-[#667085] focus:border-[#4A148C] focus:ring-2 focus:ring-[#4A148C]/15"
                  />
                </label>
              </div>

              <div className="w-full sm:w-[12rem] shrink-0">
                <label className="block">
                  <span className="sr-only">เลือกคลัง</span>
                  <select
                    value={selectedWarehouseId}
                    onChange={(event) => handleWarehouseChange(event.target.value)}
                    className="h-11 w-full rounded-lg border border-[#D7DEE8] bg-white px-4 text-sm font-bold text-[#4A148C] outline-none focus:border-[#4A148C] focus:ring-2 focus:ring-[#4A148C]/15"
                  >
                    {warehouseOptions.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {canEditStock ? (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleReceive}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#4A148C] px-4 text-sm font-bold text-white shadow-[0_12px_26px_rgba(142,36,170,0.22)] transition hover:bg-[#4A148C] active:scale-[0.98] whitespace-nowrap"
                  >
                    <Plus className="h-4.5 w-4.5" strokeWidth={2.4} />
                    รับสินค้าเข้า
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAdjust("")}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#4A148C]/20 bg-white px-4 text-sm font-bold text-[#4A148C] transition hover:border-[#4A148C] hover:bg-[#4A148C]/[0.04] active:scale-[0.98] whitespace-nowrap"
                  >
                    <ClipboardEdit className="h-4.5 w-4.5" strokeWidth={2.2} />
                    ปรับปรุงสต็อก
                  </button>
                </div>
              ) : null}
            </div>
          </div>


          {/* Desktop Factory Row */}
          {factoryOptions.length > 0 && (
            <div className="flex items-center gap-5 border-t border-slate-100 pt-3">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400 shrink-0 min-w-[70px]">
                โรงงาน:
              </span>
              <div className="flex min-w-0 flex-1 items-center gap-6 overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  onClick={(e) => handleFactorySelect("__all__", e)}
                  className={`relative h-10 shrink-0 px-1 text-sm font-black whitespace-nowrap transition-colors ${
                    selectedFactory === "__all__"
                      ? "text-[#4A148C]"
                      : "text-slate-500 hover:text-[#4A148C]"
                  }`}
                >
                  ทุกโรงงาน
                  {selectedFactory === "__all__" ? (
                    <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#4A148C]" />
                  ) : null}
                </button>

                {factoryOptions.map((factory) => (
                  <button
                    key={factory}
                    type="button"
                    onClick={(e) => handleFactorySelect(factory, e)}
                    className={`relative h-10 shrink-0 px-1 text-sm font-black whitespace-nowrap transition-colors ${
                      selectedFactory === factory
                        ? "text-[#4A148C]"
                        : "text-slate-500 hover:text-[#4A148C]"
                    }`}
                  >
                    {factory}
                    {selectedFactory === factory ? (
                      <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#4A148C]" />
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Desktop Brand Row */}
          {brandOptions.length > 0 && (
            <div className="flex items-center gap-5 border-t border-slate-100 pt-3">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400 shrink-0 min-w-[70px]">
                แบรนด์:
              </span>
              <div className="flex min-w-0 flex-1 items-center gap-6 overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  onClick={(e) => handleBrandSelect("__all__", e)}
                  className={`relative h-10 shrink-0 px-1 text-sm font-black whitespace-nowrap transition-colors ${
                    selectedBrand === "__all__"
                      ? "text-[#4A148C]"
                      : "text-slate-500 hover:text-[#4A148C]"
                  }`}
                >
                  ทั้งหมด
                  {selectedBrand === "__all__" ? (
                    <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#4A148C]" />
                  ) : null}
                </button>

                {brandOptions.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={(e) => handleBrandSelect(b, e)}
                    className={`relative h-10 shrink-0 px-1 text-sm font-black whitespace-nowrap transition-colors ${
                      selectedBrand === b
                        ? "text-[#4A148C]"
                        : "text-slate-500 hover:text-[#4A148C]"
                    }`}
                  >
                    {b}
                    {selectedBrand === b ? (
                      <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#4A148C]" />
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <StockTabs current="stock" onChangeTab={onChangeTab} />

      {/* Mobile-only Factory & Brand Filter */}
      <div className="mb-0 mt-2 block w-full max-w-full overflow-hidden border-b border-slate-200 bg-white px-4 py-1 lg:hidden">
        {factoryOptions.length > 0 && (
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => openMobileFilterDrawer("factory")}
              className="flex h-12 shrink-0 items-center gap-1.5 text-sm font-black text-[#4A148C]"
              aria-label="เปิดรายการโรงงานทั้งหมด"
            >
              โรงงาน
              <ListFilter className="h-4 w-4" strokeWidth={2.5} />
            </button>
            <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-6 overflow-x-auto overscroll-x-contain -mx-4 px-4">
              <button
                type="button"
                onClick={(e) => handleFactorySelect("__all__", e)}
                className={`relative h-12 shrink-0 px-1 text-sm font-black whitespace-nowrap transition-colors ${
                  selectedFactory === "__all__"
                    ? "text-[#4A148C]"
                    : "text-slate-500"
                }`}
              >
                ทุกโรงงาน
                {selectedFactory === "__all__" ? (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#4A148C]" />
                ) : null}
              </button>

              {factoryOptions.map((factory) => (
                <button
                  key={factory}
                  type="button"
                  onClick={(e) => handleFactorySelect(factory, e)}
                  className={`relative h-12 shrink-0 px-1 text-sm font-black whitespace-nowrap transition-colors ${
                    selectedFactory === factory
                      ? "text-[#4A148C]"
                      : "text-slate-500"
                  }`}
                >
                  {factory}
                  {selectedFactory === factory ? (
                    <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#4A148C]" />
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        )}

        {brandOptions.length > 0 && (
          <div className="flex items-center gap-5 border-t border-slate-100">
            <button
              type="button"
              onClick={() => openMobileFilterDrawer("brand")}
              className="flex h-12 shrink-0 items-center gap-1.5 text-sm font-black text-[#4A148C]"
              aria-label="เปิดรายการแบรนด์ทั้งหมด"
            >
              แบรนด์
              <ListFilter className="h-4 w-4" strokeWidth={2.5} />
            </button>
            <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-6 overflow-x-auto overscroll-x-contain -mx-4 px-4">
              <button
                type="button"
                onClick={(e) => handleBrandSelect("__all__", e)}
                className={`relative h-12 shrink-0 px-1 text-sm font-black whitespace-nowrap transition-colors ${
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

              {brandOptions.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={(e) => handleBrandSelect(b, e)}
                  className={`relative h-12 shrink-0 px-1 text-sm font-black whitespace-nowrap transition-colors ${
                    selectedBrand === b
                      ? "text-[#4A148C]"
                      : "text-slate-500"
                  }`}
                >
                  {b}
                  {selectedBrand === b ? (
                    <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#4A148C]" />
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <MobileSearchDrawer title="ค้นหาสต็อก">
        <div className="space-y-4">
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

          <label className="block">
            <span className="mb-1.5 block text-xs font-black uppercase tracking-widest text-slate-500">
              เลือกคลัง
            </span>
            <select
              value={selectedWarehouseId}
              onChange={(event) => handleWarehouseChange(event.target.value)}
              className="h-12 w-full rounded-lg border border-[#D7DEE8] bg-white px-4 text-sm font-bold text-[#4A148C] outline-none focus:border-[#4A148C] focus:ring-2 focus:ring-[#4A148C]/15"
            >
              {warehouseOptions.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </label>

          {canEditStock ? (
            <button
              type="button"
              onClick={() => handleAdjust("")}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-[#4A148C]/20 bg-white px-4 text-sm font-bold text-[#4A148C] transition active:scale-[0.98]"
            >
              <ClipboardEdit className="h-4.5 w-4.5" strokeWidth={2.2} />
              ปรับยอด
            </button>
          ) : null}
        </div>
      </MobileSearchDrawer>

      {canEditStock ? (
        <button
          type="button"
          onClick={handleReceive}
          aria-label="รับสินค้าเข้า"
          className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom)+12px)] left-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#4A148C] text-white shadow-[0_14px_32px_rgba(142,36,170,0.32)] transition active:scale-95 lg:hidden"
        >
          <PackagePlus className="h-7 w-7" strokeWidth={2.4} />
        </button>
      ) : null}

      <SettingsPanel>
        <SettingsPanelBody className="p-0">
          {filteredProducts.length > 0 ? (
            <>
              {/* Mobile Cards */}
              <div className="grid gap-0 py-4 lg:hidden">
                {filteredProducts.map((product) => {
                  const displayStock = getDisplayStock(product, selectedWarehouseId);

                  return (
                    <MobileStockCard
                      key={product.id}
                      product={product}
                      displayStock={displayStock}
                      selectedWarehouseId={selectedWarehouseId}
                      onAdjust={handleAdjust}
                    />
                  );
                })}
              </div>

              {/* Desktop Table */}
              <div className="hidden overflow-x-auto lg:block">
                <table className="min-w-full border-collapse border border-slate-300 text-sm">
                  <thead>
                    <tr style={{ backgroundColor: "#4A148C" }}>
                      {(role === "member"
                        ? ["รหัสสินค้า", "ชื่อสินค้า", "หน่วย", "โรงงาน", "คงเหลือ"]
                        : ["รหัสสินค้า", "ชื่อสินค้า", "หน่วย", "โรงงาน", "ต้นทุน / หน่วย", "คงเหลือ", "มูลค่าสต็อก"]
                      ).map((label, i, arr) => (
                        <th
                          key={label}
                          className={[
                            "whitespace-nowrap px-5 py-2.5 text-center text-base font-bold text-white",
                            i === 0 ? "border-l border-slate-300" : "",
                            i < arr.length - 1
                              ? "border-r border-white/60"
                              : "border-r border-slate-300",
                          ].join(" ")}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((product) => {
                      const displayStock = getDisplayStock(product, selectedWarehouseId);

                      return (
                        <DesktopStockRow
                          key={product.id}
                          product={product}
                          displayStock={displayStock}
                          selectedWarehouseId={selectedWarehouseId}
                          selectedWarehouseName={selectedWarehouseName}
                          onAdjust={handleAdjust}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="p-6">
              <SettingsEmptyState className="py-14">
                <div className="flex flex-col items-center gap-3">
                  <Boxes className="h-8 w-8 text-slate-400" strokeWidth={2.2} />
                  <p>
                    {searchQuery
                      ? "ไม่พบสินค้าที่ตรงกับคำค้นหา"
                      : "ยังไม่มีสินค้าในระบบ เริ่มจากเพิ่มสินค้า แล้วค่อยกลับมารับเข้าสต็อกได้เลย"}
                  </p>
                </div>
              </SettingsEmptyState>
            </div>
          )}
        </SettingsPanelBody>
      </SettingsPanel>

      {/* Forms rendered inside the client component for instant response */}
      {canEditStock && receiveOpen && (
        <StockReceiveForm
          products={stockProductsForWarehouse}
          warehouses={warehouses}
          returnHref={baseHref}
          defaultWarehouseId={selectedFormWarehouseId}
          onClose={closeModals}
        />
      )}

      {canEditStock && adjustOpen && (
        <StockAdjustForm
          products={stockProductsForWarehouse}
          warehouses={warehouses}
          returnHref={baseHref}
          defaultProductId={adjustProductId}
          defaultWarehouseId={selectedFormWarehouseId}
          onClose={closeModals}
        />
      )}

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
                  ตัวกรองสต็อก
                </p>
                <h3 className="mt-1 text-xl font-black text-slate-950">
                  {mobileFilterDrawer === "factory" ? "เลือกโรงงาน" : "เลือกแบรนด์"}
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
              {mobileFilterDrawer === "factory" ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      handleFactorySelect("__all__");
                      closeMobileFilterDrawer();
                    }}
                    className={`flex min-h-14 w-full items-center justify-between border-b border-[#E1BEE7]/70 text-left text-base font-black ${
                      selectedFactory === "__all__" ? "text-[#4A148C]" : "text-slate-950"
                    }`}
                  >
                    ทุกโรงงาน
                    {selectedFactory === "__all__" ? (
                      <span className="h-2.5 w-2.5 rounded-full bg-[#4A148C]" />
                    ) : null}
                  </button>

                  {factoryOptions.map((factory) => (
                    <button
                      key={factory}
                      type="button"
                      onClick={() => {
                        handleFactorySelect(factory);
                        closeMobileFilterDrawer();
                      }}
                      className={`flex min-h-14 w-full items-center justify-between border-b border-[#E1BEE7]/70 text-left text-base font-black ${
                        selectedFactory === factory ? "text-[#4A148C]" : "text-slate-950"
                      }`}
                    >
                      {factory}
                      {selectedFactory === factory ? (
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
                      handleBrandSelect("__all__");
                      closeMobileFilterDrawer();
                    }}
                    className={`flex min-h-14 w-full items-center justify-between border-b border-[#E1BEE7]/70 text-left text-base font-black ${
                      selectedBrand === "__all__" ? "text-[#4A148C]" : "text-slate-950"
                    }`}
                  >
                    ทั้งหมด
                    {selectedBrand === "__all__" ? (
                      <span className="h-2.5 w-2.5 rounded-full bg-[#4A148C]" />
                    ) : null}
                  </button>

                  {brandOptions.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => {
                        handleBrandSelect(b);
                        closeMobileFilterDrawer();
                      }}
                      className={`flex min-h-14 w-full items-center justify-between border-b border-[#E1BEE7]/70 text-left text-base font-black ${
                        selectedBrand === b ? "text-[#4A148C]" : "text-slate-950"
                      }`}
                    >
                      {b}
                      {selectedBrand === b ? (
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
    </>
  );
}

type StockListProps = {
  baseHref?: string;
  products: StockProductOption[];
  suppliers?: StockSupplierOption[];
  warehouses: StockWarehouseOption[];
  initialWarehouseId?: string;
  onChangeTab?: (key: "stock" | "history" | "issues") => void;
  brands?: string[];
};

type StockWarehouseOption = {
  id: string;
  name: string;
  slug: string;
};

export function StockMobileReceiveButton({ baseHref }: { baseHref: string }) {
  return (
    <Link
      href={`${baseHref}?receive=1`}
      aria-label="รับสินค้าเข้า"
      className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom)+12px)] left-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#4A148C] text-white shadow-[0_14px_32px_rgba(142, 36, 170,0.32)] transition hover:bg-[#4A148C] active:scale-95 lg:hidden"
    >
      <PackagePlus className="h-7 w-7" strokeWidth={2.4} />
    </Link>
  );
}
