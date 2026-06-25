"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  Check,
  ChevronRight,
  ClipboardList,
  History,
  Loader2,
  Lock,
  Minus,
  Package2,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  Truck,
  Unlock,
  X,
  Boxes,
} from "lucide-react";
import { useCreateOrder } from "./create-order-context";
import { getEffectiveSaleUnitCost } from "@/lib/products/sale-unit-cost";
import type { OrderCustomerOption, OrderProductOption, OrderVehicleOption } from "@/lib/orders/manage";
import { normalizeSearch } from "@/lib/utils/search";
import { useClientRole } from "@/lib/auth/client-role";
import {
  createManualOrderAction,
  fetchCustomerOrderCountsForDateAction,
  fetchCustomerLastOrderItemsAction,
  fetchCustomerPricesAction,
  upsertCustomerPricesBatchFromOrderModalAction,
} from "@/app/orders/incoming/actions";
import type { CustomerLastOrderSnapshot } from "@/app/orders/incoming/types";

import { ThaiDatePicker } from "@/components/ui/thai-date-picker";

type CartItem = {
  productId: string;
  productName: string;
  quantity: number;
  minOrderQty: number;
  saleUnitBaseQty: number;
  saleUnitId: string | null;
  saleUnitLabel: string;
  stepOrderQty: number | null;
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

type ProductSelection = {
  quantity: string;
  unitPrice: string;
  unitId: string | null;
  isPriceLocked: boolean;
};

type ProductSelectionField = keyof ProductSelection;

type ProductSelectModalProps = {
  cart: CartItem[];
  noCustomer: boolean;
  onClose: () => void;
  onConfirmMany: (
    selections: {
      product: OrderProductOption;
      unitId: string | null;
      unitLabel: string;
      baseQty: number;
      quantity: number;
      unitPrice: number;
      minOrderQty: number;
      stepOrderQty: number | null;
    }[]
  ) => Promise<void> | void;
  open: boolean;
  priceMap: Record<string, number>;
  products: OrderProductOption[];
  productsLoading: boolean;
  selectedCustomerLabel: string | null;
  selectedWarehouseId: string | null;
};

type Props = {
  autoOpen?: boolean;
  customerOrderCountsToday?: Record<string, number>;
  customers?: OrderCustomerOption[];
  products?: OrderProductOption[];
  vehicles?: OrderVehicleOption[];
  today?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  initialCustomerId?: string;
};

type ModalTab = "create" | "history";

function CreateOrderPortal({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") return null;

  return createPortal(children, document.body);
}

const codeCollator = new Intl.Collator("th", {
  numeric: true,
  sensitivity: "base",
});

function getCodeSequence(code: string) {
  const match = code.trim().match(/(\d+)/);
  return match ? Number.parseInt(match[1], 10) : Number.POSITIVE_INFINITY;
}

function compareCustomerCode(left: OrderCustomerOption, right: OrderCustomerOption) {
  const leftSequence = getCodeSequence(left.code);
  const rightSequence = getCodeSequence(right.code);

  if (leftSequence !== rightSequence) {
    return leftSequence - rightSequence;
  }

  const codeComparison = codeCollator.compare(left.code.trim(), right.code.trim());

  if (codeComparison !== 0) {
    return codeComparison;
  }

  return left.name.localeCompare(right.name, "th");
}

function ActionPopup({
  message,
  onClose,
}: {
  message: string | null;
  onClose: () => void;
}) {
  if (!message) return null;

  return (
    <div className="pointer-events-none absolute inset-x-4 top-4 z-[70] flex justify-center">
      <div
        role="alert"
        className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-amber-200 bg-white px-4 py-3 shadow-[0_14px_36px_rgba(142, 36, 170,0.18)]"
      >
        <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <AlertTriangle className="h-4 w-4" strokeWidth={2.2} />
        </span>
        <p className="min-w-0 flex-1 text-sm font-semibold leading-6 text-slate-800">{message}</p>
        <button
          type="button"
          onClick={onClose}
          className="action-touch-safe inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          aria-label="ปิดข้อความแจ้งเตือน"
        >
          <X className="h-4 w-4" strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}

function formatTHB(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatThaiShortDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) {
    return isoDate;
  }
  return `${day}/${month}/${Number(year) + 543}`;
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

const QTY_SCALE = 1000;
function toScaled(value: number) {
  return Math.round(value * QTY_SCALE);
}
function fromScaled(value: number) {
  return value / QTY_SCALE;
}
function getEffectiveStep(stepOrderQty: number | null) {
  return stepOrderQty && Number.isFinite(stepOrderQty) && stepOrderQty > 0 ? stepOrderQty : 1;
}
function normalizeToRule(value: number, minOrderQty: number, stepOrderQty: number | null) {
  const safeMin = Number.isFinite(minOrderQty) && minOrderQty > 0 ? minOrderQty : 1;
  const safeStep =
    stepOrderQty && Number.isFinite(stepOrderQty) && stepOrderQty > 0 ? stepOrderQty : null;
  if (!Number.isFinite(value)) return safeMin;

  const clamped = Math.max(value, safeMin);
  if (!safeStep) return clamped;

  const minScaled = toScaled(safeMin);
  const stepScaled = Math.max(1, toScaled(safeStep));
  const valueScaled = toScaled(clamped);
  const snapped = minScaled + Math.round((valueScaled - minScaled) / stepScaled) * stepScaled;
  return fromScaled(Math.max(minScaled, snapped));
}
function isValidByRule(value: number, minOrderQty: number, stepOrderQty: number | null) {
  const safeMin = Number.isFinite(minOrderQty) && minOrderQty > 0 ? minOrderQty : 1;
  if (!Number.isFinite(value) || value < safeMin) return false;

  const safeStep =
    stepOrderQty && Number.isFinite(stepOrderQty) && stepOrderQty > 0 ? stepOrderQty : null;
  if (!safeStep) return true;

  const offset = toScaled(value) - toScaled(safeMin);
  const stepScaled = Math.max(1, toScaled(safeStep));
  return offset % stepScaled === 0;
}
function stepByRule(
  current: number,
  direction: -1 | 1,
  minOrderQty: number,
  stepOrderQty: number | null,
) {
  const normalizedCurrent = normalizeToRule(current, minOrderQty, stepOrderQty);
  const step = getEffectiveStep(stepOrderQty);
  const nextValue = normalizedCurrent + direction * step;
  return normalizeToRule(nextValue, minOrderQty, stepOrderQty);
}

function getUnitPrice(productId: string, unitId: string | null, priceMap: Record<string, number>) {
  return priceMap[unitId ?? productId] ?? priceMap[productId] ?? 0;
}

function getDisplayStockQuantity(product: OrderProductOption, warehouseId: string | null) {
  if (!warehouseId) {
    return product.stockQuantity;
  }

  return product.warehouseStocks.find((stock) => stock.warehouseId === warehouseId)?.stockQuantity
    ?? product.stockQuantity;
}

const ProductRow = React.memo(({
  product,
  isSelected,
  onSelect,
  selection,
  onUpdateSelection,
  addedCount,
  priceMap,
  noCustomer,
  selectedWarehouseId,
}: {
  product: OrderProductOption;
  isSelected: boolean;
  onSelect: (productId: string, selected: boolean) => void;
  selection?: ProductSelection;
  onUpdateSelection: (
    productId: string,
    field: ProductSelectionField,
    value: ProductSelection[ProductSelectionField],
  ) => void;
  addedCount: number;
  priceMap: Record<string, number>;
  noCustomer: boolean;
  selectedWarehouseId: string | null;
}) => {
  const role = useClientRole();
  const units = getUnits(product);
  const unit = units.find((u) => u.id === selection?.unitId) ?? units.find((u) => u.isDefault) ?? units[0] ?? null;
  const effectiveCost = unit ? getEffectiveSaleUnitCost({
    baseCostPrice: product.baseCostPrice,
    baseUnitQuantity: unit.baseUnitQuantity,
    costMode: unit.costMode,
    fixedCostPrice: unit.fixedCostPrice,
  }) : 0;
  const currentPriceNum = selection?.unitPrice ? Number.parseFloat(selection.unitPrice) : 0;
  const isBelowCost = role !== "member" && Boolean(selection && effectiveCost > 0 && currentPriceNum > 0 && currentPriceNum < (effectiveCost - 0.001));
  const customerPrice = priceMap[unit?.id ?? product.id] ?? priceMap[product.id] ?? 0;
  const displayStockQuantity = getDisplayStockQuantity(product, selectedWarehouseId);

  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-[1.4rem] border transition-all md:rounded-[1.8rem] md:border-2 md:shadow-sm ${
        isSelected
          ? isBelowCost
            ? "border-[#FF0000]/60 bg-rose-50 ring-1 ring-[#FF0000]/10"
            : "border-[#4A148C]/40 bg-[#4A148C]/15 ring-1 ring-[#4A148C]/5"
          : "border-slate-200 bg-white hover:border-slate-300"
      } col-span-1`}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(product.id, !isSelected)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect(product.id, !isSelected);
          }
        }}
        className="relative cursor-pointer px-3 py-3 md:px-4 md:py-4"
      >
        <div className="absolute right-3 top-3 flex h-6 w-6 shrink-0 items-center justify-center md:right-4 md:top-4">
          <div className="relative flex items-center justify-center">
            <input
              type="checkbox"
              readOnly
              tabIndex={-1}
              checked={isSelected}
              className="peer pointer-events-none h-5 w-5 appearance-none rounded border-2 border-slate-300 transition-all checked:border-[#4A148C] checked:bg-[#4A148C]"
            />
            <Check className="pointer-events-none absolute h-3.5 w-3.5 scale-0 text-white transition-transform peer-checked:scale-100" strokeWidth={5} />
          </div>
        </div>

        <div className="flex flex-col items-center gap-2.5 md:flex-row md:items-center md:gap-3">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl md:h-24 md:w-24">
            {product.imageUrl ? (
              <Image
                src={product.imageUrl}
                alt={product.name}
                fill
                className="object-contain"
                sizes="(max-width: 768px) 80px, 96px"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-slate-100">
                <Package2 className="h-12 w-12" strokeWidth={1} />
              </div>
            )}
          </div>

          <div className="w-full min-w-0 text-center md:flex-1 md:text-left md:pr-12">
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
              <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13.5px] font-black shadow-sm ${
                displayStockQuantity < 0 ? "bg-[#FF0000] text-white" : "bg-[#4A148C] text-white"
              }`}>
                <Boxes className="h-3.5 w-3.5 md:h-4 md:w-4" strokeWidth={2.5} />
                สต็อก: {displayStockQuantity.toLocaleString("th-TH")} {product.unit}
              </span>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2 md:justify-start md:gap-3">
              {!noCustomer && (
                customerPrice > 0 ? (
                  <span className="inline-flex items-center rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700 ring-1 ring-inset ring-emerald-600/20 md:px-2.5 md:text-[13px]">
                    ราคา {formatTHB(customerPrice)} บ.
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-lg bg-[#FF0000] px-2 py-1 text-[11px] font-black text-white shadow-sm md:px-2.5 md:text-[13px]">
                    ยังไม่มีราคา
                  </span>
                )
              )}

              {addedCount > 0 && (
                <span className="rounded-lg bg-[#4A148C] px-2 py-1 text-[11px] font-black text-white shadow-sm md:px-2.5 md:text-[12px]">
                  ในตะกร้า {addedCount} {unit?.label}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {isSelected && selection && (
        <div className="bg-[#4A148C]/15 px-3 pb-4 pt-2 md:px-4 md:pb-4 md:pt-1">
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-[14px] font-black uppercase tracking-wider text-slate-600">
                จำนวน ({unit?.label})
              </label>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => onUpdateSelection(product.id, "quantity", String(stepByRule(Number(selection.quantity), -1, unit?.minOrderQty ?? 1, unit?.stepOrderQty ?? null)))}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-100 bg-white text-slate-700 shadow-md active:scale-90"
                >
                  <Minus className="h-6 w-6" strokeWidth={3} />
                </button>
                <input
                  type="number"
                  value={selection.quantity}
                  onChange={(e) => onUpdateSelection(product.id, "quantity", e.target.value)}
                  className="h-10 w-full min-w-0 rounded-2xl border-2 border-transparent bg-white px-2 text-center text-xl font-black text-slate-950 shadow-md outline-none focus:border-[#4A148C]/30"
                />
                <button
                  type="button"
                  onClick={() => onUpdateSelection(product.id, "quantity", String(stepByRule(Number(selection.quantity), 1, unit?.minOrderQty ?? 1, unit?.stepOrderQty ?? null)))}
                  className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-100 bg-white text-slate-700 shadow-md active:scale-90"
                >
                  <Plus className="h-6 w-6" strokeWidth={3} />
                </button>
              </div>
            </div>

            {role !== "member" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className={`text-[14px] font-black uppercase tracking-wider ${isBelowCost ? "text-[#FF0000]" : "text-slate-600"}`}>
                    ราคาต่อ{unit?.label}
                  </label>
                  {effectiveCost > 0 && (
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-black ${
                      isBelowCost
                        ? "animate-pulse border-[#FF0000] bg-white text-[#FF0000] shadow-sm"
                        : "border-slate-200 text-slate-400"
                    }`}>
                      ทุน ฿{formatTHB(effectiveCost)}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="number"
                    value={selection.unitPrice === "0" ? "" : selection.unitPrice}
                    disabled={selection.isPriceLocked}
                    onChange={(e) => onUpdateSelection(product.id, "unitPrice", e.target.value)}
                    className={`h-10 w-full rounded-2xl border-2 pl-4 pr-12 text-xl font-black shadow-md outline-none transition-all ${
                      selection.isPriceLocked
                        ? "border-transparent bg-slate-100 text-slate-400 shadow-none"
                        : "border-transparent bg-white text-slate-950 focus:border-[#4A148C]/30"
                    } ${isBelowCost ? "!border-[#FF0000] !bg-rose-50 !text-[#FF0000]" : ""}`}
                  />
                  <button
                    type="button"
                    onClick={() => onUpdateSelection(product.id, "isPriceLocked", !selection.isPriceLocked)}
                    className={`absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl transition-all active:scale-90 ${
                      selection.isPriceLocked
                        ? "text-slate-400"
                        : isBelowCost
                          ? "bg-[#FF0000] text-white"
                          : "bg-[#4A148C] text-white"
                    }`}
                  >
                    {selection.isPriceLocked ? <Lock className="h-5 w-5" /> : <Unlock className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            )}
          </div>

          {isBelowCost && (
            <div className="mt-3 flex items-center gap-3 rounded-2xl border border-white/20 bg-[#FF0000] px-4 py-3 text-[13px] font-black text-white shadow-xl shadow-rose-500/30 animate-in zoom-in-95 duration-200 md:mt-4 md:border-2 md:px-5 md:py-4 md:text-[16px] md:shadow-rose-500/40">
              <AlertTriangle className="h-6 w-6 shrink-0 text-yellow-300" strokeWidth={3} />
              <div className="min-w-0 flex-1">
                <p className="leading-tight">ราคาต่ำกว่าทุน!</p>
                <p className="mt-1 text-[13px] font-bold uppercase tracking-tight opacity-90">
                  ต้นทุนของ {unit?.label} นี้คือ ฿{formatTHB(effectiveCost)}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
ProductRow.displayName = "ProductRow";

const DesktopProductTableRow = React.memo(({
  isSelected,
  noCustomer,
  onSelect,
  onUpdateSelection,
  priceMap,
  product,
  selectedWarehouseId,
  selection,
}: {
  isSelected: boolean;
  noCustomer: boolean;
  onSelect: (productId: string, selected: boolean) => void;
  onUpdateSelection: (
    productId: string,
    field: ProductSelectionField,
    value: ProductSelection[ProductSelectionField],
  ) => void;
  priceMap: Record<string, number>;
  product: OrderProductOption;
  selectedWarehouseId: string | null;
  selection?: ProductSelection;
}) => {
  const role = useClientRole();
  const units = getUnits(product);
  const selectedUnit =
    units.find((unit) => unit.id === selection?.unitId) ??
    units.find((unit) => unit.isDefault) ??
    units[0] ??
    null;
  const stockQuantity = getDisplayStockQuantity(product, selectedWarehouseId);
  const currentPrice = selection
    ? Number(selection.unitPrice)
    : selectedUnit
      ? getUnitPrice(product.id, selectedUnit.id, priceMap)
      : 0;

  function selectRow() {
    onSelect(product.id, !isSelected);
  }

  function stopRowSelection(event: React.SyntheticEvent) {
    event.stopPropagation();
  }

  function changeUnit(unitId: string | null) {
    const unit = units.find((item) => item.id === unitId) ?? selectedUnit;
    if (!unit) return;
    const unitPrice = getUnitPrice(product.id, unit.id, priceMap);
    onUpdateSelection(product.id, "unitId", unit.id);
    onUpdateSelection(product.id, "quantity", String(unit.minOrderQty));
    onUpdateSelection(product.id, "unitPrice", unitPrice > 0 ? String(unitPrice) : "");
    onUpdateSelection(product.id, "isPriceLocked", unitPrice > 0);
  }

  function stepQuantity(direction: -1 | 1) {
    if (!selection || !selectedUnit) return;
    const current = Number(selection.quantity);
    onUpdateSelection(
      product.id,
      "quantity",
      String(
        stepByRule(
          Number.isFinite(current) ? current : selectedUnit.minOrderQty,
          direction,
          selectedUnit.minOrderQty,
          selectedUnit.stepOrderQty,
        ),
      ),
    );
  }

  return (
    <tr
      onClick={selectRow}
      className={`cursor-pointer border-b border-slate-200 transition-colors ${
        isSelected ? "bg-[#F3E5F5]/75" : "bg-white hover:bg-[#F3E5F5]/25"
      }`}
    >
      <td className="w-12 px-3 py-3 text-center">
        <span
          className={`inline-flex h-5 w-5 items-center justify-center border-2 ${
            isSelected ? "border-[#4A148C] bg-[#4A148C]" : "border-slate-300 bg-white"
          }`}
        >
          {isSelected ? <Check className="h-3.5 w-3.5 text-white" strokeWidth={4} /> : null}
        </span>
      </td>
      <td className="w-28 px-3 py-3 font-mono text-sm font-black text-[#4A148C]">
        {product.sku}
      </td>
      <td className="min-w-[18rem] px-3 py-3">
        <div className="flex items-center gap-3">
          <div className="relative h-12 w-12 shrink-0 overflow-hidden bg-slate-50">
            {product.imageUrl ? (
              <Image
                src={product.imageUrl}
                alt={product.name}
                fill
                sizes="48px"
                className="object-contain"
              />
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
              {units.length > 1 && isSelected ? (
                <select
                  value={selectedUnit?.id ?? ""}
                  onClick={stopRowSelection}
                  onChange={(event) => changeUnit(event.target.value || null)}
                  className="h-7 max-w-36 border border-[#EA80FC]/40 bg-white px-2 font-bold text-[#4A148C] outline-none"
                >
                  {units.map((unit) => (
                    <option key={unit.id ?? "__base__"} value={unit.id ?? ""}>
                      {unit.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span>{selectedUnit?.label ?? product.unit}</span>
              )}
            </div>
          </div>
        </div>
      </td>
      <td className="w-32 px-3 py-3 text-center">
        <span
          className={`text-sm font-black ${
            stockQuantity < 0 ? "text-red-600" : "text-slate-950"
          }`}
        >
          {stockQuantity.toLocaleString("th-TH")} {product.unit}
        </span>
      </td>
      <td className="w-44 px-3 py-3" onClick={stopRowSelection}>
        {isSelected && selection && selectedUnit ? (
          <div className="flex items-center justify-center gap-1.5">
            <button
              type="button"
              onClick={() => stepQuantity(-1)}
              className="flex h-8 w-8 items-center justify-center border border-[#EA80FC]/40 bg-white text-[#4A148C]"
              aria-label={`ลดจำนวน ${product.name}`}
            >
              <Minus className="h-4 w-4" strokeWidth={2.8} />
            </button>
            <input
              type="number"
              min={selectedUnit.minOrderQty}
              step={getEffectiveStep(selectedUnit.stepOrderQty)}
              value={selection.quantity}
              onChange={(event) => onUpdateSelection(product.id, "quantity", event.target.value)}
              className="h-8 w-20 border border-[#EA80FC]/40 bg-white px-2 text-center text-sm font-black text-slate-950 outline-none focus:border-[#4A148C]"
            />
            <button
              type="button"
              onClick={() => stepQuantity(1)}
              className="flex h-8 w-8 items-center justify-center border border-[#EA80FC]/40 bg-white text-[#4A148C]"
              aria-label={`เพิ่มจำนวน ${product.name}`}
            >
              <Plus className="h-4 w-4" strokeWidth={2.8} />
            </button>
          </div>
        ) : (
          <p className="text-center text-sm font-bold text-slate-400">-</p>
        )}
      </td>
      <td className="w-44 px-3 py-3" onClick={stopRowSelection}>
        {isSelected && selection && role !== "member" ? (
          <div className="relative">
            <input
              type="number"
              min="0"
              step="0.01"
              value={selection.unitPrice === "0" ? "" : selection.unitPrice}
              placeholder="ไม่มีราคา"
              onChange={(event) =>
                onUpdateSelection(product.id, "unitPrice", event.target.value)
              }
              className="h-9 w-full border border-[#EA80FC]/40 bg-white px-3 pr-10 text-right text-sm font-black text-slate-950 outline-none placeholder:text-red-500 focus:border-[#4A148C]"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-500">
              บาท
            </span>
          </div>
        ) : currentPrice > 0 ? (
          <p className="text-right text-sm font-black text-slate-950">
            {formatTHB(currentPrice)} บาท
          </p>
        ) : noCustomer ? (
          <p className="text-center text-xs font-black text-slate-400">กรุณาเลือกร้าน</p>
        ) : (
          <p className="text-center text-xs font-black text-red-600">ไม่มีราคา</p>
        )}
      </td>
    </tr>
  );
});
DesktopProductTableRow.displayName = "DesktopProductTableRow";

function ProductSelectModal({
  cart,
  noCustomer,
  onClose,
  onConfirmMany,
  open,
  priceMap,
  products,
  productsLoading,
  selectedCustomerLabel,
  selectedWarehouseId,
}: ProductSelectModalProps) {
  const role = useClientRole();
  const [query, setQuery] = useState("");
  const deferredQuery = React.useDeferredValue(query);
  const [selectedCategoryId, setSelectedCategoryId] = useState("__all__");
  const [selectedBrand, setSelectedBrand] = useState("__all__");
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selections, setSelections] = useState<Record<string, ProductSelection>>({});

  const catTabsContainerRef = useRef<HTMLDivElement>(null);
  const [catUnderlineStyle, setCatUnderlineStyle] = useState<React.CSSProperties | null>(null);
  const [displayLimit, setDisplayLimit] = useState(40);

  useEffect(() => {
    const container = catTabsContainerRef.current;
    if (!container) return;
    const timer = setTimeout(() => {
      const activeEl = container.querySelector('[data-active="true"]') as HTMLElement;
      if (activeEl) {
        setCatUnderlineStyle({
          left: `${activeEl.offsetLeft}px`,
          width: `${activeEl.offsetWidth}px`,
        });
      } else {
        setCatUnderlineStyle(null);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [selectedCategoryId, open, products]);

  useEffect(() => {
    setDisplayLimit(40);
  }, [selectedCategoryId, query]);

  const handleCategorySelect = (id: string, e: React.MouseEvent<HTMLButtonElement>) => {
    setSelectedCategoryId(id);
    setSelectedBrand("__all__");
    setCatUnderlineStyle({
      left: `${e.currentTarget.offsetLeft}px`,
      width: `${e.currentTarget.offsetWidth}px`,
    });
    e.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  };

  function handleDesktopCategorySelect(categoryId: string) {
    setSelectedCategoryId(categoryId);
    setSelectedBrand("__all__");
    setExpandedCategoryId((current) => (current === categoryId ? null : categoryId));
  }
  
  // Sync selected products' prices when customer prices load in the background
  useEffect(() => {
    if (Object.keys(priceMap).length === 0) return;
    setSelections((prev) => {
      let updated = false;
      const next = { ...prev };
      for (const productId of Object.keys(next)) {
        const sel = next[productId];
        // If the price is currently "0" or empty, and it is not manually locked
        if ((sel.unitPrice === "0" || sel.unitPrice === "") && !sel.isPriceLocked) {
          const product = products.find((p) => p.id === productId);
          if (product) {
            const units = getUnits(product);
            const unit = units.find((u) => u.id === sel.unitId) ?? units.find((u) => u.isDefault) ?? units[0] ?? null;
            const price = unit ? (priceMap[unit.id ?? product.id] ?? priceMap[product.id] ?? 0) : 0;
            if (price > 0) {
              next[productId] = {
                ...sel,
                unitPrice: String(price),
                isPriceLocked: true,
              };
              updated = true;
            }
          }
        }
      }
      return updated ? next : prev;
    });
  }, [priceMap, products]);

  const [saving, setSaving] = useState(false);
  const [popupMessage, setPopupMessage] = useState<string | null>(null);
  const [costWarningInfo, setCostWarningInfo] = useState<{ items: { name: string; cost: number; price: number }[] } | null>(null);
  const popupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showPopup = (message: string) => {
    setPopupMessage(message);
    if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
    popupTimerRef.current = setTimeout(() => setPopupMessage(null), 3000);
  };

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
      result.set(
        category.id,
        [...brands].sort((left, right) => left.localeCompare(right, "th")),
      );
    }

    return result;
  }, [categoryOptions, products]);

  const filteredProducts = useMemo(() => {
    const normalized = normalizeSearch(deferredQuery);
    const result = products.filter((product) => {
      const matchesCategory = selectedCategoryId === "__all__" || product.categoryIds.includes(selectedCategoryId);
      if (!matchesCategory) return false;
      const matchesBrand = selectedBrand === "__all__" || product.brand === selectedBrand;
      if (!matchesBrand) return false;
      if (!normalized) return true;
      return (
        normalizeSearch(product.name).includes(normalized) ||
        normalizeSearch(product.sku).includes(normalized) ||
        normalizeSearch(product.brand).includes(normalized) ||
        product.categoryNames.some(n => normalizeSearch(n).includes(normalized))
      );
    });
    return result;
  }, [products, deferredQuery, selectedBrand, selectedCategoryId]);

  const handleSelectProduct = useCallback((productId: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(productId);
      else next.delete(productId);
      return next;
    });

    if (selected && !selections[productId]) {
      const product = products.find(p => p.id === productId);
      if (product) {
        const units = getUnits(product);
        const defaultUnit = units.find(u => u.isDefault) ?? units[0] ?? null;
        const price = defaultUnit ? getUnitPrice(productId, defaultUnit.id, priceMap) : 0;
        setSelections(prev => ({
          ...prev,
          [productId]: {
            quantity: String(defaultUnit?.minOrderQty ?? 1),
            unitPrice: String(price),
            unitId: defaultUnit?.id ?? null,
            isPriceLocked: price > 0
          }
        }));
      }
    }
  }, [products, priceMap, selections]);

  const handleUpdateSelection = useCallback((
    productId: string,
    field: ProductSelectionField,
    value: ProductSelection[ProductSelectionField],
  ) => {
    setSelections(prev => ({
      ...prev,
      [productId]: { ...prev[productId], [field]: value } as ProductSelection,
    }));
  }, []);

  const handleConfirm = async (bypassWarning = false) => {
    if (selectedIds.size === 0) {
      showPopup("กรุณาเลือกสินค้าอย่างน้อย 1 รายการ");
      return;
    }

    const itemsToConfirm = [];
    const belowCostItems = [];

    for (const productId of Array.from(selectedIds)) {
      const selection = selections[productId];
      const product = products.find(p => p.id === productId);
      if (!product || !selection) continue;

      const units = getUnits(product);
      const unit = units.find(u => u.id === selection.unitId) ?? units[0] ?? null;
      if (!unit) continue;

      const quantity = Number(selection.quantity);
      const unitPrice = Number(selection.unitPrice);

      if (!Number.isFinite(quantity) || quantity <= 0) {
        showPopup(`จำนวนของ ${product.name} ต้องมากกว่า 0`);
        return;
      }
      if (!isValidByRule(quantity, unit.minOrderQty, unit.stepOrderQty)) {
        showPopup(`จำนวนของ ${product.name} ไม่ถูกต้องตามขั้นต่ำ/การเพิ่ม`);
        return;
      }
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        showPopup(`กรุณาระบุราคาของ ${product.name}`);
        return;
      }

      const effectiveCost = getEffectiveSaleUnitCost({
        baseCostPrice: product.baseCostPrice,
        baseUnitQuantity: unit.baseUnitQuantity,
        costMode: unit.costMode,
        fixedCostPrice: unit.fixedCostPrice,
      });

      // WARNING LOGIC: cost must be > 0 and price < cost (with epsilon for float safety)
      if (role !== "member" && effectiveCost > 0 && unitPrice > 0 && unitPrice < (effectiveCost - 0.001)) {
        belowCostItems.push({ name: product.name, cost: effectiveCost, price: unitPrice });
      }

      itemsToConfirm.push({
        product,
        unitId: unit.id,
        unitLabel: unit.label,
        baseQty: unit.baseUnitQuantity,
        quantity,
        unitPrice,
        minOrderQty: unit.minOrderQty,
        stepOrderQty: unit.stepOrderQty,
      });
    }

    if (belowCostItems.length > 0 && !bypassWarning) {
      setCostWarningInfo({ items: belowCostItems });
      return;
    }

    setSaving(true);
    try {
      await onConfirmMany(itemsToConfirm);
      onClose();
    } catch {
      showPopup("เกิดข้อผิดพลาดในการเพิ่มสินค้า");
    } finally {
      setSaving(false);
      setCostWarningInfo(null);
    }
  };

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelectedIds(new Set());
      setSelections({});
      setSaving(false);
      setSelectedCategoryId("__all__");
      setSelectedBrand("__all__");
      setExpandedCategoryId(null);
      setCostWarningInfo(null);
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-[#001D3F]/70 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative flex h-full w-full max-h-full flex-col overflow-hidden border-[#EA80FC]/45 bg-white shadow-[0_30px_90px_rgba(0,29,63,0.35)] sm:h-[90dvh] sm:max-h-[90dvh] sm:max-w-6xl sm:rounded-[2.5rem] sm:border">
        <ActionPopup message={popupMessage} onClose={() => setPopupMessage(null)} />
        
        {/* Cost Warning Blocking Popup */}
        {costWarningInfo && (
          <div className="absolute inset-0 z-[10010] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-[2.5rem] bg-white p-8 shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="flex flex-col items-center text-center">
                <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-rose-50 text-rose-500 shadow-inner">
                  <AlertCircle className="h-10 w-10" strokeWidth={3} />
                </div>
                <h4 className="mb-2 text-2xl font-black text-slate-900 tracking-tight">ยืนยันราคาต่ำกว่าทุน?</h4>
                <div className="mb-8 space-y-2 max-h-[120px] overflow-y-auto w-full">
                  {costWarningInfo.items.map((item, i) => (
                    <div key={i} className="rounded-2xl bg-rose-50/50 px-4 py-3 text-sm font-bold text-rose-700 text-left">
                      <p className="line-clamp-1">{item.name}</p>
                      <p className="text-[11px] font-black opacity-70 mt-0.5 uppercase tracking-tighter">ราคา ฿{formatTHB(item.price)} (ทุน ฿{formatTHB(item.cost)})</p>
                    </div>
                  ))}
                </div>
                <div className="flex w-full flex-col gap-3">
                  <button
                    onClick={() => void handleConfirm(true)}
                    className="flex h-14 w-full items-center justify-center rounded-2xl bg-rose-600 text-lg font-black text-white shadow-lg shadow-rose-600/20 transition active:scale-95"
                  >
                    ยืนยันราคาตามนี้
                  </button>
                  <button
                    onClick={() => setCostWarningInfo(null)}
                    className="flex h-14 w-full items-center justify-center rounded-2xl bg-slate-100 text-lg font-black text-slate-600 transition active:scale-95"
                  >
                    กลับไปแก้ไข
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[#EA80FC]/70 bg-[#4A148C] px-4 py-2.5 text-white sm:px-8 sm:py-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-black tracking-tight text-white sm:text-xl">เลือกสินค้าเพิ่ม</h3>
            {selectedCustomerLabel && (
              <p className="mt-0.5 truncate text-[10px] font-bold text-white/85 sm:text-xs">ร้าน: {selectedCustomerLabel}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white transition active:scale-95 sm:h-11 sm:w-11 sm:rounded-2xl"
          >
            <X className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={3} />
          </button>
        </div>

        {/* Combined Search & Category Filter */}
        <div className="shrink-0 border-b border-[#EA80FC]/15 bg-white">
          <div className="px-4 py-3.5 sm:px-8">
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
                  aria-label="ล้างคำค้นหาสินค้า"
                >
                  <X className="h-4.5 w-4.5" strokeWidth={2.5} />
                </button>
              ) : null}
            </div>
          </div>

          {/* Category filter tabs (Lineman style) */}
          <div className="border-t border-[#EA80FC]/15 bg-white px-4 sm:px-8 lg:hidden">
            <div 
              ref={catTabsContainerRef}
              className="relative flex gap-6 overflow-x-auto pt-3.5 pb-0.5 no-scrollbar scroll-smooth"
            >
              {/* Sliding Indicator Line */}
              <span
                className="absolute bottom-0 h-[3px] rounded-full bg-[#4A148C]"
                style={{
                  ...(catUnderlineStyle ?? { left: 0, width: 0 }),
                  opacity: catUnderlineStyle ? 1 : 0,
                  transition: "left 300ms cubic-bezier(0.16, 1, 0.3, 1), width 300ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms ease-in-out",
                }}
              />
              <button
                type="button"
                data-active={selectedCategoryId === "__all__"}
                onClick={(e) => handleCategorySelect("__all__", e)}
                className={`pb-2.5 text-sm font-black transition-all whitespace-nowrap tracking-wide ${
                  selectedCategoryId === "__all__"
                    ? "text-[#4A148C] scale-[1.03]"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                ทุกหมวดหมู่
              </button>
              {categoryOptions.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  data-active={selectedCategoryId === c.id}
                  onClick={(e) => handleCategorySelect(c.id, e)}
                  className={`pb-2.5 text-sm font-black transition-all whitespace-nowrap tracking-wide ${
                    selectedCategoryId === c.id
                      ? "text-[#4A148C] scale-[1.03]"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
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
                        {brands.length > 0 ? (
                          brands.map((brand) => (
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

          <section className="min-h-0 overflow-auto bg-white">
            {productsLoading ? (
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
              <table className="w-full min-w-[56rem] table-fixed border-collapse">
                <thead className="sticky top-0 z-10 bg-[#4A148C] text-white">
                  <tr>
                    <th className="w-12 px-3 py-3 text-center text-xs font-black" aria-label="เลือก" />
                    <th className="w-28 px-3 py-3 text-left text-xs font-black">รหัสสินค้า</th>
                    <th className="px-3 py-3 text-left text-xs font-black">รูปและชื่อสินค้า</th>
                    <th className="w-32 px-3 py-3 text-center text-xs font-black">สต็อก</th>
                    <th className="w-44 px-3 py-3 text-center text-xs font-black">จำนวน</th>
                    <th className="w-44 px-3 py-3 text-right text-xs font-black">ราคาขาย</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product) => (
                    <DesktopProductTableRow
                      key={product.id}
                      product={product}
                      isSelected={selectedIds.has(product.id)}
                      selection={selections[product.id]}
                      onSelect={handleSelectProduct}
                      onUpdateSelection={handleUpdateSelection}
                      priceMap={priceMap}
                      noCustomer={noCustomer}
                      selectedWarehouseId={selectedWarehouseId}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>

        {/* Mobile and portrait tablet content */}
        <div className="flex-1 overflow-y-auto bg-white lg:hidden">
          {productsLoading ? (
            <div className="flex h-64 flex-col items-center justify-center gap-4 text-slate-400">
              <Loader2 className="h-10 w-10 animate-spin" />
              <p className="text-sm font-black uppercase tracking-widest">กำลังโหลด...</p>
            </div>
          ) : products.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-4 text-slate-300">
              <Package2 className="h-16 w-16" strokeWidth={1} />
              <p className="text-lg font-black uppercase tracking-widest text-center px-6">ไม่มีข้อมูลสินค้าในระบบ</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-4 text-slate-300">
              <Search className="h-16 w-16" strokeWidth={1} />
              <p className="text-lg font-black uppercase tracking-widest text-center px-6">ไม่พบสินค้าที่ตรงกับการค้นหา</p>
            </div>
          ) : (
            <div className="space-y-4 p-3 md:space-y-0 md:p-5">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-3">
                {filteredProducts.slice(0, displayLimit).map((p) => (
                  <ProductRow
                    key={p.id}
                    product={p}
                    isSelected={selectedIds.has(p.id)}
                    onSelect={handleSelectProduct}
                    selection={selections[p.id]}
                    onUpdateSelection={handleUpdateSelection}
                    addedCount={cart.filter(item => item.productId === p.id).reduce((s, i) => s + i.quantity, 0)}
                    priceMap={priceMap}
                    noCustomer={noCustomer}
                    selectedWarehouseId={selectedWarehouseId}
                  />
                ))}
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
          )}
        </div>

        {/* Modal Footer */}
        <div className="shrink-0 border-t border-[#EA80FC]/35 bg-white px-5 py-4 pb-safe-or-4 shadow-[0_-10px_40px_rgba(142,36,170,0.10)] sm:px-8">
          <div className="flex items-center justify-between gap-6">
            <div className="min-w-0">
              <p className="mb-1 text-[10px] font-black uppercase leading-none tracking-widest text-[#4A148C]">เลือกแล้ว</p>
              <p className="text-2xl font-black text-[#4A148C] tabular-nums leading-none">{selectedIds.size} <span className="text-xs">รายการ</span></p>
            </div>
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={saving || selectedIds.size === 0}
              className="flex flex-1 items-center justify-center gap-3 rounded-2xl border border-[#EA80FC]/75 bg-[#4A148C] py-3.5 text-xl font-black text-white shadow-xl shadow-[#4A148C]/30 transition-all hover:bg-[#4A148C] disabled:opacity-40 active:scale-[0.98] lg:max-w-sm lg:flex-none lg:px-10"
            >
              {saving ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>กำลังเพิ่ม...</span>
                </>
              ) : (
                <>
                  <ShoppingCart className="h-5 w-5" strokeWidth={3} />
                  <span>เพิ่มเข้ารายการ</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

// Manual Order Creation
export function CreateOrderModal({
  autoOpen,
  customerOrderCountsToday = {},
  customers = [],
  products = [],
  vehicles = [],
  today = new Date().toISOString().split("T")[0],
  open: propOpen,
  onOpenChange,
  hideTrigger,
  initialCustomerId,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = propOpen !== undefined ? propOpen : internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const router = useRouter();
  const [isClosing, setIsClosing] = useState(false);
  const [activeTab, setActiveTab] = useState<ModalTab>("create");
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [success, setSuccess] = useState<{ deliveryNumber: string } | null>(null);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyNotice, setHistoryNotice] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [orderDate, setOrderDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [customerOrderCountsByDate, setCustomerOrderCountsByDate] =
    useState<Record<string, number>>(customerOrderCountsToday);


  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [customerPickerQuery, setCustomerPickerQuery] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | "__all__">("__all__");
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});

  const vehicleTabsContainerRef = useRef<HTMLDivElement>(null);
  const [vehicleUnderlineStyle, setVehicleUnderlineStyle] = useState<React.CSSProperties | null>(null);

  useEffect(() => {
    const container = vehicleTabsContainerRef.current;
    if (!container) return;
    const timer = setTimeout(() => {
      const activeEl = container.querySelector('[data-active="true"]') as HTMLElement;
      if (activeEl) {
        setVehicleUnderlineStyle({
          left: `${activeEl.offsetLeft}px`,
          width: `${activeEl.offsetWidth}px`,
        });
      } else {
        setVehicleUnderlineStyle(null);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [selectedVehicleId, customerPickerOpen]);

  const handleVehicleSelect = (id: string, e: React.MouseEvent<HTMLButtonElement>) => {
    setSelectedVehicleId(id);
    setVehicleUnderlineStyle({
      left: `${e.currentTarget.offsetLeft}px`,
      width: `${e.currentTarget.offsetWidth}px`,
    });
    e.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  };

  const showSubmitPopup = useCallback((message: string) => {
    setSubmitPopupMessage(message);
    if (submitPopupTimerRef.current) {
      clearTimeout(submitPopupTimerRef.current);
    }
    submitPopupTimerRef.current = setTimeout(() => setSubmitPopupMessage(null), 2800);
  }, []);

  const handleAddProductClick = useCallback(() => {
    if (!customerId) {
      showSubmitPopup("กรุณาเลือกร้านค้าก่อน");
      return;
    }
    setProductModalOpen(true);
  }, [customerId, showSubmitPopup]);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [lastOrderSnapshot, setLastOrderSnapshot] = useState<CustomerLastOrderSnapshot | null>(null);
  const [submitPopupMessage, setSubmitPopupMessage] = useState<string | null>(null);
  const [editingCartIndex, setEditingCartIndex] = useState<number | null>(null);
  const [editQty, setEditQty] = useState(1);
  const historyRequestId = useRef(0);
  const submitPopupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === customerId) ?? null,
    [customers, customerId],
  );
  const selectedCustomerOrderCount = customerId ? customerOrderCountsByDate[customerId] ?? 0 : 0;
  const orderedCustomers = useMemo(
    () => customers.toSorted(compareCustomerCode),
    [customers],
  );

  // Pre-select customer if initialCustomerId is provided
  useEffect(() => {
    if (open && initialCustomerId && !customerId) {
      void handleCustomerSelect(initialCustomerId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialCustomerId]);

  useEffect(() => {
    return () => {
      if (submitPopupTimerRef.current) {
        clearTimeout(submitPopupTimerRef.current);
      }
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (autoOpen) {
      setIsClosing(false);
      setOpen(true);
    }
  }, [autoOpen, setOpen]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const counts = await fetchCustomerOrderCountsForDateAction(orderDate);
      if (!cancelled) {
        setCustomerOrderCountsByDate(counts);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, orderDate]);

  const filteredCustomers = useMemo(() => {
    let list = orderedCustomers;
    if (selectedVehicleId !== "__all__") {
      list = list.filter((c) => c.defaultVehicleId === selectedVehicleId);
    }
    if (customerPickerQuery) {
      const n = normalizeSearch(customerPickerQuery);
      list = list.filter(
        (c) => normalizeSearch(c.name).includes(n) || normalizeSearch(c.code).includes(n),
      );
    }
    return list;
  }, [orderedCustomers, selectedVehicleId, customerPickerQuery]);

  async function loadLastOrderSnapshot(nextCustomerId: string, nextOrderDate: string) {
    if (!nextCustomerId) {
      setLastOrderSnapshot(null);
      setHistoryLoading(false);
      return null;
    }

    const requestId = ++historyRequestId.current;
    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const snapshot = await fetchCustomerLastOrderItemsAction(nextCustomerId, nextOrderDate);
      if (historyRequestId.current !== requestId) {
        return null;
      }
      setLastOrderSnapshot(snapshot);
      return snapshot;
    } catch {
      if (historyRequestId.current === requestId) {
        setHistoryError("ไม่สามารถโหลดประวัติร้านค้านี้ได้");
      }
      return null;
    } finally {
      if (historyRequestId.current === requestId) {
        setHistoryLoading(false);
      }
    }
  }

  function applyLastOrderItemsToCart(snapshot: CustomerLastOrderSnapshot | null) {
    if (!snapshot || snapshot.items.length === 0) {
      setHistoryNotice("ไม่พบรายการล่าสุดให้สั่งซ้ำ");
      return;
    }

    setCart((prev) => {
      const nextCart = [...prev];

      for (const row of snapshot.items) {
        const product = productsById.get(row.productId);
        if (!product) {
          continue;
        }
        const productUnits = getUnits(product);
        const matchedUnit =
          productUnits.find((unit) => unit.id === row.saleUnitId) ??
          productUnits.find((unit) => unit.isDefault) ??
          productUnits[0] ?? {
            minOrderQty: 1,
            stepOrderQty: null,
          };

        const resolvedUnitPrice =
          priceMap[row.saleUnitId ?? row.productId] ?? priceMap[row.productId] ?? row.unitPrice;

        const existingIndex = nextCart.findIndex(
          (item) => item.productId === row.productId && (item.saleUnitId || null) === (row.saleUnitId || null),
        );

        if (existingIndex >= 0) {
          const existingItem = nextCart[existingIndex];
          nextCart[existingIndex] = {
            ...existingItem,
            quantity: normalizeToRule(
              existingItem.quantity + row.quantity,
              existingItem.minOrderQty,
              existingItem.stepOrderQty,
            ),
            unitPrice: resolvedUnitPrice,
          };
          continue;
        }

        nextCart.push({
          productId: row.productId,
          productName: product.name,
          quantity: normalizeToRule(row.quantity, matchedUnit.minOrderQty, matchedUnit.stepOrderQty),
          minOrderQty: matchedUnit.minOrderQty,
          saleUnitBaseQty: row.saleUnitBaseQty,
          saleUnitId: row.saleUnitId,
          saleUnitLabel: row.saleUnitLabel,
          stepOrderQty: matchedUnit.stepOrderQty,
          unitPrice: resolvedUnitPrice,
        });
      }

      return nextCart;
    });

    setActiveTab("create");
    setHistoryNotice(`นำเข้ารายการล่าสุดแล้ว ${snapshot.items.length} รายการ`);
  }

  async function handleCustomerSelect(id: string) {
    setError(null);
    setHistoryNotice(null);
    setCustomerId(id);
    setActiveTab("create"); // Keep on Product List tab after selection
    setCustomerPickerOpen(false);
    setCustomerPickerQuery("");
    setPricesLoading(true);
    setHistoryError(null);
    try {
      // Ensure we have a valid date for loading snapshot
      const fetchDate = orderDate || today;

      const [prices] = await Promise.all([
        fetchCustomerPricesAction(id),
        loadLastOrderSnapshot(id, fetchDate),
      ]);
      setPriceMap(prices);
      setCart((prev) =>
        prev.map((item) => ({
          ...item,
          unitPrice:
            prices[item.saleUnitId ?? item.productId] ??
            prices[item.productId] ??
            item.unitPrice,
        })),
      );
    } catch {
      setHistoryError("โหลดข้อมูลร้านค้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setPricesLoading(false);
    }
  }

  function addManyToCart(
    selections: {
      product: OrderProductOption;
      unitId: string | null;
      unitLabel: string;
      baseQty: number;
      quantity: number;
      unitPrice: number;
      minOrderQty: number;
      stepOrderQty: number | null;
    }[]
  ) {
    const targetCustomerId = customerId;

    setCart((prev) => {
      const nextCart = [...prev];
      for (const sel of selections) {
        const existingIndex = nextCart.findIndex(
          (item) => item.productId === sel.product.id && (item.saleUnitId || null) === (sel.unitId || null),
        );
        if (existingIndex >= 0) {
          nextCart[existingIndex] = {
            ...nextCart[existingIndex],
            quantity: normalizeToRule(
              nextCart[existingIndex].quantity + sel.quantity,
              sel.minOrderQty,
              sel.stepOrderQty,
            ),
            minOrderQty: sel.minOrderQty,
            stepOrderQty: sel.stepOrderQty,
            unitPrice: sel.unitPrice,
          };
        } else {
          nextCart.push({
            productId: sel.product.id,
            productName: sel.product.name,
            quantity: sel.quantity,
            minOrderQty: sel.minOrderQty,
            saleUnitBaseQty: sel.baseQty,
            saleUnitId: sel.unitId,
            saleUnitLabel: sel.unitLabel,
            stepOrderQty: sel.stepOrderQty,
            unitPrice: sel.unitPrice,
          });
        }
      }
      return nextCart;
    });

    if (!targetCustomerId) return;

        const priceItems = selections.map((sel) => ({
      productId: sel.product.id,
      productSaleUnitId: sel.unitId,
      salePrice: sel.unitPrice,
    }));

    void upsertCustomerPricesBatchFromOrderModalAction({
      customerId: targetCustomerId,
      items: priceItems,
    }).catch((err) => {
      console.error("Background price upsert error:", err);
    });

    setPriceMap((prev) => {
      const next = { ...prev };
      for (const sel of selections) {
        const priceKey = sel.unitId ?? sel.product.id;
        next[sel.product.id] = sel.unitPrice;
        next[priceKey] = sel.unitPrice;
      }
      return next;
    });
  }

  function openCartEdit(index: number) {
    const item = cart[index];
    if (!item) return;
    setEditQty(item.quantity);
    setEditingCartIndex(index);
  }

  function confirmCartEdit() {
    if (editingCartIndex === null) return;
    const item = cart[editingCartIndex];
    if (!item) return;
    const normalized = normalizeToRule(editQty, item.minOrderQty, item.stepOrderQty);
    setCart((prev) =>
      prev.map((c, i) => (i === editingCartIndex ? { ...c, quantity: normalized } : c)),
    );
    setEditingCartIndex(null);
  }

  function removeFromCartAndClose(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
    setEditingCartIndex(null);
  }

  function resetForm() {
    historyRequestId.current += 1;
    setActiveTab("create");
    setCart([]);
    setCustomerId("");
    setCustomerPickerOpen(false);
    setCustomerPickerQuery("");
    setOrderDate(today);
    setNotes("");
    setError(null);
    setSuccess(null);
    setHistoryNotice(null);
    setPriceMap({});
    setPricesLoading(false);
    setHistoryLoading(false);
    setHistoryError(null);
    setLastOrderSnapshot(null);
    setProductModalOpen(false);
    setSubmitPopupMessage(null);
  }

  function handleClose() {
    if (!open || isClosing) return;
    setIsClosing(true);
    setCustomerPickerOpen(false);
    setProductModalOpen(false);
    setEditingCartIndex(null);
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
      setIsClosing(false);
      resetForm();
    }, 380);
  }

  function handleSubmit() {
    setError(null);


    if (!customerId) {
      showSubmitPopup("กรุณาเลือกลูกค้าก่อน");
      return;
    }
    if (cart.length === 0) {
      showSubmitPopup("กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ");
      return;
    }
    if (
      cart.some((item) => !isValidByRule(item.quantity, item.minOrderQty, item.stepOrderQty))
    ) {
      showSubmitPopup("จำนวนสินค้าบางรายการไม่ตรงตามขั้นต่ำ/จำนวนเพิ่ม กรุณาปรับใหม่ก่อนบันทึก");
      return;
    }
    if (cart.some((item) => !Number.isFinite(item.unitPrice) || item.unitPrice <= 0)) {
      showSubmitPopup("ยังมีสินค้าที่ยังไม่ตั้งราคา กรุณาใส่ราคามากกว่า 0 ก่อนบันทึกออเดอร์");
      return;
    }
    startTransition(async () => {
      const formData = new FormData();
      formData.set("customerId", customerId);
      formData.set("channel", "created");
      formData.set("orderDate", orderDate);
      formData.set("notes", notes.trim());
      formData.set("items", JSON.stringify(cart));
      const result = await createManualOrderAction(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      
      // SHOW SUCCESS OVERLAY AND RESET FORM (DON'T CLOSE)
      const resolvedDeliveryNumber =
        (result.deliveryNumber && String(result.deliveryNumber).trim()) ||
        (result.orderNumber && String(result.orderNumber).trim().startsWith("DN")
          ? String(result.orderNumber).trim()
          : "");
      if (resolvedDeliveryNumber) {
        setSuccess({ deliveryNumber: resolvedDeliveryNumber });
      } else {
        setSuccess(null);
      }
      setShowSuccessOverlay(true);
      
      // Clear overlay after 3 seconds and reset form
      setTimeout(() => {
        setShowSuccessOverlay(false);
        resetForm();
      }, 2500);
    });
  }

  const totalAmount = cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const hasUnpricedItems = cart.some(
    (item) => !Number.isFinite(item.unitPrice) || item.unitPrice <= 0,
  );
  const historyItems = lastOrderSnapshot?.items ?? [];
  const editingCartItem =
    editingCartIndex !== null ? (cart[editingCartIndex] ?? null) : null;

  return (
    <>
      {/* Trigger */}
      {!hideTrigger && (
        <button
          type="button"
          onClick={() => {
            if (closeTimerRef.current) {
              clearTimeout(closeTimerRef.current);
            }
            setIsClosing(false);
            setOpen(true);
          }}
          className="action-touch-safe inline-flex items-center justify-center gap-2 rounded-full border border-[#EA80FC]/80 bg-[#4A148C] px-4 py-2.5 text-sm font-bold text-white shadow-[0_12px_40px_rgba(142, 36, 170,0.35)] transition-all hover:scale-105 hover:bg-[#4A148C] active:scale-95 md:h-14 md:px-7 md:text-[15px]"
        >
          <Plus className="h-4.5 w-4.5 md:h-5 md:w-5" strokeWidth={3} />
          สร้างออเดอร์
        </button>
      )}

      <CreateOrderPortal>
      {/* Main modal */}
      {(open || isClosing) && (
        <div
          className={`fixed inset-0 z-[9999] flex items-center justify-center bg-[#001D3F]/70 p-0 backdrop-blur-[2px] sm:p-4 ${
            isClosing ? "animate-fade-out" : "animate-fade-in"
          }`}
        >
          <div className="absolute inset-0" onClick={handleClose} />

          <div
            className={`relative flex h-full w-full max-h-full flex-col overflow-hidden rounded-none border-[#EA80FC]/45 bg-white shadow-[0_30px_90px_rgba(0,29,63,0.35)] sm:h-[94dvh] sm:max-h-[94dvh] sm:max-w-6xl sm:rounded-[2rem] sm:border lg:h-[86dvh] lg:max-h-[86dvh] ${
              isClosing ? "animate-slide-up-premium" : "animate-slide-down-premium"
            }`}
          >
            <ActionPopup message={submitPopupMessage} onClose={() => setSubmitPopupMessage(null)} />

            {/* Premium Success Overlay */}
            {showSuccessOverlay && success && (
              <div className="absolute inset-0 z-[100] flex items-center justify-center bg-white/60 backdrop-blur-md animate-in fade-in duration-300">
                <div className="flex w-full max-w-sm flex-col items-center rounded-[2.5rem] border border-[#EA80FC]/40 bg-white p-10 text-center shadow-[0_32px_64px_rgba(0,29,63,0.18)] ring-1 ring-[#EA80FC]/20 animate-in zoom-in-95 duration-500">
                  <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full border border-[#EA80FC]/60 bg-emerald-500 text-white shadow-lg shadow-emerald-500/20">
                    <Check className="h-14 w-14" strokeWidth={4} />
                  </div>
                  <h3 className="mb-2 text-3xl font-black tracking-tight text-[#4A148C]">บันทึกสำเร็จ!</h3>
                  <div className="space-y-1 text-[#4A148C]">
                    <p className="text-sm font-bold uppercase tracking-widest opacity-80">เลขที่บิลส่งของ</p>
                    <p className="font-mono text-2xl font-black text-[#4A148C]">{success.deliveryNumber}</p>
                  </div>
                  {success.deliveryNumber && (
                    <div className="mt-4 rounded-2xl border border-[#EA80FC]/35 bg-[#F3E5F5] px-6 py-3">
                      <p className="mb-0.5 text-[10px] font-black uppercase tracking-widest text-[#4A148C]">บิลส่งของ</p>
                      <p className="font-mono text-lg font-black text-[#4A148C]">{success.deliveryNumber}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Header */}
            <div className="sticky top-0 z-40 flex shrink-0 items-center justify-between gap-3 border-b border-[#EA80FC]/70 bg-[#4A148C] px-4 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] text-white shadow-[0_10px_28px_rgba(142, 36, 170,0.20)] sm:px-5 sm:py-4 sm:pt-4">
              <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#EA80FC]/50 bg-white/10 sm:h-11 sm:w-11 sm:rounded-2xl">
                  <ShoppingCart className="h-4.5 w-4.5 text-white sm:h-5 sm:w-5" strokeWidth={2.2} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-white sm:text-lg">สร้างออเดอร์ใหม่</h2>
                  <p className="text-[10px] font-semibold text-white/85 sm:text-xs">ช่องทาง: สร้าง (โดยแอดมิน)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white active:scale-95 sm:h-11 sm:w-11 sm:rounded-2xl"
                aria-label="ปิด"
              >
                <X className="h-4.5 w-4.5 sm:h-5 sm:w-5" strokeWidth={2.2} />
              </button>
            </div>

            {/* Success banner */}
            {success && (
              <div className="shrink-0 bg-emerald-50 px-5 py-4 text-emerald-800 shadow-[inset_0_-1px_0_rgba(16,185,129,0.1)]">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
                      <Check className="h-6 w-6" strokeWidth={3} />
                    </div>
                    <div>
                      <p className="text-base font-bold leading-tight">บันทึกออเดอร์สำเร็จ!</p>
                      <p className="mt-1 text-sm font-semibold opacity-90">
                        บิลส่งของ: <span className="font-mono text-[#4A148C] font-bold">{success.deliveryNumber}</span>
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      router.push("/dashboard?date=" + orderDate + "&print=" + success.deliveryNumber);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#4A148C] px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#4A148C]"
                  >
                    <Truck className="h-3.5 w-3.5" strokeWidth={2.4} />
                    ไปที่หน้าพิมพ์
                  </button>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto">
              <div className="flex flex-col lg:grid lg:grid-cols-2 lg:divide-x lg:divide-[#EA80FC]/25">
                {/* Left Column: Customer + Date + History Tab Control */}
                <div className="flex flex-col bg-white px-4 py-5 sm:px-5">
                  <div className="space-y-6">
                    {/* Customer */}
                    <div>
                      <label className="mb-2 block text-sm font-bold text-[#4A148C]">
                        ลูกค้า <span className="text-rose-500">*</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCustomerPickerOpen(true)}
                          className={`action-touch-safe flex min-w-0 flex-1 items-center gap-3 rounded-2xl border bg-white px-4 py-3.5 text-left transition ${
                            customerId ? "border-[#EA80FC]/80 ring-2 ring-[#EA80FC]/15" : "border-[#EA80FC]/35 hover:border-[#EA80FC]/70"
                          }`}
                        >
                          <Building2 className="h-5 w-5 shrink-0 text-[#4A148C]" strokeWidth={2} />
                          <div className="min-w-0 flex-1">
                            {selectedCustomer ? (
                              <>
                                <p className="truncate text-base font-semibold text-slate-900">
                                  {selectedCustomer.name}
                                </p>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-semibold text-[#4A148C]">{selectedCustomer.code}</p>
                                  {selectedCustomerOrderCount > 0 ? (
                                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                                      สั่งแล้ววันนี้
                                      {selectedCustomerOrderCount > 1
                                        ? ` ${selectedCustomerOrderCount}`
                                        : ""}
                                    </span>
                                  ) : null}
                                </div>
                              </>
                            ) : (
                              <p className="text-base font-semibold text-[#4A148C]/75">แตะเพื่อเลือกร้านค้า</p>
                            )}
                          </div>
                          {pricesLoading ? (
                            <Loader2 className="h-4.5 w-4.5 shrink-0 animate-spin text-[#EA80FC]" />
                          ) : (
                            <ChevronRight className="h-4.5 w-4.5 shrink-0 text-[#EA80FC]" strokeWidth={2.2} />
                          )}
                        </button>
                        {customerId ? (
                          <button
                            type="button"
                            onClick={() => {
                              setCustomerId("");
                              setPriceMap({});
                              setLastOrderSnapshot(null);
                              setHistoryError(null);
                              setHistoryNotice(null);
                            }}
                            className="action-touch-safe flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#EA80FC]/35 text-[#4A148C] transition hover:bg-[#F3E5F5]"
                            aria-label="ล้างการเลือกลูกค้า"
                          >
                            <X className="h-4.5 w-4.5" strokeWidth={2.2} />
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {/* Order date */}
                    <div>
                      <label className="mb-2 block text-sm font-bold text-[#4A148C]">
                        วันที่ออเดอร์
                      </label>
                      <ThaiDatePicker
                        id="create-order-date"
                        name="orderDate"
                        value={orderDate}
                        onChange={(nextOrderDate) => {
                          setOrderDate(nextOrderDate);
                          setHistoryNotice(null);
                          if (!customerId) return;
                          void loadLastOrderSnapshot(customerId, nextOrderDate);
                        }}
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="create-order-notes"
                        className="mb-2 block text-sm font-bold text-[#4A148C]"
                      >
                        หมายเหตุ
                      </label>
                      <textarea
                        id="create-order-notes"
                        name="notes"
                        rows={3}
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        placeholder="ใส่หมายเหตุสำหรับออเดอร์นี้"
                        className="min-h-[88px] w-full resize-none rounded-2xl border border-[#EA80FC]/35 bg-white px-4 py-3 text-sm font-medium text-[#4A148C] outline-none transition placeholder:text-[#4A148C]/65 focus:border-[#EA80FC] focus:ring-2 focus:ring-[#EA80FC]/20"
                      />
                    </div>

                    {/* History Tab Toggle (Mobile only, hidden on desktop if we want both visible, but user said history on right) */}
                    <section className="overflow-hidden rounded-3xl border border-[#EA80FC]/35 bg-white shadow-sm lg:hidden">
                      <div className="grid grid-cols-2 gap-2 bg-[#F3E5F5] p-2">
                        <button
                          type="button"
                          onClick={() => setActiveTab("create")}
                          className={`inline-flex items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
                            activeTab === "create"
                              ? "bg-[#4A148C] text-white shadow-sm ring-1 ring-[#EA80FC]/45"
                              : "bg-white text-[#4A148C] hover:text-[#4A148C]"
                          }`}
                        >
                          <ClipboardList className="h-4 w-4" strokeWidth={2.2} />
                          สร้างออเดอร์
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab("history")}
                          className={`inline-flex items-center justify-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
                            activeTab === "history"
                              ? "bg-[#4A148C] text-white shadow-sm ring-1 ring-[#EA80FC]/45"
                              : "bg-white text-[#4A148C] hover:text-[#4A148C]"
                          }`}
                        >
                          <History className="h-4 w-4" strokeWidth={2.2} />
                          ประวัติร้านนี้
                        </button>
                      </div>
                    </section>

                    {/* History Section (Visible on Desktop Right, but if user wants history on right, maybe we put it there) */}
                    <div className="hidden lg:block">
                       {/* Desktop History can be placed here or in right column. 
                           User said: "Right side will be products list, add product, history"
                           So I will put History in the right column, maybe as a section or toggle.
                       */}
                    </div>
                  </div>
                </div>

                {/* Right Column: Products + History (Desktop) */}
                <div className="flex flex-col bg-[#F3E5F5]/45 px-4 py-5 sm:px-5">
                  <div className="space-y-6">
                    {historyNotice ? (
                      <div className="rounded-2xl border border-[#4A148C]/20 bg-[#4A148C]/15 px-4 py-3 text-sm font-medium text-[#4A148C]">
                        {historyNotice}
                      </div>
                    ) : null}

                    {/* Only show Create/History toggle on desktop if we want to switch views in right col */}
                    <div className="hidden lg:block">
                      <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-[#EA80FC]/25 bg-white p-1.5">
                        <button
                          type="button"
                          onClick={() => setActiveTab("create")}
                          className={`inline-flex items-center justify-center gap-2 rounded-xl py-2 text-sm font-bold transition ${
                            activeTab === "create" ? "bg-[#4A148C] text-white shadow-sm ring-1 ring-[#EA80FC]/45" : "text-[#4A148C] hover:text-[#4A148C]"
                          }`}
                        >
                          <ClipboardList className="h-4 w-4" />
                          รายการสินค้า
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveTab("history")}
                          className={`inline-flex items-center justify-center gap-2 rounded-xl py-2 text-sm font-bold transition ${
                            activeTab === "history" ? "bg-[#4A148C] text-white shadow-sm ring-1 ring-[#EA80FC]/45" : "text-[#4A148C] hover:text-[#4A148C]"
                          }`}
                        >
                          <History className="h-4 w-4" />
                          ประวัติสั่งซื้อ
                        </button>
                      </div>
                    </div>

                    {activeTab === "create" ? (
                      <section className="overflow-hidden rounded-3xl border border-[#EA80FC]/35 bg-white shadow-[0_12px_30px_rgba(142, 36, 170,0.06)]">
                        <div className="flex items-center justify-between gap-3 border-b border-[#EA80FC]/25 bg-[#F3E5F5] px-4 py-3">
                          <p className="text-xs font-black uppercase tracking-widest text-[#4A148C]">
                            รายการสินค้า
                          </p>
                          <button
                            type="button"
                            onClick={handleAddProductClick}
                            className="action-touch-safe inline-flex items-center gap-1.5 rounded-xl border border-[#EA80FC]/70 bg-[#4A148C] px-3 py-2 text-sm font-bold text-white transition hover:bg-[#4A148C] active:scale-95"
                          >
                            <Plus className="h-4 w-4" strokeWidth={2.5} />
                            เพิ่มสินค้า
                          </button>
                        </div>

                        <div className="px-2 py-4 sm:px-3">
                          {cart.length === 0 ? (
                            <button
                              type="button"
                              onClick={handleAddProductClick}
                              className="action-touch-safe flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#EA80FC]/45 bg-[#F3E5F5] px-4 py-10 text-center transition hover:border-[#EA80FC] hover:bg-[#EA80FC]/10"
                            >
                              <Package2 className="h-9 w-9 text-[#4A148C]" strokeWidth={1.8} />
                              <p className="mt-3 text-base font-bold text-[#4A148C]">
                                ยังไม่มีสินค้าในออเดอร์
                              </p>
                              <p className="mt-1 text-sm font-semibold text-[#4A148C]/70">แตะที่นี่เพื่อเพิ่มสินค้า</p>
                            </button>
                          ) : (
                            <div className="divide-y divide-[#EA80FC]/18">
                              {cart.map((item, index) => {
                                const product = productsById.get(item.productId);
                                return (
                                  <div
                                    key={`${item.productId}-${item.saleUnitId}`}
                                    className="flex items-center gap-2.5 px-2 py-3 sm:gap-3"
                                  >
                                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                                      {product?.imageUrl ? (
                                        <Image
                                          src={product.imageUrl}
                                          alt={item.productName}
                                          fill
                                          className="object-cover"
                                          sizes="48px"
                                        />
                                      ) : (
                                        <div className="flex h-full w-full items-center justify-center">
                                          <Package2 className="h-6 w-6 text-slate-300" strokeWidth={1.8} />
                                        </div>
                                      )}
                                    </div>

                                    <div className="min-w-0 flex-1">
                                      <p className="max-h-[2.8rem] overflow-hidden whitespace-normal break-words text-sm font-semibold leading-snug text-slate-900">
                                        {item.productName}
                                      </p>
                                    </div>

                                    <div className="shrink-0 text-right">
                                      <p className="whitespace-nowrap text-sm font-bold tabular-nums text-slate-900">
                                        ×{item.quantity.toLocaleString("th-TH")} {item.saleUnitLabel}
                                      </p>
                                      <p className="mt-0.5 text-xs font-semibold tabular-nums text-[#4A148C]">
                                        ฿{formatTHB(item.quantity * item.unitPrice)}
                                      </p>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => openCartEdit(index)}
                                    className="shrink-0 rounded-lg border border-[#EA80FC]/35 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#4A148C] transition hover:border-[#EA80FC] hover:bg-[#F3E5F5] hover:text-[#4A148C] active:scale-95"
                                      aria-label={`แก้ไขจำนวน ${item.productName}`}
                                    >
                                      แก้ไข
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </section>
                    ) : (
                      <section className="overflow-hidden rounded-3xl border border-[#EA80FC]/35 bg-white shadow-[0_12px_30px_rgba(142, 36, 170,0.06)]">
                        <div className="flex items-center justify-between border-b border-[#EA80FC]/25 bg-[#F3E5F5] px-4 py-3">
                          <p className="text-sm font-black text-[#4A148C]">รายการที่เคยสั่งล่าสุด</p>
                          {customerId ? (
                            <button
                              type="button"
                              onClick={() => void loadLastOrderSnapshot(customerId, orderDate)}
                              className="rounded-xl border border-[#EA80FC]/35 bg-white px-3 py-1.5 text-xs font-semibold text-[#4A148C] transition hover:text-[#4A148C]"
                            >
                              รีเฟรช
                            </button>
                          ) : null}
                        </div>

                        <div className="px-4 py-4">
                          {!customerId ? (
                            <div className="rounded-2xl border border-dashed border-[#EA80FC]/35 bg-[#F3E5F5] px-4 py-8 text-center text-sm font-semibold text-[#4A148C]">
                              กรุณาเลือกร้านค้าก่อน
                            </div>
                          ) : historyLoading ? (
                            <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-[#EA80FC]/35 bg-[#F3E5F5] px-4 py-8 text-sm font-semibold text-[#4A148C]">
                              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} />
                              กำลังโหลดประวัติการสั่งซื้อ
                            </div>
                          ) : historyError ? (
                            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                              {historyError}
                            </div>
                          ) : historyItems.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-[#EA80FC]/35 bg-[#F3E5F5] px-4 py-8 text-center text-sm font-semibold text-[#4A148C]">
                              ไม่พบประวัติการสั่งซื้อที่ผ่านมา
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <button
                                type="button"
                                onClick={() => applyLastOrderItemsToCart(lastOrderSnapshot)}
                                className="w-full rounded-2xl border border-[#EA80FC]/70 bg-[#4A148C] py-3.5 text-base font-bold text-white shadow-[0_8px_16px_rgba(142, 36, 170,0.18)] transition hover:bg-[#4A148C] active:scale-[0.98]"
                              >
                                สั่งซ้ำและกลับไปแก้รายการ
                              </button>

                              <div className="rounded-2xl border border-[#EA80FC]/30 bg-[#F3E5F5] px-4 py-3 text-sm font-semibold text-[#4A148C]">
                                วันที่อ้างอิง {formatThaiShortDate(lastOrderSnapshot?.sourceDate ?? "")}
                                <span className="mx-2 text-slate-300">|</span>
                                {lastOrderSnapshot?.orderCount ?? 0} ใบสั่งซื้อ
                              </div>

                              {historyItems.map((item) => {
                                const product = productsById.get(item.productId);
                                const name = product?.name ?? item.productId;
                                return (
                                  <div
                                    key={`${item.productId}-${item.saleUnitId ?? "__default__"}`}
                                    className="flex items-center gap-3 rounded-2xl border border-[#EA80FC]/25 bg-white px-3 py-3"
                                  >
                                    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                                      {product?.imageUrl ? (
                                        <Image
                                          src={product.imageUrl}
                                          alt={name}
                                          fill
                                          className="object-cover"
                                          sizes="44px"
                                        />
                                      ) : (
                                        <div className="flex h-full w-full items-center justify-center">
                                          <Package2 className="h-5 w-5 text-slate-400" strokeWidth={1.9} />
                                        </div>
                                      )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
                                      <p className="mt-0.5 text-xs text-slate-500">
                                        {item.quantity.toLocaleString("th-TH")} {item.saleUnitLabel} ·{" "}
                                        {formatTHB(item.unitPrice)} บาท
                                      </p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </section>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Sticky Footer */}
            <div className="sticky bottom-0 z-40 border-t border-[#EA80FC]/35 bg-white/95 px-4 pb-safe-or-5 pt-4 backdrop-blur supports-[backdrop-filter]:bg-white/90 sm:px-6">
              <div className="mx-auto max-w-6xl">
                {error && (
                  <div className="mb-4 flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500 text-xs font-bold text-white">
                      !
                    </span>
                    <p className="text-base font-medium text-rose-700">{error}</p>
                  </div>
                )}

                {hasUnpricedItems && activeTab === "create" && (
                  <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                    มีสินค้าที่ยังไม่ตั้งราคา กรุณาใส่ราคาก่อนบันทึกออเดอร์
                  </div>
                )}

                <div className="grid grid-cols-2 items-center gap-4 sm:gap-6">
                  <div className="flex flex-col justify-center">
                    <span className="text-xs font-black uppercase tracking-wider text-[#4A148C]">ยอดรวมทั้งหมด</span>
                    <span className="mt-1 text-2xl font-black tabular-nums text-[#4A148C] sm:text-3xl">
                      ฿{formatTHB(totalAmount)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={pending}
                    className="action-touch-safe flex h-14 items-center justify-center rounded-2xl border border-[#EA80FC]/75 bg-[#4A148C] px-4 py-4 text-lg font-bold text-white shadow-lg shadow-[#4A148C]/20 transition hover:bg-[#4A148C] disabled:opacity-40 active:scale-[0.98] sm:h-16 sm:text-xl"
                  >
                    {pending ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span>กำลังบันทึก...</span>
                      </div>
                    ) : (
                      "บันทึกออเดอร์"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {open && customerPickerOpen ? (
        <div className="fixed inset-0 z-[10000] flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4">
          <div className="absolute inset-0" onClick={() => setCustomerPickerOpen(false)} />
          <div className="relative flex h-full w-full max-h-full flex-col overflow-hidden rounded-none bg-white shadow-2xl sm:h-[80dvh] sm:max-w-md sm:rounded-[2rem]">
            {/* Modal Header */}
            <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-[#EA80FC]/30 bg-[#4A148C] px-5 py-4 text-white">
              <div className="min-w-0">
                <h3 className="truncate text-lg font-black tracking-wide text-white">เลือกร้านค้า</h3>
                <p className="text-[10px] font-semibold text-[#E1BEE7] mt-0.5">ค้นหาชื่อร้าน หรือรหัสร้าน</p>
              </div>
              <button
                type="button"
                onClick={() => setCustomerPickerOpen(false)}
                className="action-touch-safe flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/12 text-white/90 hover:bg-white/20 transition active:scale-95"
                aria-label="ปิดหน้าต่างเลือกร้านค้า"
              >
                <X className="h-5 w-5" strokeWidth={2.5} />
              </button>
            </div>

            {/* Search Input */}
            <div className="shrink-0 border-b border-[#EA80FC]/15 px-4 py-3.5 bg-white">
              <div className="flex items-center gap-3 rounded-2xl border border-[#EA80FC]/35 bg-[#F3E5F5]/25 px-4 py-3 transition focus-within:border-[#4A148C] focus-within:ring-2 focus-within:ring-[#4A148C]/10">
                <Search className="h-5 w-5 shrink-0 text-[#4A148C]" strokeWidth={2.4} />
                <input
                  type="text"
                  value={customerPickerQuery}
                  onChange={(e) => setCustomerPickerQuery(e.target.value)}
                  placeholder="ค้นหาชื่อร้าน หรือรหัสร้าน..."
                  className="min-w-0 flex-1 bg-transparent text-base font-semibold text-[#4A148C] outline-none placeholder:text-[#4A148C]/50"
                />
                {customerPickerQuery ? (
                  <button
                    type="button"
                    onClick={() => setCustomerPickerQuery("")}
                    className="action-touch-safe text-[#4A148C]/70 transition hover:text-[#4A148C]"
                    aria-label="ล้างคำค้นหาร้านค้า"
                  >
                    <X className="h-4.5 w-4.5" strokeWidth={2.5} />
                  </button>
                ) : null}
              </div>
            </div>

            {/* Vehicle filter tabs (Lineman style) */}
            <div className="shrink-0 border-b border-[#EA80FC]/15 bg-white">
              <div 
                ref={vehicleTabsContainerRef}
                className="relative flex gap-6 overflow-x-auto px-4 pt-3.5 pb-0.5 no-scrollbar scroll-smooth"
              >
                {/* Sliding Indicator Line */}
                <span
                  className="absolute bottom-0 h-[3px] rounded-full bg-[#4A148C]"
                  style={{
                    ...(vehicleUnderlineStyle ?? { left: 0, width: 0 }),
                    opacity: vehicleUnderlineStyle ? 1 : 0,
                    transition: "left 300ms cubic-bezier(0.16, 1, 0.3, 1), width 300ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms ease-in-out",
                  }}
                />
                <button
                  type="button"
                  data-active={selectedVehicleId === "__all__"}
                  onClick={(e) => handleVehicleSelect("__all__", e)}
                  className={`pb-2.5 text-sm font-black transition-all whitespace-nowrap tracking-wide ${
                    selectedVehicleId === "__all__"
                      ? "text-[#4A148C] scale-[1.03]"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  ร้านทั้งหมด
                </button>
                {vehicles.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    data-active={selectedVehicleId === v.id}
                    onClick={(e) => handleVehicleSelect(v.id, e)}
                    className={`pb-2.5 text-sm font-black transition-all whitespace-nowrap tracking-wide ${
                      selectedVehicleId === v.id
                        ? "text-[#4A148C] scale-[1.03]"
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    {v.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Customer List */}
            <div className="flex-1 overflow-y-auto bg-slate-50/50 px-4 py-4">
              {filteredCustomers.length === 0 ? (
                <div className="flex h-full min-h-[14rem] flex-col items-center justify-center rounded-[2rem] border border-dashed border-[#EA80FC]/30 bg-[#F3E5F5]/10 px-4 text-center">
                  <Building2 className="h-10 w-10 text-[#4A148C]/40" strokeWidth={1.8} />
                  <p className="mt-3 text-sm font-bold text-[#4A148C]">ไม่พบร้านค้าที่ค้นหา</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredCustomers.map((customer) => {
                    const isSelected = customer.id === customerId;
                    const orderCountToday = customerOrderCountsByDate[customer.id] ?? 0;
                    
                    return (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => void handleCustomerSelect(customer.id)}
                        className={`action-touch-safe flex w-full items-center gap-3.5 rounded-2xl border px-4 py-3.5 text-left transition ${
                          isSelected
                            ? "border-[#EA80FC] bg-[#4A148C]/[0.06] shadow-sm shadow-[#4A148C]/5"
                            : "border-slate-200 bg-white hover:bg-slate-50/50"
                        }`}
                      >
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${
                          isSelected ? "bg-[#4A148C] text-white" : "bg-[#F3E5F5]/60 text-[#4A148C]"
                        }`}>
                          <Building2 className="h-5 w-5" strokeWidth={2} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-base font-bold leading-snug text-slate-900">{customer.name}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-[11px] font-bold text-slate-500">{customer.code}</span>
                            {orderCountToday > 0 ? (
                              <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 border border-emerald-200">
                                สั่งแล้ววันนี้{orderCountToday > 1 ? ` ${orderCountToday}` : ""}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="shrink-0">
                          {isSelected ? (
                            <div className="flex h-5.5 w-5.5 items-center justify-center rounded-full bg-[#4A148C] text-white shadow-sm shadow-[#4A148C]/30 animate-in zoom-in duration-200">
                              <Check className="h-3.5 w-3.5" strokeWidth={3.5} />
                            </div>
                          ) : (
                            <div className="h-5.5 w-5.5 rounded-full border border-slate-300 bg-white" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {open && editingCartItem && editingCartIndex !== null ? (
        <CreateOrderPortal>
        <div className="fixed inset-0 z-[10020] flex items-center justify-center bg-slate-950/55 p-4">
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => setEditingCartIndex(null)}
            aria-label="ปิดหน้าต่างแก้ไขจำนวน"
          />
          <div className="relative w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl">
            <div className="mb-3">
              <p className="text-sm font-bold text-slate-950">แก้ไขจำนวนสินค้า</p>
              <p className="mt-1 line-clamp-2 text-sm text-slate-500">{editingCartItem.productName}</p>
              <p className="text-xs text-slate-400">{editingCartItem.saleUnitLabel}</p>
            </div>

            <div className="mb-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  setEditQty((current) =>
                    stepByRule(
                      current,
                      -1,
                      editingCartItem.minOrderQty,
                      editingCartItem.stepOrderQty,
                    ),
                  )
                }
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 active:scale-95"
                aria-label="ลดจำนวนสินค้า"
              >
                <Minus className="h-4.5 w-4.5" strokeWidth={2.4} />
              </button>
              <div className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 py-2 text-center">
                <p className="text-xl font-bold tabular-nums text-slate-900">
                  {editQty.toLocaleString("th-TH")}
                </p>
                <p className="text-[11px] text-slate-500">{editingCartItem.saleUnitLabel}</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setEditQty((current) =>
                    stepByRule(
                      current,
                      1,
                      editingCartItem.minOrderQty,
                      editingCartItem.stepOrderQty,
                    ),
                  )
                }
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 active:scale-95"
                aria-label="เพิ่มจำนวนสินค้า"
              >
                <Plus className="h-4.5 w-4.5" strokeWidth={2.4} />
              </button>
            </div>

            <p className="mb-4 text-xs text-slate-500">
              {editingCartItem.stepOrderQty
                ? `เริ่มที่ ${editingCartItem.minOrderQty} และเพิ่มทีละ ${editingCartItem.stepOrderQty}`
                : `ขั้นต่ำ ${editingCartItem.minOrderQty}`}
            </p>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => removeFromCartAndClose(editingCartIndex)}
                className="inline-flex items-center justify-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2 py-2.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 active:scale-95"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={2.2} />
                ลบ
              </button>
              <button
                type="button"
                onClick={() => setEditingCartIndex(null)}
                className="rounded-xl border border-slate-200 px-2 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-95"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={confirmCartEdit}
                className="rounded-xl bg-[#4A148C] px-2 py-2.5 text-xs font-bold text-white transition hover:bg-[#4A148C] active:scale-95"
              >
                ยืนยัน
              </button>
            </div>
          </div>
        </div>
        </CreateOrderPortal>
      ) : null}

      <ProductSelectModal
        cart={cart}
        noCustomer={!customerId}
        onClose={() => setProductModalOpen(false)}
        onConfirmMany={addManyToCart}
        open={productModalOpen}
        priceMap={priceMap}
        products={products}
        productsLoading={pricesLoading}
        selectedCustomerLabel={
          selectedCustomer ? `${selectedCustomer.code} ${selectedCustomer.name}` : null
        }
        selectedWarehouseId={selectedCustomer?.defaultWarehouseId ?? null}
      />
      </CreateOrderPortal>
    </>
  );
}

export function GlobalCreateOrderModal() {
  const { isOpen, close, data, isLoading, initialCustomerId } = useCreateOrder();

  if (!isOpen) return null;

  if (!data) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 p-4">
        <button
          type="button"
          className="absolute inset-0"
          aria-label="ปิดหน้าต่างสร้างออเดอร์"
          onClick={close}
        />
        <div className="relative w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-[#4A148C]" />
          <p className="text-base font-bold text-slate-950">กำลังเตรียมข้อมูลสร้างออเดอร์</p>
          <p className="mt-1 text-sm font-medium text-slate-600">
            {isLoading ? "กรุณารอสักครู่" : "กำลังโหลดข้อมูลร้านค้าและสินค้า"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <CreateOrderModal
      open={isOpen}
      onOpenChange={(open) => !open && close()}
      customers={data.customers}
      products={data.products}
      vehicles={data.vehicles}
      today={data.today}
      customerOrderCountsToday={{}}
      hideTrigger={true}
      initialCustomerId={initialCustomerId}
    />
  );
}
