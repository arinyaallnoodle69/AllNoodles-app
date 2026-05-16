"use client";

import React, { memo, useEffect, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Minus,
  Package2,
  Plus,
  Trash2,
  X,
  XCircle,
  Clock,
  Edit3,
  Loader2,
  Boxes,
} from "lucide-react";
import type { OrderDetailData, IncomingOrderListItem } from "@/lib/orders/detail";
import type { OrderProductOption } from "@/lib/orders/manage";
import type { AddedOrderItemDraft } from "@/components/orders/order-add-product-picker";
import {
  deleteOrderCascadeActionV3,
  updateOrderItemsBatchAction,
} from "@/app/orders/incoming/actions";

const loadOrderAddProductPicker = () =>
  import("@/components/orders/order-add-product-picker").then((mod) => mod.OrderAddProductPicker);

const OrderAddProductPicker = dynamic(
  loadOrderAddProductPicker,
  {
    loading: () => (
      <div className="flex h-[56px] items-center justify-center rounded-xl border-2 border-dashed border-slate-100 bg-white text-[10px] font-black text-slate-300 uppercase tracking-widest">
        กำลังโหลดข้อมูลสินค้า...
      </div>
    ),
  },
);


function formatTHB(v: number) {
  return v.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDisplayDate(value: string) {
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${parseInt(y, 10) + 543}`;
}

type StockReductionMode = "return" | "lost";

// â”€â”€â”€ Sub-components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const ItemsViewList = memo(({ detail }: { detail: OrderDetailData }) => {
  return (
    <div className="space-y-0 py-2">
      {detail.items.map((item) => (
        <div key={item.id} className="w-full overflow-hidden border-b-2 border-slate-300 bg-white transition-shadow active:bg-slate-50">
          <div className="flex p-5">
            {/* Left: Large Image */}
            <div className="relative h-24 w-24 shrink-0 overflow-hidden">
              {item.imageUrl ? (
                <Image src={item.imageUrl} alt={item.productName} fill sizes="96px" className="object-contain p-1" />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Package2 className="h-10 w-10 text-slate-200" strokeWidth={1} />
                </div>
              )}
            </div>

            {/* Right: Product Detail */}
            <div className="ml-5 min-w-0 flex-1 flex flex-col justify-center py-1">
              <div className="min-w-0">
                <p className="text-xl font-black text-slate-950 uppercase leading-relaxed mb-1 line-clamp-2">
                  {item.productName}
                </p>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[11px] font-black text-slate-950 uppercase tracking-tighter">{item.sku}</span>
                  <span className="h-3 w-px bg-slate-200" />
                  <span className="text-[14px] font-black text-slate-500">฿{formatTHB(item.unitPrice)} / {item.unit}</span>
                </div>
              </div>

              <div className="mt-3 flex h-8 items-center gap-2.5">
                <div
                  className={`flex h-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border-2 px-2 ${item.stockQuantity < 0 ? "bg-[#FF0000] border-[#FF0000] text-white shadow-sm" : "bg-[#003366] border-[#003366] text-white shadow-sm"}`}
                >
                  <Boxes className="h-4 w-4" />
                  <span className="text-[11px] font-black uppercase tracking-[0.08em]">สต็อก:</span>
                  <span className="text-[15px] font-black tabular-nums">{item.stockQuantity.toLocaleString("th-TH")}</span>
                </div>
                {item.shortQuantity > 0 && (
                  <div className="flex h-full min-w-0 items-center gap-1.5 whitespace-nowrap border border-rose-700 bg-rose-600 px-2 shadow-sm">
                    <AlertTriangle className="h-3.5 w-3.5 text-white" />
                    <span className="text-[9.5px] font-black uppercase tracking-[0.08em] text-white">ขาด {item.shortQuantity}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Bar: Action Values */}
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-5 py-4">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-950 uppercase tracking-[0.2em] mb-1">จำนวนสั่ง</span>
              <p className="text-3xl font-black text-slate-950 tabular-nums leading-none">
                {item.quantity.toLocaleString("th-TH")} <span className="text-[12px] font-bold text-slate-400 opacity-60 ml-1">{item.unit}</span>
              </p>
            </div>
            <div className="text-right flex flex-col">
              <span className="text-[10px] font-black text-slate-950 uppercase tracking-[0.2em] mb-1">ยอดรวมรายการ</span>
              <p className="text-3xl font-black text-slate-950 tabular-nums leading-none">
                ฿{formatTHB(item.lineTotal)}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
});
ItemsViewList.displayName = "ItemsViewList";

const EditItemsPanel = memo(({
  detail,
  onDone,
  products,
}: {
  detail: OrderDetailData;
  onDone: (message?: string) => void;
  products: OrderProductOption[];
}) => {
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(detail.items.map((i) => [i.id, i.quantity])),
  );
  const [quantityInputs, setQuantityInputs] = useState<Record<string, string>>(
    Object.fromEntries(detail.items.map((i) => [i.id, String(i.quantity)])),
  );
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [addedItems, setAddedItems] = useState<AddedOrderItemDraft[]>([]);
  const [addedQuantityInputs, setAddedQuantityInputs] = useState<Record<string, string>>({});
  const [reductionModes, setReductionModes] = useState<Record<string, StockReductionMode>>(
    Object.fromEntries(detail.items.map((item) => [item.id, "return"])),
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const activeItems = detail.items.filter((i) => !removed.has(i.id));

  useEffect(() => {
    setQuantities(Object.fromEntries(detail.items.map((i) => [i.id, i.quantity])));
    setQuantityInputs(Object.fromEntries(detail.items.map((i) => [i.id, String(i.quantity)])));
    setRemoved(new Set());
    setAddedItems([]);
    setAddedQuantityInputs({});
    setReductionModes(Object.fromEntries(detail.items.map((item) => [item.id, "return"])));
  }, [detail]);

  function getItemRules(productId: string, saleUnitId: string | null) {
    const product = products.find((p) => p.id === productId);
    if (!product) return { min: 1, step: 1 };
    const unit = product.saleUnits.find((u) => u.id === (saleUnitId || null)) ||
                 (saleUnitId === null ? product.saleUnits.find(u => u.baseUnitQuantity === 1) : null);
    if (unit) return { min: Number(unit.minOrderQty ?? 1), step: unit.stepOrderQty && unit.stepOrderQty > 0 ? Number(unit.stepOrderQty) : 1 };
    return { min: 1, step: 1 };
  }

  function handleQty(itemId: string, delta: number) {
    setError(null);
    const item = detail.items.find((i) => i.id === itemId);
    if (!item) return;
    const { min, step } = getItemRules(item.productId, item.productSaleUnitId);
    setQuantities((prev: Record<string, number>) => {
      const current = prev[itemId] ?? item.quantity;
      const nextRaw = current + delta * step;
      const next = Math.max(min, Math.round((nextRaw - min) / step) * step + min);
      setQuantityInputs((prevInputs) => ({ ...prevInputs, [itemId]: String(Number(next.toFixed(3))) }));
      return { ...prev, [itemId]: Number(next.toFixed(3)) };
    });
  }

  function handleAddedQty(key: string, delta: number) {
    setError(null);
    setAddedItems((prev: AddedOrderItemDraft[]) => {
      const idx = prev.findIndex((i) => i.key === key);
      if (idx === -1) return prev;
      const item = prev[idx];
      const { min, step } = getItemRules(item.productId, item.productSaleUnitId);
      const nextRaw = item.quantity + delta * step;
      const next = Math.max(min, Math.round((nextRaw - min) / step) * step + min);
      const nextItems = [...prev];
      nextItems[idx] = { ...item, quantity: Number(next.toFixed(3)) };
      setAddedQuantityInputs((prevInputs) => ({
        ...prevInputs,
        [key]: String(Number(next.toFixed(3))),
      }));
      return nextItems;
    });
  }

  function sanitizeManualQuantity(value: number, fallback: number) {
    if (!Number.isFinite(value) || value <= 0) {
      return Number(fallback.toFixed(3));
    }
    return Number(value.toFixed(3));
  }

  function handleQuantityInput(itemId: string, raw: string) {
    setError(null);
    setQuantityInputs((prev) => ({ ...prev, [itemId]: raw }));
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || raw.trim() === "") return;
    setQuantities((prev) => ({ ...prev, [itemId]: parsed }));
  }

  function commitQuantityInput(itemId: string) {
    const item = detail.items.find((i) => i.id === itemId);
    if (!item) return;
    const parsed = Number(quantityInputs[itemId] ?? quantities[itemId] ?? item.quantity);
    const nextValue = sanitizeManualQuantity(parsed, item.quantity);
    setQuantities((prev) => ({ ...prev, [itemId]: nextValue }));
    setQuantityInputs((prev) => ({ ...prev, [itemId]: String(nextValue) }));
  }

  function handleAddedQuantityInput(key: string, raw: string) {
    setError(null);
    setAddedQuantityInputs((prev) => ({ ...prev, [key]: raw }));
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || raw.trim() === "") return;
    setAddedItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, quantity: parsed } : item)),
    );
  }

  function commitAddedQuantityInput(key: string) {
    const item = addedItems.find((i) => i.key === key);
    if (!item) return;
    const parsed = Number(addedQuantityInputs[key] ?? item.quantity);
    const normalized = sanitizeManualQuantity(parsed, item.quantity);
    setAddedItems((prev) =>
      prev.map((current) => (current.key === key ? { ...current, quantity: normalized } : current)),
    );
    setAddedQuantityInputs((prev) => ({ ...prev, [key]: String(normalized) }));
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      const normalizedQuantities = Object.fromEntries(
        activeItems.map((item) => {
          const current = quantities[item.id] ?? item.quantity;
          return [item.id, sanitizeManualQuantity(current, item.quantity)];
        }),
      );
      const normalizedAddedItems = addedItems.map((item) => ({
        ...item,
        quantity: sanitizeManualQuantity(item.quantity, item.quantity),
      }));

      if (
        Object.values(normalizedQuantities).some((qty) => !Number.isFinite(qty) || qty <= 0) ||
        normalizedAddedItems.some((item) => !Number.isFinite(item.quantity) || item.quantity <= 0)
      ) {
        throw new Error("จำนวนสินค้าต้องมากกว่า 0");
      }

      const result = await updateOrderItemsBatchAction({
        orderId: detail.id,
        removedIds: Array.from(removed),
        updates: Object.entries(normalizedQuantities)
          .filter(([id, qty]) => {
            const original = detail.items.find((i) => i.id === id);
            return original && Number(original.quantity) !== qty;
          })
          .map(([itemId, quantity]) => {
            const original = detail.items.find((item) => item.id === itemId);
            const reductionMode =
              original && quantity < Number(original.quantity)
                ? (reductionModes[itemId] ?? "return")
                : undefined;

            return { itemId, quantity, reductionMode };
          }),
        additions: normalizedAddedItems.map((item) => ({
          productId: item.productId,
          productSaleUnitId: item.productSaleUnitId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      });

      if ("error" in result) throw new Error(result.error);
      onDone("บันทึกรายการสำเร็จแล้ว");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    } finally {
      setIsSaving(false);
    }
  }

  const totalAmount = activeItems.reduce((s, i) => s + (quantities[i.id] ?? i.quantity) * i.unitPrice, 0) +
                      addedItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  function getAddedItemStock(item: AddedOrderItemDraft) {
    const product = products.find((p) => p.id === item.productId);
    if (!product) return 0;
    const unit = product.saleUnits.find((saleUnit) => saleUnit.id === item.productSaleUnitId);
    const ratio = unit?.baseUnitQuantity && unit.baseUnitQuantity > 0 ? unit.baseUnitQuantity : 1;
    return Math.floor(product.stockQuantity / ratio);
  }

  function isQuantityReduced(itemId: string, currentQuantity: number) {
    const original = detail.items.find((item) => item.id === itemId);
    return original ? currentQuantity < Number(original.quantity) : false;
  }

  return (
    <div className="relative flex h-full flex-col bg-white">
      {isSaving ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/78 backdrop-blur-[1px]">
          <div className="flex flex-col items-center gap-4 rounded-3xl border border-slate-100 bg-white/95 px-8 py-7 shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
            <div className="relative flex items-center justify-center">
              <div className="absolute h-12 w-12 rounded-full border-2 border-[#003366]/10" />
              <Loader2 className="h-12 w-12 animate-spin text-[#003366]" strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#003366]">กำลังบันทึกรายการ</p>
              <p className="mt-2 text-sm font-bold text-slate-500">ระบบกำลังอัปเดตออเดอร์และใบจัดส่ง</p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex-1 overflow-y-auto px-5 py-4 custom-scrollbar">
        <div className="mb-4">
          <OrderAddProductPicker
            addedItems={addedItems}
            customerId={detail.customer.id}
	            onAddMany={(newItems: AddedOrderItemDraft[]) => {
	              setError(null);
	              const nextRemoved = new Set(removed);
	              const nextQuantities = { ...quantities };
                const nextQuantityInputs = { ...quantityInputs };
	              const nextAdded = [...addedItems];
                const nextAddedInputs = { ...addedQuantityInputs };
	
	              for (const newItem of newItems) {
                const newUnitId = newItem.productSaleUnitId || null;
                const existingIdx = detail.items.findIndex(
                  (i) => i.productId === newItem.productId && (i.productSaleUnitId || null) === newUnitId
                );

	                if (existingIdx >= 0) {
	                  const existingItem = detail.items[existingIdx];
	                  nextRemoved.delete(existingItem.id);
	                  const currentQty = nextQuantities[existingItem.id] ?? existingItem.quantity;
                    const mergedQty = Number((currentQty + newItem.quantity).toFixed(3));
	                  nextQuantities[existingItem.id] = mergedQty;
                    nextQuantityInputs[existingItem.id] = String(mergedQty);
	                  continue;
	                }

                const addedIdx = nextAdded.findIndex(
                  (i) => i.productId === newItem.productId && (i.productSaleUnitId || null) === newUnitId
                );

	                if (addedIdx >= 0) {
                    const mergedQty = Number((nextAdded[addedIdx].quantity + newItem.quantity).toFixed(3));
	                  nextAdded[addedIdx] = {
	                    ...nextAdded[addedIdx],
	                    quantity: mergedQty,
	                  };
                    nextAddedInputs[nextAdded[addedIdx].key] = String(mergedQty);
	                } else {
	                  nextAdded.push(newItem);
                    nextAddedInputs[newItem.key] = String(newItem.quantity);
	                }
	              }
	
	              setRemoved(nextRemoved);
	              setQuantities(nextQuantities);
                setQuantityInputs(nextQuantityInputs);
	              setAddedItems(nextAdded);
                setAddedQuantityInputs(nextAddedInputs);
	            }}
            products={products}
          />
        </div>

        {error && <div className="mb-4 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-600 leading-tight">{error}</div>}

        <div className="pb-24">
          <div className="bg-white">
            {/* Desktop Table View (md+) */}
            <div className="hidden overflow-x-auto border-b border-slate-300 md:block">
              <table className="min-w-full border-collapse text-left">
                <thead>
                  <tr className="bg-[#003366]">
                    <th className="px-5 py-4 text-[13px] font-black uppercase tracking-widest border-r border-white/5 text-white">สินค้า</th>
                    <th className="px-5 py-4 text-[13px] font-black uppercase tracking-widest border-r border-white/5 text-center text-white">ราคา/หน่วย</th>
                    <th className="px-5 py-4 text-[13px] font-black uppercase tracking-widest border-r border-white/5 text-center text-white">ยอดรวม</th>
                    <th className="px-5 py-4 text-[13px] font-black uppercase tracking-widest border-r border-white/5 text-center text-white">สต็อก</th>
                    <th className="px-5 py-4 text-[13px] font-black uppercase tracking-widest border-r border-white/5 text-center text-white">จำนวน</th>
                    <th className="px-5 py-4 w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300 bg-white">
                  {addedItems.map((item) => {
                    const stock = getAddedItemStock(item);
                    return (
                      <tr key={item.key} className="transition-colors hover:bg-emerald-50/30">
                        <td className="px-5 py-4 border-r border-slate-100">
                          <div className="flex items-center gap-3">
                            <div className="relative h-12 w-12 shrink-0 overflow-hidden">
                              {item.imageUrl ? (
                                <Image src={item.imageUrl} alt={item.productName} fill sizes="48px" className="object-contain" />
                              ) : (
                                <Package2 className="h-6 w-6 text-slate-200 mx-auto mt-3" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="rounded bg-emerald-600 px-1 py-0.5 text-[9px] font-black uppercase text-white">ใหม่</span>
                                <span className="font-mono text-[10px] font-bold text-slate-950">{item.sku}</span>
                              </div>
                              <p className="text-sm font-black text-slate-950 truncate max-w-[180px]">{item.productName}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center font-black text-slate-600 border-r border-slate-100">฿{formatTHB(item.unitPrice)}</td>
                        <td className="px-5 py-4 text-center font-black text-slate-950 border-r border-slate-100">฿{formatTHB(item.quantity * item.unitPrice)}</td>
                        <td className="px-5 py-4 text-center border-r border-slate-100">
                          <span className={`inline-flex min-w-[60px] justify-center rounded-lg px-2 py-1 text-xs font-black shadow-sm ${stock < 0 ? "bg-[#FF0000] text-white" : "bg-[#003366] text-white"}`}>
                            {stock.toLocaleString("th-TH")}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-center gap-3">
                            <button onClick={() => handleAddedQty(item.key, -1)} className="h-8 w-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center active:scale-90"><Minus className="h-4 w-4" strokeWidth={3} /></button>
                            <input
                              type="number"
                              inputMode="decimal"
                              min={1}
                              step="0.001"
                              value={addedQuantityInputs[item.key] ?? String(item.quantity)}
                              onChange={(e) => handleAddedQuantityInput(item.key, e.target.value)}
                              onBlur={() => commitAddedQuantityInput(item.key)}
                              className="h-9 w-24 rounded-lg border border-slate-200 bg-white px-2 text-center font-black text-slate-950 outline-none transition focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/10"
                            />
                            <button onClick={() => handleAddedQty(item.key, +1)} className="h-8 w-8 rounded-lg bg-[#003366] text-white flex items-center justify-center active:scale-90"><Plus className="h-4 w-4" strokeWidth={3} /></button>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center">
                          <button onClick={() => setAddedItems((current) => current.filter((draft) => draft.key !== item.key))} className="text-rose-500 p-2 rounded-lg hover:bg-rose-50 transition-colors active:scale-90">
                            <Trash2 className="h-5 w-5" strokeWidth={2.3} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {activeItems.map((item) => {
                    const qty = quantities[item.id] ?? item.quantity;
                    return (
                      <tr key={item.id} className="transition-colors hover:bg-slate-50">
                        <td className="px-5 py-4 border-r border-slate-100">
                          <div className="flex items-center gap-3">
                            <div className="relative h-12 w-12 shrink-0 overflow-hidden">
                              {item.imageUrl ? (
                                <Image src={item.imageUrl} alt={item.productName} fill sizes="48px" className="object-contain" />
                              ) : (
                                <Package2 className="h-6 w-6 text-slate-200 mx-auto mt-3" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <span className="font-mono text-[10px] font-bold text-slate-950 block mb-0.5">{item.sku}</span>
                              <p className="text-sm font-black text-slate-950 truncate max-w-[180px]">{item.productName}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center font-black text-slate-600 border-r border-slate-100">฿{formatTHB(item.unitPrice)}</td>
                        <td className="px-5 py-4 text-center font-black text-slate-950 border-r border-slate-100">฿{formatTHB(qty * item.unitPrice)}</td>
                        <td className="px-5 py-4 text-center border-r border-slate-100">
                          <span className={`inline-flex min-w-[60px] justify-center rounded-lg px-2 py-1 text-xs font-black shadow-sm ${item.stockQuantity < 0 ? "bg-[#FF0000] text-white" : "bg-[#003366] text-white"}`}>
                            {item.stockQuantity.toLocaleString("th-TH")}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-col items-center gap-2">
                            <div className="flex items-center justify-center gap-3">
                              <button onClick={() => handleQty(item.id, -1)} className="h-8 w-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center active:scale-90"><Minus className="h-4 w-4" strokeWidth={3} /></button>
                              <input
                                type="number"
                                inputMode="decimal"
                                min={1}
                                step="0.001"
                                value={quantityInputs[item.id] ?? String(qty)}
                                onChange={(e) => handleQuantityInput(item.id, e.target.value)}
                                onBlur={() => commitQuantityInput(item.id)}
                                className="h-9 w-24 rounded-lg border border-slate-200 bg-white px-2 text-center font-black text-slate-950 outline-none transition focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/10"
                              />
                              <button onClick={() => handleQty(item.id, +1)} className="h-8 w-8 rounded-lg bg-[#003366] text-white flex items-center justify-center active:scale-90"><Plus className="h-4 w-4" strokeWidth={3} /></button>
                            </div>
                            {isQuantityReduced(item.id, qty) ? (
                              <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-1">
                                <button
                                  type="button"
                                  onClick={() => setReductionModes((current) => ({ ...current, [item.id]: "return" }))}
                                  className={`rounded-lg px-2.5 py-1 text-[10px] font-black transition ${
                                    (reductionModes[item.id] ?? "return") === "return"
                                      ? "bg-[#003366] text-white"
                                      : "text-slate-500"
                                  }`}
                                >
                                  คืนสต็อค
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setReductionModes((current) => ({ ...current, [item.id]: "lost" }))}
                                  className={`rounded-lg px-2.5 py-1 text-[10px] font-black transition ${
                                    reductionModes[item.id] === "lost"
                                      ? "bg-rose-600 text-white"
                                      : "text-slate-500"
                                  }`}
                                >
                                  ของหาย
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center">
                          <button onClick={() => setRemoved((current) => new Set([...current, item.id]))} className="text-rose-500 p-2 rounded-lg hover:bg-rose-50 transition-colors active:scale-90">
                            <Trash2 className="h-5 w-5" strokeWidth={2.3} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View (md:hidden) */}
            <div className="divide-y divide-slate-300/80 bg-slate-50/30 md:hidden border-b border-slate-300">
              {addedItems.map((item) => {
                const stock = getAddedItemStock(item);
                return (
                  <article key={item.key} className="bg-white p-5 transition-all active:bg-slate-50">
                    <div className="flex gap-4">
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden">
                        {item.imageUrl ? <Image src={item.imageUrl} alt={item.productName} fill sizes="80px" className="object-contain" /> : <Package2 className="h-9 w-9 text-slate-200 mx-auto mt-5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="mb-1.5 flex flex-wrap items-center gap-2">
                              <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[9px] font-black uppercase text-white">ใหม่</span>
                              <span className="font-mono text-[11px] font-black uppercase tracking-tighter text-slate-950">{item.sku}</span>
                            </div>
                            <h4 className="line-clamp-2 text-[1.1rem] font-black leading-tight text-slate-950">{item.productName}</h4>
                          </div>
                          <button onClick={() => setAddedItems((current) => current.filter((draft) => draft.key !== item.key))} className="shrink-0 rounded-lg p-1.5 text-slate-300 active:text-rose-500">
                            <Trash2 className="h-5 w-5" strokeWidth={2.3} />
                          </button>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">สต็อกสินค้า</p>
                            <div className="mt-1.5 flex items-center">
                              <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[13.5px] font-black shadow-sm ${stock < 0 ? "bg-[#FF0000] text-white" : "bg-[#003366] text-white"}`}>
                                <Boxes className="h-3.5 w-3.5" />
                                {stock.toLocaleString("th-TH")}
                              </span>
                            </div>
                          </div>
                          <div className="border-l border-slate-300 pl-4">
                            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">ราคาต่อหน่วย</p>
                            <p className="mt-1.5 text-[15px] font-black text-slate-950">฿{formatTHB(item.unitPrice)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-5 flex items-center justify-between gap-4 border-t border-slate-300 pt-4">
                      <div className="flex items-center gap-3">
                        <button onClick={() => handleAddedQty(item.key, -1)} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 active:scale-95"><Minus className="h-6 w-6" strokeWidth={3} /></button>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={1}
                          step="0.001"
                          value={addedQuantityInputs[item.key] ?? String(item.quantity)}
                          onChange={(e) => handleAddedQuantityInput(item.key, e.target.value)}
                          onBlur={() => commitAddedQuantityInput(item.key)}
                          className="h-11 w-24 rounded-2xl border border-slate-200 bg-white px-3 text-center text-2xl font-black text-slate-950 tabular-nums outline-none transition focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/10"
                        />
                        <button onClick={() => handleAddedQty(item.key, +1)} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#003366] text-white shadow-md active:scale-95"><Plus className="h-6 w-6" strokeWidth={3} /></button>
                      </div>
                      <div className="h-10 border-l border-slate-200" />
                      <div className="text-right flex-1">
                        <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">ยอดรวมสินค้า</p>
                        <p className="text-[1.3rem] font-black text-[#003366] tabular-nums leading-none">฿{formatTHB(item.quantity * item.unitPrice)}</p>
                      </div>
                    </div>
                  </article>
                );
              })}
              {activeItems.map((item) => {
                const qty = quantities[item.id] ?? item.quantity;
                return (
                  <article key={item.id} className="bg-white p-5 transition-all active:bg-slate-50">
                    <div className="flex gap-4">
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden">
                        {item.imageUrl ? <Image src={item.imageUrl} alt={item.productName} fill sizes="80px" className="object-contain" /> : <Package2 className="h-9 w-9 text-slate-200 mx-auto mt-5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="mb-1.5 flex flex-wrap items-center gap-2">
                              <span className="font-mono text-[11px] font-black uppercase tracking-tighter text-slate-950">{item.sku}</span>
                            </div>
                            <h4 className="line-clamp-2 text-[1.1rem] font-black leading-tight text-slate-950">{item.productName}</h4>
                          </div>
                          <button onClick={() => setRemoved((current) => new Set([...current, item.id]))} className="shrink-0 rounded-lg p-1.5 text-slate-300 active:text-rose-500">
                            <Trash2 className="h-5 w-5" strokeWidth={2.3} />
                          </button>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">สต็อกสินค้า</p>
                            <div className="mt-1.5 flex items-center">
                              <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[13.5px] font-black shadow-sm ${item.stockQuantity < 0 ? "bg-[#FF0000] text-white" : "bg-[#003366] text-white"}`}>
                                <Boxes className="h-3.5 w-3.5" />
                                {item.stockQuantity.toLocaleString("th-TH")}
                              </span>
                            </div>
                          </div>
                          <div className="border-l border-slate-300 pl-4">
                            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">ราคาต่อหน่วย</p>
                            <p className="mt-1.5 text-[15px] font-black text-slate-950">฿{formatTHB(item.unitPrice)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-5 flex items-center justify-between gap-4 border-t border-slate-300 pt-4">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                          <button onClick={() => handleQty(item.id, -1)} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 active:scale-95"><Minus className="h-6 w-6" strokeWidth={3} /></button>
                          <input
                            type="number"
                            inputMode="decimal"
                            min={1}
                            step="0.001"
                            value={quantityInputs[item.id] ?? String(qty)}
                            onChange={(e) => handleQuantityInput(item.id, e.target.value)}
                            onBlur={() => commitQuantityInput(item.id)}
                            className="h-11 w-24 rounded-2xl border border-slate-200 bg-white px-3 text-center text-2xl font-black text-slate-950 tabular-nums outline-none transition focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/10"
                          />
                          <button onClick={() => handleQty(item.id, +1)} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#003366] text-white shadow-md active:scale-95"><Plus className="h-6 w-6" strokeWidth={3} /></button>
                        </div>
                        {isQuantityReduced(item.id, qty) ? (
                          <div className="inline-flex items-center self-start rounded-2xl border border-slate-200 bg-white p-1">
                            <button
                              type="button"
                              onClick={() => setReductionModes((current) => ({ ...current, [item.id]: "return" }))}
                              className={`rounded-xl px-3 py-1.5 text-[11px] font-black transition ${
                                (reductionModes[item.id] ?? "return") === "return"
                                  ? "bg-[#003366] text-white"
                                  : "text-slate-500"
                              }`}
                            >
                              คืนสต็อค
                            </button>
                            <button
                              type="button"
                              onClick={() => setReductionModes((current) => ({ ...current, [item.id]: "lost" }))}
                              className={`rounded-xl px-3 py-1.5 text-[11px] font-black transition ${
                                reductionModes[item.id] === "lost"
                                  ? "bg-rose-600 text-white"
                                  : "text-slate-500"
                              }`}
                            >
                              ของหาย
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <div className="h-10 border-l border-slate-200" />
                      <div className="text-right flex-1">
                        <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">ยอดรวมสินค้า</p>
                        <p className="text-[1.3rem] font-black text-[#003366] tabular-nums leading-none">฿{formatTHB(qty * item.unitPrice)}</p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase text-slate-400 tracking-[0.1em] leading-none">ยอดรวมสุทธิ</p>
            <p className="mt-1 text-xl font-black text-[#003366] tabular-nums tracking-tighter leading-none">
              {formatTHB(totalAmount)} <span className="text-[10px] font-bold opacity-40">บาท</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => onDone()} disabled={isSaving} className="rounded-xl bg-slate-50 px-6 py-3 text-sm font-black text-slate-500 uppercase tracking-widest active:scale-95 disabled:opacity-50">ยกเลิก</button>
            <button onClick={handleSave} disabled={isSaving} className="rounded-xl bg-[#003366] px-8 py-3 text-sm font-black text-white shadow-lg uppercase tracking-widest active:scale-95 disabled:opacity-50 flex items-center gap-2">
              {isSaving ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : null}
              {isSaving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
EditItemsPanel.displayName = "EditItemsPanel";

// â”€â”€â”€ Main modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type Props = {
  allOrders: IncomingOrderListItem[];
  date: string;
  detail: OrderDetailData | null;
  expandedId: string;
  products: OrderProductOption[];
  searchTerm: string;
};

export function IncomingOrderModal({ allOrders, detail, expandedId, products }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const startInEditMode = searchParams.get("edit") === "1";
  const startInDeleteMode = searchParams.get("delete") === "1";

  const [editMode, setEditMode] = useState(startInEditMode);
  const [confirmCancel, setConfirmCancel] = useState(startInDeleteMode);
  const [navPending, startNavTransition] = useTransition();
  const [actionPending, startActionTransition] = useTransition();
  const [editModePending, startEditModeTransition] = useTransition();
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);
  const [isPreparingEdit, setIsPreparingEdit] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [slideAnim, setSlideAnim] = useState<"slide-left" | "slide-right" | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    setEditMode(startInEditMode);
    setConfirmCancel(startInDeleteMode);
    setSlideAnim(null);
    setSaveToast(null);
  }, [expandedId, startInDeleteMode, startInEditMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const updateViewport = () => setIsDesktopViewport(mediaQuery.matches);

    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    if (!detail) return;
    const preloadTimer = window.setTimeout(() => {
      void loadOrderAddProductPicker();
    }, 120);

    return () => window.clearTimeout(preloadTimer);
  }, [detail]);

  const currentIndex = allOrders.findIndex((o) => o.id === expandedId);
  const prevOrder = currentIndex >= 0 && allOrders.length > 1 ? allOrders[(currentIndex - 1 + allOrders.length) % allOrders.length] : null;
  const nextOrder = currentIndex >= 0 && allOrders.length > 1 ? allOrders[(currentIndex + 1) % allOrders.length] : null;

  function buildNavHref(orderId: string | null) {
    if (!orderId) return null;
    const p = new URLSearchParams(searchParams.toString());
    p.set("expanded", orderId);
    return `${pathname}?${p.toString()}`;
  }

  function handleNav(direction: "prev" | "next") {
    const target = direction === "prev" ? prevOrder : nextOrder;
    if (!target || navPending) return;

    setSlideAnim(direction === "next" ? "slide-left" : "slide-right");
    startNavTransition(() => {
      router.replace(buildNavHref(target.id)!, { scroll: false });
    });
  }

  function close() {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      const p = new URLSearchParams(searchParams.toString());
      p.delete("expanded"); p.delete("edit"); p.delete("delete");
      startActionTransition(() => { router.replace(`${pathname}?${p.toString()}`, { scroll: false }); });
    }, 350);
  }

  function closeDeletePrompt() {
    setConfirmCancel(false);
    setDeleteError(null);
    if (searchParams.get("delete") === "1") {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("delete");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }

  async function handleDeleteOrder() {
    if (!detail) {
      setDeleteError("ไม่พบออเดอร์ที่ต้องการลบ");
      return;
    }
    setDeleteError(null);
    const fd = new FormData();
    fd.set("orderId", detail.id);
    const result = await deleteOrderCascadeActionV3(fd);
    if ("error" in result && result.error) {
      setDeleteError(result.error);
      return;
    }
    close();
    window.setTimeout(() => {
      router.refresh();
    }, 140);
  }

  async function openEditMode() {
    if (editMode || isPreparingEdit || editModePending) return;

    setIsPreparingEdit(true);

    try {
      await loadOrderAddProductPicker();
    } finally {
      startEditModeTransition(() => {
        setEditMode(true);
      });
      setIsPreparingEdit(false);
    }
  }

  if (!detail) return null;

  return (
    <div className={`fixed inset-0 z-[250] flex flex-col items-center justify-end lg:justify-center overflow-hidden`}>
      <style>{`
        @keyframes slideInL { from { transform: translateX(20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes slideInR { from { transform: translateX(-20px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }

        .m-anim { animation: slide-down-premium 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
        .m-anim-out { animation: slide-up-premium 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
        
        @media (min-width: 1024px) { 
          .m-anim { animation: modalPop 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
          .m-anim-out { animation: modalPush 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        }

        .c-slide-l { animation: slideInL 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        .c-slide-r { animation: slideInR 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
        .backdrop-out { animation: fadeOut 0.35s ease forwards; }

        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
      `}</style>

      {/* Backdrop */}
      <div className={`absolute inset-0 bg-slate-950/45 backdrop-blur-[2px] ${isClosing ? "backdrop-out" : "animate-fade-in"}`} onClick={close} />

      {/* Main Container */}
      <div className={`${isClosing ? "m-anim-out" : "m-anim"} relative z-10 flex flex-col bg-white w-full h-full lg:h-[90vh] lg:max-w-4xl lg:rounded-[2.5rem] overflow-hidden shadow-2xl`}>
        {saveToast ? (
          <div className="pointer-events-none absolute left-1/2 top-5 z-[70] w-[calc(100%-2.5rem)] max-w-md -translate-x-1/2 lg:top-6">
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-white/96 px-4 py-3 text-sm font-black text-emerald-700 shadow-[0_22px_60px_rgba(16,185,129,0.18)] backdrop-blur-sm">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50">
                <CheckCircle2 className="h-5 w-5" strokeWidth={2.5} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-500">บันทึกสำเร็จ</p>
                <p className="mt-0.5 truncate text-sm font-black text-emerald-700">{saveToast}</p>
              </div>
            </div>
          </div>
        ) : null}

        {/* Modern Navy Header */}
        <div className="shrink-0 bg-[#003366] px-6 py-4 pt-[max(1rem,env(safe-area-inset-top))] lg:pt-6 relative">
          <div className="flex items-center justify-between gap-4 relative z-10">
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-black text-white leading-normal line-clamp-1">
                {detail.customer.name}
              </h2>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className="font-mono text-[11px] font-black text-white/50 tracking-widest uppercase">{detail.customer.code}</span>
                <span className="h-2 w-px bg-white/20" />
                <span className="font-mono text-[11px] font-black text-white/80 tracking-tight">{detail.orderNumber}</span>
                <span className="h-2 w-px bg-white/20" />
                <span className="text-[11px] font-black text-white/80 tracking-tight">{formatDisplayDate(detail.orderDate)}</span>
              </div>
            </div>
            <button
              onClick={() => {
                if (editMode && !isDesktopViewport) {
                  setEditMode(false);
                  return;
                }
                close();
              }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/70 transition hover:bg-white/20 active:scale-90"
            >
              <X className="h-6 w-6" strokeWidth={3} />
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between relative z-10">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-black text-white uppercase tracking-wider">
                <Clock className="h-3.5 w-3.5 text-white/50" />
                รับออเดอร์
              </span>
              <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">{detail.channelLabel}</span>
            </div>

            <div className="flex items-center gap-1.5 rounded-xl bg-black/20 p-1.5">
              <button
                onClick={() => handleNav("prev")}
                disabled={!prevOrder || navPending}
                className="flex h-8 w-10 items-center justify-center text-white/40 transition hover:text-white disabled:opacity-5 active:scale-75"
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={4} />
              </button>

              <div className="flex flex-col items-center px-2 min-w-[44px]">
                <span className="font-mono text-[13px] font-black text-white leading-none tracking-tighter">
                  {currentIndex + 1} / {allOrders.length}
                </span>
              </div>

              <button
                onClick={() => handleNav("next")}
                disabled={!nextOrder || navPending}
                className="flex h-8 w-10 items-center justify-center text-white/40 transition hover:text-white disabled:opacity-5 active:scale-75"
              >
                <ChevronRight className="h-5 w-5" strokeWidth={4} />
              </button>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className={`flex-1 overflow-hidden relative bg-white ${slideAnim ? (slideAnim === "slide-left" ? "c-slide-l" : "c-slide-r") : ""}`}>
          {navPending && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
              <div className="flex flex-col items-center gap-4">
                <div className="relative flex items-center justify-center">
                  <div className="absolute h-12 w-12 rounded-full border-2 border-[#003366]/10" />
                  <Loader2 className="h-12 w-12 animate-spin text-[#003366]" strokeWidth={1.5} />
                </div>
                <p className="text-[10px] font-black text-[#003366] uppercase tracking-[0.3em] animate-pulse">กำลังเปลี่ยนออเดอร์</p>
              </div>
            </div>
          )}

          {(isPreparingEdit || editModePending) && !navPending ? (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/78 backdrop-blur-[1px]">
              <div className="flex flex-col items-center gap-4">
                <div className="relative flex items-center justify-center">
                  <div className="absolute h-12 w-12 rounded-full border-2 border-[#003366]/10" />
                  <Loader2 className="h-12 w-12 animate-spin text-[#003366]" strokeWidth={1.5} />
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#003366] animate-pulse">
                  กำลังเปิดโหมดแก้ไข
                </p>
              </div>
            </div>
          ) : null}

          {confirmCancel ? (
            <div className="flex h-full flex-col items-center justify-center text-center px-10 animate-in fade-in zoom-in-95 duration-200">
              <div className="mb-6 rounded-[2.5rem] bg-rose-50 p-8 shadow-inner">
                <XCircle className="h-16 w-16 text-rose-500" strokeWidth={1} />
              </div>
              <h3 className="text-2xl font-black text-slate-950 tracking-tight">ยืนยันการยกเลิก?</h3>
              <p className="mt-4 text-sm font-medium text-slate-500 leading-relaxed max-w-xs mx-auto">
                คุณแน่ใจหรือไม่ว่าต้องการลบออเดอร์ <span className="font-mono font-bold text-slate-950">{detail.orderNumber}</span>?
                การดำเนินการนี้จะลบออเดอร์ออกจากรายการและอัปเดตสต็อกกับใบวางบิลตามข้อมูลล่าสุด
              </p>
              {deleteError ? (
                <div className="mt-4 max-w-sm rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                  {deleteError}
                </div>
              ) : null}
              <div className="mt-12 flex w-full max-w-xs gap-3">
                <button onClick={closeDeletePrompt} className="flex-1 rounded-2xl border border-slate-200 py-4 text-xs font-black text-slate-500 uppercase tracking-widest active:scale-95 transition-all">กลับ</button>
                <button onClick={() => { startActionTransition(handleDeleteOrder); }} disabled={actionPending} className="flex-1 rounded-2xl bg-rose-600 py-4 text-xs font-black text-white shadow-xl uppercase tracking-widest active:scale-95 disabled:opacity-50">ยืนยันลบ</button>
              </div>
            </div>
          ) : editMode ? (
            <EditItemsPanel
              detail={detail}
              onDone={(message) => {
                if (message) {
                  setSaveToast(message);
                  window.setTimeout(() => {
                    setSaveToast((current) => (current === message ? null : current));
                  }, 2200);
                }
                if (!isDesktopViewport) {
                  setEditMode(false);
                }
                window.setTimeout(() => {
                  router.refresh();
                }, 140);
              }}
              products={products}
            />
          ) : (
            <div className="flex flex-col h-full">
              <div className="hidden shrink-0 border-b border-slate-200 bg-white px-6 py-4 lg:block">
                <div className="flex items-center justify-end gap-3">
                  <button
                    onClick={() => setConfirmCancel(true)}
                    className="inline-flex items-center justify-center rounded-2xl bg-rose-700 px-5 py-3 text-[12px] font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-rose-100 transition-all active:scale-95"
                  >
                    ลบออเดอร์
                  </button>
                  <button
                    onClick={() => void openEditMode()}
                    disabled={isPreparingEdit || editModePending}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#003366] px-5 py-3 text-[12px] font-black uppercase tracking-[0.18em] text-white shadow-xl shadow-[#003366]/20 transition-all active:scale-95 disabled:opacity-75"
                  >
                    {isPreparingEdit || editModePending ? (
                      <Loader2 className="h-4.5 w-4.5 animate-spin" />
                    ) : (
                      <Edit3 className="h-4.5 w-4.5" />
                    )}
                    <span className="leading-none">
                      {isPreparingEdit || editModePending ? "กำลังเปิด..." : "แก้ไขรายการ"}
                    </span>
                  </button>
                </div>
              </div>

              {/* Scrollable Body */}
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <ItemsViewList detail={detail} />
              </div>

              {/* Sticky Bottom Actions */}
              <div className="shrink-0 border-t-2 border-slate-200 bg-white px-6 py-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-15px_40px_rgba(0,0,0,0.06)] lg:py-5">
                <div className="mb-5 flex items-end justify-between">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 leading-none mb-1.5">ยอดรวมสุทธิ</p>
                    <p className="text-3xl font-black text-slate-950 tabular-nums tracking-tighter leading-none">
                      ฿{formatTHB(detail.totalAmount)}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex h-7 items-center rounded-lg bg-slate-100 px-3 text-[11px] font-black text-slate-950 uppercase tracking-widest">
                      {detail.items.length} รายการ
                    </span>
                  </div>
                </div>

                <div className="flex gap-3 lg:hidden">
                  <button
                    onClick={() => setConfirmCancel(true)}
                    className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-rose-700 py-4 text-[13px] font-black text-white uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-rose-100"
                  >
                    ลบออเดอร์
                  </button>
                  <button
                    onClick={() => void openEditMode()}
                    disabled={isPreparingEdit || editModePending}
                    className="flex-[2] flex items-center justify-center gap-2 rounded-2xl bg-[#003366] py-4 text-[14px] font-black text-white shadow-xl shadow-[#003366]/20 uppercase tracking-widest active:scale-95 transition-all disabled:opacity-75"
                  >
                    {isPreparingEdit || editModePending ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Edit3 className="h-5 w-5" />
                    )}
                    <span className="leading-none text-white">
                      {isPreparingEdit || editModePending ? "กำลังเปิด..." : "แก้ไขรายการ"}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
