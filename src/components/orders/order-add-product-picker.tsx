"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  Check,
  Minus,
  Package2,
  Plus,
  Search,
  ShoppingBag,
  X,
} from "lucide-react";
import { fetchCustomerPricesAction } from "@/app/orders/incoming/actions";
import { getEffectiveSaleUnitCost } from "@/lib/products/sale-unit-cost";
import type { OrderProductOption } from "@/lib/orders/manage";
import { normalizeSearch } from "@/lib/utils/search";

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
      label: unit.label,
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

export function OrderAddProductPicker({
  addedItems,
  customerId,
  onAddMany,
  products,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [priceMap, setPriceMap] = useState<Record<string, number>>({});
  const [selections, setSelections] = useState<Record<string, SelectionDraft>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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

  const filteredProducts = useMemo(() => {
    const normalized = normalizeSearch(query);
    const source = normalized
      ? products.filter((product) => {
          return (
            normalizeSearch(product.name).includes(normalized) ||
            normalizeSearch(product.sku).includes(normalized) ||
            product.categoryNames.some((category) => normalizeSearch(category).includes(normalized))
          );
        })
      : products;

    return source.slice(0, 50);
  }, [products, query]);

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

      return {
        ...current,
        [product.id]: {
          price: String(getUnitPrice(product.id, defaultUnit.id, priceMap)),
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
    updateSelection(product.id, () => ({
      price: String(getUnitPrice(product.id, unit.id, priceMap)),
      quantity: unit.minOrderQty,
      unitId: unit.id,
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
    const price = Number(draft.price);
    if (!unit) return "ไม่พบหน่วยขาย";
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

        return {
          imageUrl: product.imageUrl,
          key: `${product.id}:${unit.id ?? "base"}:${crypto.randomUUID()}`,
          productId: product.id,
          productName: product.name,
          productSaleUnitId: unit.id,
          quantity: draft.quantity,
          sku: product.sku,
          unitLabel: unit.label,
          unitPrice: Number(draft.price),
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
    setOpen(false);
    setQuery("");
    setSelections({});
    setError(null);
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
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#003366] text-white">
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
          <Plus className="h-5 w-5 shrink-0 text-[#003366]" />
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-4">
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => setOpen(false)}
            aria-label="ปิดหน้าต่างเพิ่มสินค้า"
          />
          <div className="relative flex h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-[2rem] bg-white shadow-2xl sm:h-[86dvh] sm:max-w-[calc(100vw-2rem)] sm:rounded-[2rem]">
            <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:px-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#003366]/8 text-[#003366]">
                <ShoppingBag className="h-5 w-5" strokeWidth={2.3} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold text-slate-950">เพิ่มสินค้าใหม่</h3>
                <p className="mt-0.5 text-xs font-medium text-slate-500">
                  เลือกแล้ว {selectedCount.toLocaleString("th-TH")} รายการ
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 active:scale-95"
                aria-label="ปิด"
              >
                <X className="h-5 w-5" strokeWidth={2.2} />
              </button>
            </div>

            <div className="shrink-0 border-b border-slate-100 px-4 py-3 sm:px-5">
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 transition focus-within:border-[#003366]/60 focus-within:bg-white focus-within:ring-2 focus-within:ring-[#003366]/10">
                <Search className="h-5 w-5 shrink-0 text-slate-400" strokeWidth={2.1} />
                <input
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="ค้นหาสินค้า SKU หรือหมวดหมู่"
                  className="min-w-0 flex-1 bg-transparent text-base text-slate-800 outline-none placeholder:text-slate-400"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="text-slate-400 transition hover:text-slate-600"
                    aria-label="ล้างคำค้นหา"
                  >
                    <X className="h-4 w-4" strokeWidth={2.1} />
                  </button>
                ) : null}
              </label>
            </div>

            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-3 sm:px-5">
              {error ? (
                <div className="mb-3 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.2} />
                  <p>{error}</p>
                </div>
              ) : null}

              <div className="grid gap-3 lg:grid-cols-2">
                {filteredProducts.map((product) => {
                  const draft = selections[product.id];
                  const units = getUnits(product);
                  const selectedUnit =
                    units.find((unit) => unit.id === draft?.unitId) ?? getDefaultUnit(product);
                  const issue = draft ? getSelectionIssue(product, draft) : null;
                  const cost = selectedUnit
                    ? getEffectiveSaleUnitCost({
                        baseCostPrice: product.baseCostPrice,
                        baseUnitQuantity: selectedUnit.baseUnitQuantity,
                        costMode: selectedUnit.costMode,
                        fixedCostPrice: selectedUnit.fixedCostPrice,
                      })
                    : 0;

                  const currentPriceNum = draft?.price ? Number.parseFloat(draft.price) : 0;
                  const isBelowCost = draft && cost > 0 && currentPriceNum > 0 && currentPriceNum < (cost - 0.001);

                  return (
                    <div
                      key={product.id}
                      className={`min-w-0 rounded-[1.8rem] border transition-all ${
                        draft
                          ? isBelowCost ? "border-[#FF0000] bg-rose-50 shadow-lg" : "border-[#003366]/40 bg-[#003366]/5 shadow-md"
                          : "border-slate-200 bg-white shadow-sm"
                      } p-4`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleProduct(product)}
                        className="flex w-full min-w-0 items-start gap-4 text-left"
                      >
                        <span
                          className={`mt-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 transition-all ${
                            draft
                              ? isBelowCost ? "border-[#FF0000] bg-[#FF0000] text-white" : "border-[#003366] bg-[#003366] text-white"
                              : "border-slate-300 bg-white text-transparent"
                          }`}
                          aria-hidden="true"
                        >
                          <Check className="h-4.5 w-4.5" strokeWidth={5} />
                        </span>
                        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-slate-50 border border-slate-100">
                          {product.imageUrl ? (
                            <Image
                              src={product.imageUrl}
                              alt={product.name}
                              fill
                              sizes="80px"
                              className="object-contain"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <Package2 className="h-8 w-8 text-slate-300" strokeWidth={1.5} />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-lg font-black leading-tight text-slate-950">
                            <span className="mr-2 text-[#003366]/40 font-bold uppercase tracking-tighter">{product.sku}</span>
                            {product.name}
                          </p>
                          {cost > 0 && isBelowCost && (
                            <div className="mt-2 inline-flex items-center rounded-lg bg-[#FF0000] px-2 py-0.5 text-xs font-black text-white animate-pulse">
                              ต่ำกว่าทุน!
                            </div>
                          )}
                        </div>
                      </button>

                      {draft && selectedUnit ? (
                        <div className="mt-4 space-y-4 rounded-[1.3rem] bg-white/60 p-4 border border-white/40 shadow-inner">
                          {units.length > 1 ? (
                            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                              {units.map((unit) => (
                                <button
                                  key={unit.id ?? "__base__"}
                                  type="button"
                                  onClick={() => changeUnit(product, unit.id)}
                                  className={`shrink-0 rounded-xl border-2 px-4 py-2 text-sm font-black transition-all ${
                                    selectedUnit.id === unit.id
                                      ? "border-[#003366] bg-[#003366] text-white shadow-md shadow-[#003366]/20"
                                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                                  }`}
                                >
                                  {unit.label}
                                </button>
                              ))}
                            </div>
                          ) : null}

                          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                            <div className="min-w-0 rounded-2xl bg-white p-3 border border-slate-100 shadow-sm">
                              <p className="text-[12px] font-black text-slate-400 uppercase tracking-widest">จำนวน ({selectedUnit.label})</p>
                              <div className="mt-2.5 flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => stepQuantity(product, -1)}
                                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-slate-100 bg-slate-50 text-slate-700 active:scale-90"
                                >
                                  <Minus className="h-5 w-5" strokeWidth={3} />
                                </button>
                                <div className="min-w-0 flex-1 text-center">
                                  <p className="text-2xl font-black tabular-nums text-slate-950 leading-none">
                                    {draft.quantity.toLocaleString("th-TH")}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => stepQuantity(product, 1)}
                                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-slate-100 bg-slate-50 text-slate-700 active:scale-90"
                                >
                                  <Plus className="h-5 w-5" strokeWidth={3} />
                                </button>
                              </div>
                            </div>

                            <div className={`min-w-0 rounded-2xl p-3 border-2 transition-all ${
                              isBelowCost ? "bg-rose-50 border-[#FF0000]" : "bg-white border-slate-100 shadow-sm"
                            }`}>
                              <div className="flex items-center justify-between">
                                <p className={`text-[12px] font-black uppercase tracking-widest ${isBelowCost ? "text-[#FF0000]" : "text-slate-400"}`}>ราคา</p>
                                {cost > 0 && (
                                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full border ${isBelowCost ? "bg-white text-[#FF0000] border-[#FF0000] animate-pulse" : "text-slate-400 border-slate-200"}`}>
                                    ทุน ฿{formatTHB(cost)}
                                  </span>
                                )}
                              </div>
                              <div className="mt-2 flex items-center gap-2">
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
                                  className={`min-w-0 flex-1 bg-transparent text-right text-2xl font-black tabular-nums outline-none ${
                                    isBelowCost ? "text-[#FF0000]" : "text-slate-950"
                                  }`}
                                />
                                <span className={`shrink-0 text-xs font-black ${isBelowCost ? "text-[#FF0000]" : "text-slate-400"}`}>บาท</span>
                              </div>
                            </div>
                          </div>

                          {isBelowCost && (
                            <div className="flex items-center gap-3 rounded-2xl bg-[#FF0000] px-4 py-3 text-[14px] font-black text-white shadow-lg shadow-rose-500/30 border border-white/20 animate-in slide-in-from-top-2 duration-200">
                              <AlertTriangle className="h-5 w-5 shrink-0 text-yellow-300" strokeWidth={3} />
                              <p>ราคาต่ำกว่าทุน! (ต้นทุนของหน่วยนี้คือ ฿{formatTHB(cost)})</p>
                            </div>
                          )}

                          {issue ? (
                            <div className="flex items-start gap-2 rounded-xl border-2 border-rose-200 bg-rose-50 px-3 py-2 text-sm font-black text-rose-700">
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
            </div>

            <div className="shrink-0 border-t border-slate-200 bg-white px-4 pb-safe-or-5 pt-4 sm:px-5">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-2xl border border-slate-200 bg-white py-3.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 active:scale-[0.98]"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={addSelectedProducts}
                  disabled={pending || selectedCount === 0}
                  className="rounded-2xl bg-[#003366] py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#002244] disabled:opacity-45 active:scale-[0.98]"
                >
                  เพิ่ม {selectedCount > 0 ? selectedCount.toLocaleString("th-TH") : ""} รายการ
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
