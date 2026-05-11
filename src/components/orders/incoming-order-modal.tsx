"use client";

import React, { memo, useEffect, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import {
  AlertTriangle,
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
} from "lucide-react";
import type { OrderDetailData, IncomingOrderListItem } from "@/lib/orders/detail";
import type { OrderProductOption } from "@/lib/orders/manage";
import type { AddedOrderItemDraft } from "@/components/orders/order-add-product-picker";
import {
  cancelOrderAction,
  updateOrderItemsBatchAction,
} from "@/app/orders/incoming/actions";

const OrderAddProductPicker = dynamic(
  () => import("@/components/orders/order-add-product-picker").then((mod) => mod.OrderAddProductPicker),
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

// ─── Sub-components ──────────────────────────────────────────────────────────

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
                  <span className="font-mono text-[11px] font-black text-slate-400 uppercase tracking-tighter">{item.sku}</span>
                  <span className="h-3 w-px bg-slate-200" />
                  <span className="text-[14px] font-black text-slate-500">฿{formatTHB(item.unitPrice)} / {item.unit}</span>
                </div>
              </div>

              <div className="flex items-center gap-3 mt-3 h-8">
                <div className={`flex h-full items-center gap-2 px-2.5 border-2 ${item.stockQuantity <= 0 ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-slate-100 border-slate-300 text-slate-900"}`}>
                  <span className="text-[10px] font-black uppercase tracking-wider">สต็อค:</span>
                  <span className="text-[14px] font-black tabular-nums">{item.stockQuantity.toLocaleString("th-TH")}</span>
                </div>
                {item.shortQuantity > 0 && (
                  <div className="flex h-full items-center gap-2 bg-rose-600 px-2.5 border border-rose-700 shadow-sm">
                    <AlertTriangle className="h-3.5 w-3.5 text-white" />
                    <span className="text-[10px] font-black text-white uppercase tracking-wider">ขาด {item.shortQuantity}</span>
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
  onDone: () => void;
  products: OrderProductOption[];
}) => {
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(detail.items.map((i) => [i.id, i.quantity])),
  );
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [addedItems, setAddedItems] = useState<AddedOrderItemDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const activeItems = detail.items.filter((i) => !removed.has(i.id));

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
      return nextItems;
    });
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      const result = await updateOrderItemsBatchAction({
        orderId: detail.id,
        removedIds: Array.from(removed),
        updates: Object.entries(quantities)
          .filter(([id, qty]) => {
            const original = detail.items.find((i) => i.id === id);
            return original && Number(original.quantity) !== qty;
          })
          .map(([itemId, quantity]) => ({ itemId, quantity })),
        additions: addedItems.map((item) => ({
          productId: item.productId,
          productSaleUnitId: item.productSaleUnitId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      });

      if ("error" in result) throw new Error(result.error);
      onDone();
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

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex-1 overflow-y-auto px-5 py-4 custom-scrollbar">
        <div className="mb-4">
          <OrderAddProductPicker
            addedItems={addedItems}
            customerId={detail.customer.id}
            onAddMany={(newItems: AddedOrderItemDraft[]) => {
              setError(null);
              const nextRemoved = new Set(removed);
              const nextQuantities = { ...quantities };
              const nextAdded = [...addedItems];

              for (const newItem of newItems) {
                const newUnitId = newItem.productSaleUnitId || null;
                const existingIdx = detail.items.findIndex(
                  (i) => i.productId === newItem.productId && (i.productSaleUnitId || null) === newUnitId
                );

                if (existingIdx >= 0) {
                  const existingItem = detail.items[existingIdx];
                  nextRemoved.delete(existingItem.id);
                  const currentQty = nextQuantities[existingItem.id] ?? existingItem.quantity;
                  nextQuantities[existingItem.id] = Number((currentQty + newItem.quantity).toFixed(3));
                  continue;
                }

                const addedIdx = nextAdded.findIndex(
                  (i) => i.productId === newItem.productId && (i.productSaleUnitId || null) === newUnitId
                );

                if (addedIdx >= 0) {
                  nextAdded[addedIdx] = {
                    ...nextAdded[addedIdx],
                    quantity: Number((nextAdded[addedIdx].quantity + newItem.quantity).toFixed(3)),
                  };
                } else {
                  nextAdded.push(newItem);
                }
              }

              setRemoved(nextRemoved);
              setQuantities(nextQuantities);
              setAddedItems(nextAdded);
            }}
            products={products}
          />
        </div>

        {error && <div className="mb-4 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-600 leading-tight">{error}</div>}

        <div className="pb-24">
          <div className="bg-white">
            <div className="hidden grid-cols-[minmax(0,1fr)_128px_144px_96px_160px_56px] items-center border-b-2 border-slate-900 bg-white px-5 py-4 text-[13px] font-black uppercase tracking-[0.08em] text-slate-950 md:grid">
              <span className="text-center">สินค้า</span>
              <span className="text-center">ราคา</span>
              <span className="text-center">ยอดรวม</span>
              <span className="text-center">สต็อค</span>
              <span className="text-center">จำนวน</span>
              <span />
            </div>

            <div className="divide-y-2 divide-slate-900">
              {addedItems.map((item) => {
                const stock = getAddedItemStock(item);

                return (
                  <div key={item.key} className="grid gap-3 px-5 py-4 transition-colors hover:bg-emerald-50/40 md:grid-cols-[minmax(0,1fr)_128px_144px_96px_160px_56px] md:items-center">
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="relative h-18 w-18 shrink-0 overflow-hidden">
                        {item.imageUrl ? (
                          <Image src={item.imageUrl} alt={item.productName} fill sizes="72px" className="object-contain" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Package2 className="h-9 w-9 text-slate-300" strokeWidth={1.6} />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="mb-1.5 flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">ใหม่</span>
                          <span className="font-mono text-xs font-black uppercase tracking-wide text-[#003366]/70">{item.sku}</span>
                        </div>
                        <p className="max-w-[28rem] text-[15px] font-black leading-snug text-slate-950">{item.productName}</p>
                        <p className="mt-1 text-xs font-bold text-slate-500">หน่วย {item.unitLabel}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 md:block md:flex md:justify-end">
                      <span className="text-xs font-black text-slate-400 md:hidden">ราคา</span>
                      <p className="text-base font-black text-[#003366] tabular-nums">{formatTHB(item.unitPrice)} บาท</p>
                    </div>

                    <div className="flex items-center justify-between gap-2 md:block md:flex md:justify-end">
                      <span className="text-xs font-black text-slate-400 md:hidden">ยอดรวม</span>
                      <p className="text-base font-black text-slate-950 tabular-nums">{formatTHB(item.quantity * item.unitPrice)} บาท</p>
                    </div>

                    <div className="flex items-center justify-between gap-2 md:block md:flex md:justify-center">
                      <span className="text-xs font-black text-slate-400 md:hidden">สต็อค</span>
                      <span className={`inline-flex min-w-12 justify-center text-sm font-black tabular-nums ${stock <= 0 ? "text-rose-700" : "text-slate-950"}`}>
                        {stock.toLocaleString("th-TH")}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 px-0 py-0 md:justify-center">
                      <button onClick={() => handleAddedQty(item.key, -1)} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#003366] text-white shadow-sm transition active:scale-90"><Minus className="h-4.5 w-4.5" strokeWidth={3} /></button>
                      <span className="min-w-9 text-center text-lg font-black text-slate-950 tabular-nums">{item.quantity.toLocaleString("th-TH")}</span>
                      <button onClick={() => handleAddedQty(item.key, +1)} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#003366] text-white shadow-sm transition active:scale-90"><Plus className="h-4.5 w-4.5" strokeWidth={3} /></button>
                    </div>

                    <button onClick={() => setAddedItems((current) => current.filter((draft) => draft.key !== item.key))} className="flex h-10 w-10 items-center justify-center justify-self-center rounded-full text-rose-500 transition hover:bg-rose-50 active:scale-90" aria-label={`ลบ ${item.productName}`}>
                      <Trash2 className="h-5 w-5" strokeWidth={2.3} />
                    </button>
                  </div>
                );
              })}

              {activeItems.map((item) => (
                <div key={item.id} className="grid gap-3 px-5 py-4 transition-colors hover:bg-slate-50 md:grid-cols-[minmax(0,1fr)_128px_144px_96px_160px_56px] md:items-center">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="relative h-18 w-18 shrink-0 overflow-hidden">
                      {item.imageUrl ? (
                        <Image src={item.imageUrl} alt={item.productName} fill sizes="72px" className="object-contain" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Package2 className="h-9 w-9 text-slate-300" strokeWidth={1.6} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-mono text-xs font-black uppercase tracking-wide text-[#003366]/70">{item.sku}</p>
                      <p className="mt-1 max-w-[28rem] text-[15px] font-black leading-snug text-slate-950">{item.productName}</p>
                      <p className="mt-1 text-xs font-bold text-slate-500">หน่วย {item.unit}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 md:block md:flex md:justify-end">
                    <span className="text-xs font-black text-slate-400 md:hidden">ราคา</span>
                    <p className="text-base font-black text-[#003366] tabular-nums">{formatTHB(item.unitPrice)} บาท</p>
                  </div>

                  <div className="flex items-center justify-between gap-2 md:block md:flex md:justify-end">
                    <span className="text-xs font-black text-slate-400 md:hidden">ยอดรวม</span>
                    <p className="text-base font-black text-slate-950 tabular-nums">{formatTHB((quantities[item.id] ?? item.quantity) * item.unitPrice)} บาท</p>
                  </div>

                  <div className="flex items-center justify-between gap-2 md:block md:flex md:justify-center">
                    <span className="text-xs font-black text-slate-400 md:hidden">สต็อค</span>
                    <span className={`inline-flex min-w-12 justify-center text-sm font-black tabular-nums ${item.stockQuantity <= 0 ? "text-rose-700" : "text-slate-950"}`}>
                      {item.stockQuantity.toLocaleString("th-TH")}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3 px-0 py-0 md:justify-center">
                    <button onClick={() => handleQty(item.id, -1)} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#003366] text-white shadow-sm transition active:scale-90"><Minus className="h-4.5 w-4.5" strokeWidth={3} /></button>
                    <span className="min-w-9 text-center text-lg font-black text-slate-950 tabular-nums">{(quantities[item.id] ?? item.quantity).toLocaleString("th-TH")}</span>
                    <button onClick={() => handleQty(item.id, +1)} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#003366] text-white shadow-sm transition active:scale-90"><Plus className="h-4.5 w-4.5" strokeWidth={3} /></button>
                  </div>

                  <button onClick={() => setRemoved((current) => new Set([...current, item.id]))} className="flex h-10 w-10 items-center justify-center justify-self-center rounded-full text-rose-500 transition hover:bg-rose-50 active:scale-90" aria-label={`ลบ ${item.productName}`}>
                    <Trash2 className="h-5 w-5" strokeWidth={2.3} />
                  </button>
                </div>
              ))}
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
            <button onClick={onDone} disabled={isSaving} className="rounded-xl bg-slate-50 px-6 py-3 text-sm font-black text-slate-500 uppercase tracking-widest active:scale-95 disabled:opacity-50">ยกเลิก</button>
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

// ─── Main modal ───────────────────────────────────────────────────────────────

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

  const [editMode, setEditMode] = useState(startInEditMode);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [navPending, startNavTransition] = useTransition();
  const [actionPending, startActionTransition] = useTransition();

  const [slideAnim, setSlideAnim] = useState<"slide-left" | "slide-right" | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reset modal state when navigating between order records.
    setEditMode(startInEditMode);
    setConfirmCancel(false);
    setSlideAnim(null);
  }, [expandedId, startInEditMode]);

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
      p.delete("expanded"); p.delete("edit");
      startActionTransition(() => { router.replace(`${pathname}?${p.toString()}`, { scroll: false }); });
    }, 350);
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
            <button onClick={close} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/70 transition hover:bg-white/20 active:scale-90"><X className="h-6 w-6" strokeWidth={3} /></button>
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

          {confirmCancel ? (
            <div className="flex h-full flex-col items-center justify-center text-center px-10 animate-in fade-in zoom-in-95 duration-200">
              <div className="mb-6 rounded-[2.5rem] bg-rose-50 p-8 shadow-inner">
                <XCircle className="h-16 w-16 text-rose-500" strokeWidth={1} />
              </div>
              <h3 className="text-2xl font-black text-slate-950 tracking-tight">ยืนยันการยกเลิก?</h3>
              <p className="mt-4 text-sm font-medium text-slate-500 leading-relaxed max-w-xs mx-auto">
                คุณแน่ใจหรือไม่ว่าต้องการยกเลิกออเดอร์ <span className="font-mono font-bold text-slate-950">{detail.orderNumber}</span>?
                การดำเนินการนี้จะคืนสินค้าเข้าสต็อกทั้งหมด
              </p>
              <div className="mt-12 flex w-full max-w-xs gap-3">
                <button onClick={() => setConfirmCancel(false)} className="flex-1 rounded-2xl border border-slate-200 py-4 text-xs font-black text-slate-500 uppercase tracking-widest active:scale-95 transition-all">กลับ</button>
                <button onClick={() => { startActionTransition(async () => { const fd = new FormData(); fd.set("orderId", detail.id); await cancelOrderAction(fd); close(); }); }} disabled={actionPending} className="flex-1 rounded-2xl bg-rose-600 py-4 text-xs font-black text-white shadow-xl uppercase tracking-widest active:scale-95 disabled:opacity-50">ยืนยันยกเลิก</button>
              </div>
            </div>
          ) : editMode ? (
            <EditItemsPanel detail={detail} onDone={() => { setEditMode(false); router.refresh(); }} products={products} />
          ) : (
            <div className="flex flex-col h-full">
              {/* Scrollable Body */}
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <ItemsViewList detail={detail} />
              </div>

              {/* Sticky Bottom Actions */}
              <div className="shrink-0 border-t-2 border-slate-200 bg-white px-6 py-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-15px_40px_rgba(0,0,0,0.06)]">
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

                <div className="flex gap-3">
                  <button onClick={() => setConfirmCancel(true)} className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-rose-700 py-4 text-[13px] font-black text-white uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-rose-100">
                    ยกเลิก
                  </button>
                  <button onClick={() => setEditMode(true)} className="flex-[2] flex items-center justify-center gap-2 rounded-2xl bg-[#003366] py-4 text-[14px] font-black text-white shadow-xl shadow-[#003366]/20 uppercase tracking-widest active:scale-95 transition-all">
                    <Edit3 className="h-5 w-5" />
                    แก้ไขรายการ
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
