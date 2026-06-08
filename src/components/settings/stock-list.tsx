"use client";

import React, { memo, useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Boxes, Package2, Plus, ClipboardEdit, Coins, Wallet, Warehouse, Search, PackagePlus } from "lucide-react";
import { MobileSearchDrawer } from "@/components/mobile-search/mobile-search-drawer";
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

function getDefaultUnit(product: StockProductOption) {
  return product.saleUnits.find((unit) => unit.isDefault) || product.saleUnits[0];
}

function getDisplayStock(product: StockProductOption, warehouseId: string): DisplayStock {
  const defaultUnit = getDefaultUnit(product);
  const warehouseStock = warehouseId === "all"
    ? null
    : product.warehouseStocks.find((stock) => stock.warehouseId === warehouseId);
  const onHandQuantity = warehouseId === "all"
    ? product.onHandQuantity
    : (warehouseStock?.onHandQuantity ?? 0);
  const reservedQuantity = warehouseId === "all"
    ? product.reservedQuantity
    : (warehouseStock?.reservedQuantity ?? 0);

  return {
    onHandQuantity,
    reservedQuantity,
    stockValue: onHandQuantity * (defaultUnit?.effectiveCostPrice ?? 0),
  };
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
  selectedWarehouseName,
  onAdjust
}: { 
  product: StockProductOption; 
  displayStock: DisplayStock;
  selectedWarehouseName: string;
  onAdjust: (productId: string) => void;
}) => {
  const defaultUnit = getDefaultUnit(product);

  return (
    <article
      className={`border-b border-slate-300 bg-white px-5 py-6 shadow-[0_4px_20px_rgba(15,23,42,0.08)] last:border-b-0 ${
        product.isActive ? "" : "opacity-70"
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Product Image */}
        <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.name}
              fill
              sizes="96px"
              className="object-contain"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-2xl bg-slate-50">
              <Package2 className="h-10 w-10 text-slate-300" strokeWidth={1.5} />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-1">
            <p className="line-clamp-2 text-[1.25rem] font-black leading-[1.2] text-slate-950">
              {product.name}
            </p>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold tracking-tight text-slate-500 uppercase">
                {product.sku}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-tight shadow-sm ring-1 ring-inset ${
                  product.isActive
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                    : "bg-slate-50 text-slate-600 ring-slate-500/20"
                }`}
              >
                {product.isActive ? "พร้อมขาย" : "ปิดใช้งาน"}
              </span>
            </div>
            <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-[#FAF7F2] px-2.5 py-1 text-[11px] font-black text-[#082A63]">
              <Warehouse className="h-3.5 w-3.5" strokeWidth={2.5} />
              {selectedWarehouseName}
            </span>
          </div>
        </div>
      </div>

      {/* Modern 2x2 Grid for Stock Data */}
      <div className="mt-6 grid grid-cols-2 border-t border-slate-200 pt-5">
        {/* Current Stock */}
        <div className="space-y-1 border-r border-b border-slate-200 pb-4 pr-4">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Boxes className="h-3.5 w-3.5" strokeWidth={2.5} />
            <p className="text-[10px] font-black uppercase tracking-widest">คงเหลือปัจจุบัน</p>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-[1.5rem] font-black tracking-tight ${displayStock.onHandQuantity < 0 ? 'text-rose-600' : 'text-[#082A63]'}`}>
              {formatQuantity(displayStock.onHandQuantity)}
            </span>
            <span className="text-[0.9rem] font-bold text-slate-500">{product.unit}</span>
          </div>
        </div>

        {/* Cost per Unit */}
        <div className="space-y-1 border-b border-slate-200 pb-4 pl-4">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Coins className="h-3.5 w-3.5" strokeWidth={2.5} />
            <p className="text-[10px] font-black uppercase tracking-widest">ต้นทุน / {defaultUnit?.label ?? product.unit}</p>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-[1.5rem] font-black tracking-tight text-[#082A63]">
              ฿{formatMoney(defaultUnit?.effectiveCostPrice ?? 0)}
            </span>
          </div>
        </div>

        {/* Total Value */}
        <div className="space-y-1 border-r border-slate-200 pt-4 pr-4">
          <div className="flex items-center gap-1.5 text-slate-400">
            <Wallet className="h-3.5 w-3.5" strokeWidth={2.5} />
            <p className="text-[10px] font-black uppercase tracking-widest">มูลค่าสต็อกรวม</p>
          </div>
          <div className="flex items-baseline gap-1">
            <span className={`text-[1.35rem] font-black tracking-tight ${displayStock.stockValue < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
              ฿{formatMoney(displayStock.stockValue)}
            </span>
          </div>
        </div>

        {/* Adjust Button Section */}
        <div className="flex items-end justify-end pt-4 pl-4">
          <button
            type="button"
            onClick={() => onAdjust(product.id)}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#082A63] px-4 text-xs font-black text-white shadow-lg shadow-[#082A63]/20 transition active:scale-95"
          >
            <ClipboardEdit className="h-4 w-4" strokeWidth={2.5} />
            ปรับยอด
          </button>
        </div>
      </div>
    </article>
  );
});
MobileStockCard.displayName = "MobileStockCard";

const DesktopStockRow = memo(({ 
  product, 
  displayStock,
  selectedWarehouseName,
  onAdjust
}: { 
  product: StockProductOption; 
  displayStock: DisplayStock;
  selectedWarehouseName: string;
  onAdjust: (productId: string) => void;
}) => {
  return (
    <tr className="hover:bg-slate-50 transition-colors group">
      <td className="whitespace-nowrap border-b border-l border-r border-slate-300 px-5 py-4 text-center font-mono font-bold text-slate-500 uppercase tracking-tight align-middle">
        {product.sku}
      </td>
      <td className="border-b border-r border-slate-300 px-5 py-4 align-middle">
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
            <p className="line-clamp-2 text-[15px] font-black leading-tight text-slate-900 group-hover:text-[#082A63]">
              {product.name}
            </p>
            <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#FAF7F2] px-2 py-0.5 text-[10px] font-black text-[#082A63]">
              <Warehouse className="h-3 w-3" strokeWidth={2.4} />
              {selectedWarehouseName}
            </p>
          </div>
        </div>
      </td>
      <td className="whitespace-nowrap border-b border-r border-slate-300 px-5 py-4 text-center text-base font-medium text-slate-600 align-middle">
        {product.unit}
      </td>
      <td className="whitespace-nowrap border-b border-r border-slate-300 px-5 py-4 text-center align-middle">
        <div className="flex flex-col gap-1">
          {product.saleUnits.length > 0 ? (
            product.saleUnits.map((unit) => (
              <div key={unit.id} className="flex items-center justify-center">
                <span className="text-sm font-bold text-slate-700">
                  ฿{formatMoney(unit.effectiveCostPrice)}
                </span>
              </div>
            ))
          ) : (
            <div className="flex items-center justify-center">
              <span className="text-sm font-bold text-slate-700">
                ฿{formatMoney(product.costPrice ?? 0)}
              </span>
            </div>
          )}
        </div>
      </td>
      <td className="whitespace-nowrap border-b border-r border-slate-300 px-5 py-4 text-center align-middle">
        <div className="flex flex-col items-center gap-1">
          <span className={`text-base font-bold ${displayStock.onHandQuantity < 0 ? 'text-rose-700' : 'text-[#082A63]'}`}>
            {formatQuantity(displayStock.onHandQuantity)}
          </span>
          <button
            type="button"
            onClick={() => onAdjust(product.id)}
            className="p-1 text-[#103B82] hover:text-[#082A63] transition-colors"
            title="ปรับปรุงยอด"
          >
            <ClipboardEdit className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>
      </td>
      <td className="whitespace-nowrap border-b border-r border-slate-300 px-5 py-4 text-center align-middle">
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-base font-bold text-slate-900">
            ฿{formatMoney(displayStock.stockValue)}
          </span>
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">VALUE</span>
        </div>
      </td>
    </tr>
  );
});
DesktopStockRow.displayName = "DesktopStockRow";

// ─── Main Component ──────────────────────────────────────────────────────────

export function StockList({ products, suppliers = [], warehouses, baseHref = "/stock", onChangeTab }: StockListProps) {
  const searchParams = useSearchParams();

  // Local state for immediate UI response
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustProductId, setAdjustProductId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("all");

  const selectedWarehouseName = selectedWarehouseId === "all"
    ? "ทุกคลัง"
    : (warehouses.find((warehouse) => warehouse.id === selectedWarehouseId)?.name ?? "คลังสินค้า");

  const selectedFormWarehouseId = selectedWarehouseId === "all" ? "" : selectedWarehouseId;
  const filteredProducts = products.filter((product) => {
    const query = normalizeSearch(searchQuery);
    if (!query) return true;

    return (
      normalizeSearch(product.name).includes(query) ||
      normalizeSearch(product.sku).includes(query) ||
      normalizeSearch(product.unit).includes(query)
    );
  });

  const warehouseOptions = [
    { id: "all", name: "ทุกคลัง", subtitle: "ดูยอดรวมทั้งหมด" },
    ...warehouses.map((warehouse) => ({
      id: warehouse.id,
      name: warehouse.name,
      subtitle: warehouse.slug,
    })),
  ];

  // Sync with URL on mount only (or when URL changes externally)
  useEffect(() => {
    const receive = searchParams.get("receive") === "1";
    const adjust = searchParams.get("adjust") === "1";
    const product = searchParams.get("product") || "";
    const warehouse = searchParams.get("warehouse") || "all";

    // eslint-disable-next-line react-hooks/set-state-in-effect -- Initial sync with URL params
    setSelectedWarehouseId(
      warehouse !== "all" && warehouses.some((item) => item.id === warehouse)
        ? warehouse
        : "all",
    );
    if (receive) setReceiveOpen(true);
    if (adjust) {
      setAdjustOpen(true);
      if (product) setAdjustProductId(product);
    }
  }, [searchParams, warehouses]);

  const buildCurrentUrl = (params: Record<string, string> = {}) => {
    const nextParams: Record<string, string> = {};
    if (selectedWarehouseId !== "all") {
      nextParams.warehouse = selectedWarehouseId;
    }

    return buildUrl(baseHref, { ...nextParams, ...params });
  };

  const handleWarehouseChange = (warehouseId: string) => {
    setSelectedWarehouseId(warehouseId);
    const params: Record<string, string> = warehouseId === "all" ? {} : { warehouse: warehouseId };
    window.history.pushState({}, "", buildUrl(baseHref, params));
  };

  const handleAdjust = (productId: string) => {
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
      selectedWarehouseId === "all" ? baseHref : buildUrl(baseHref, { warehouse: selectedWarehouseId }),
    );
  };

  return (
    <>
      <div className="sticky top-0 z-40 -mx-3 mb-4 hidden border-b border-[#E8DCC7] bg-white/95 px-4 py-3 shadow-[0_10px_30px_rgba(31,42,68,0.08)] backdrop-blur lg:block">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-lg font-black text-[#082A63]">จัดการสต็อก</p>
              <p className="text-xs font-semibold text-[#667085]">
                แสดง {filteredProducts.length.toLocaleString("th-TH")} จาก {products.length.toLocaleString("th-TH")} รายการ
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReceive}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#082A63] px-4 text-sm font-bold text-white shadow-[0_12px_26px_rgba(8,42,99,0.22)] transition hover:bg-[#103B82] active:scale-[0.98]"
              >
                <Plus className="h-4.5 w-4.5" strokeWidth={2.4} />
                รับสินค้าเข้า
              </button>
              <button
                type="button"
                onClick={() => handleAdjust("")}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-[#082A63]/20 bg-white px-4 text-sm font-bold text-[#082A63] transition hover:border-[#082A63] hover:bg-[#082A63]/[0.04] active:scale-[0.98]"
              >
                <ClipboardEdit className="h-4.5 w-4.5" strokeWidth={2.2} />
                ปรับปรุงสต็อก
              </button>
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-[minmax(18rem,1fr)_18rem] xl:items-center">
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

            <label className="block">
              <span className="sr-only">เลือกคลัง</span>
              <select
                value={selectedWarehouseId}
                onChange={(event) => handleWarehouseChange(event.target.value)}
                className="h-12 w-full rounded-lg border border-[#D7DEE8] bg-white px-4 text-sm font-bold text-[#1F2A44] outline-none focus:border-[#082A63] focus:ring-2 focus:ring-[#082A63]/15"
              >
                {warehouseOptions.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      <StockTabs current="stock" onChangeTab={onChangeTab} />

      <MobileSearchDrawer title="ค้นหาสต็อก">
        <div className="space-y-4">
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

          <label className="block">
            <span className="mb-1.5 block text-xs font-black uppercase tracking-widest text-slate-500">
              เลือกคลัง
            </span>
            <select
              value={selectedWarehouseId}
              onChange={(event) => handleWarehouseChange(event.target.value)}
              className="h-12 w-full rounded-lg border border-[#D7DEE8] bg-white px-4 text-sm font-bold text-[#1F2A44] outline-none focus:border-[#082A63] focus:ring-2 focus:ring-[#082A63]/15"
            >
              {warehouseOptions.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => handleAdjust("")}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-[#082A63]/20 bg-white px-4 text-sm font-bold text-[#082A63] transition active:scale-[0.98]"
          >
            <ClipboardEdit className="h-4.5 w-4.5" strokeWidth={2.2} />
            ปรับยอด
          </button>
        </div>
      </MobileSearchDrawer>

      <button
        type="button"
        onClick={handleReceive}
        aria-label="รับสินค้าเข้า"
        className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom)+12px)] left-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#082A63] text-white shadow-[0_14px_32px_rgba(8,42,99,0.32)] transition active:scale-95 lg:hidden"
      >
        <PackagePlus className="h-7 w-7" strokeWidth={2.4} />
      </button>

      <SettingsPanel>
        <SettingsPanelBody className="p-0">
          {filteredProducts.length > 0 ? (
            <>
              {/* Mobile Cards */}
              <div className="grid gap-0 lg:hidden">
                {filteredProducts.map((product) => {
                  const displayStock = getDisplayStock(product, selectedWarehouseId);

                  return (
                    <MobileStockCard
                      key={product.id}
                      product={product}
                      displayStock={displayStock}
                      selectedWarehouseName={selectedWarehouseName}
                      onAdjust={handleAdjust}
                    />
                  );
                })}
              </div>

              {/* Desktop Table */}
              <div className="hidden overflow-x-auto lg:block">
                <table className="min-w-full border-collapse border border-slate-300 text-sm">
                  <thead>
                    <tr style={{ backgroundColor: "#082A63" }}>
                      {[
                        "รหัสสินค้า",
                        "ชื่อสินค้า",
                        "หน่วย",
                        "ต้นทุน / หน่วย",
                        "คงเหลือ",
                        "มูลค่าสต็อก",
                      ].map((label, i, arr) => (
                        <th
                          key={label}
                          className={[
                            "whitespace-nowrap px-5 py-4 text-center text-base font-bold text-white",
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
      {receiveOpen && (
        <StockReceiveForm
          products={products}
          suppliers={suppliers}
          warehouses={warehouses}
          returnHref={baseHref}
          defaultWarehouseId={selectedFormWarehouseId}
          onClose={closeModals}
        />
      )}

      {adjustOpen && (
        <StockAdjustForm
          products={products}
          warehouses={warehouses}
          returnHref={baseHref}
          defaultProductId={adjustProductId}
          defaultWarehouseId={selectedFormWarehouseId}
          onClose={closeModals}
        />
      )}
    </>
  );
}

type StockListProps = {
  baseHref?: string;
  products: StockProductOption[];
  suppliers?: StockSupplierOption[];
  warehouses: StockWarehouseOption[];
  onChangeTab?: (key: "stock" | "history" | "issues") => void;
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
      className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom)+12px)] left-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#082A63] text-white shadow-[0_14px_32px_rgba(8,42,99,0.32)] transition hover:bg-[#103B82] active:scale-95 lg:hidden"
    >
      <PackagePlus className="h-7 w-7" strokeWidth={2.4} />
    </Link>
  );
}
