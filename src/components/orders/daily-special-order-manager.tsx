"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Building2, Check, ChevronDown, Minus, PackageCheck, Plus, Search, ShoppingBasket, Trash2, Truck, X } from "lucide-react";
import { createPortal } from "react-dom";
import { saveDailySpecialItemsAction, type SaveDailySpecialItemInput } from "@/app/orders/incoming/special-order-actions";
import type { DailySpecialCatalogProduct, DailySpecialItem, DailySpecialItemType } from "@/lib/orders/daily-special-items";
import type { OrderVehicleOption } from "@/lib/orders/manage";

type Props = {
  date: string;
  initialItems: DailySpecialItem[];
  variant?: "desktop" | "mobile" | "mobile-compact";
  products: DailySpecialCatalogProduct[];
  vehicles: OrderVehicleOption[];
};

type CartItem = SaveDailySpecialItemInput;

const typeMeta = {
  office: { label: "เข้าออฟฟิศ", icon: Building2, tone: "purple" },
  claim: { label: "เคลม", icon: PackageCheck, tone: "pink" },
} as const;

function cartKey(item: Pick<CartItem, "type" | "vehicleId" | "productId">) {
  return `${item.type}:${item.vehicleId}:${item.productId}`;
}

function initialItemsToCart(items: DailySpecialItem[]): CartItem[] {
  return items.map(({ productId, quantity, type, vehicleId }) => ({
    productId,
    quantity,
    type,
    vehicleId,
  }));
}

function formatDate(date: string) {
  const [year, month, day] = date.split("-");
  return year && month && day ? `${day}/${month}/${Number(year) + 543}` : date;
}

export function DailySpecialOrderManager({ date, initialItems, products, variant = "mobile", vehicles }: Props) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [type, setType] = useState<DailySpecialItemType>("office");
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [cart, setCart] = useState<CartItem[]>(() => initialItemsToCart(initialItems));
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isOpen]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 1300);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!isMenuOpen) return;
    const closeMenu = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setIsMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeMenu);
    return () => document.removeEventListener("pointerdown", closeMenu);
  }, [isMenuOpen]);

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const vehicleById = useMemo(() => new Map(vehicles.map((vehicle) => [vehicle.id, vehicle])), [vehicles]);
  const filteredProducts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("th");
    if (!term) return products;
    return products.filter((product) => `${product.sku} ${product.name}`.toLocaleLowerCase("th").includes(term));
  }, [products, search]);
  const selectedCount = Object.values(draft).filter((quantity) => quantity > 0).length;

  const groups = useMemo(() => {
    const result = new Map<string, CartItem[]>();
    for (const item of cart) {
      const key = `${item.type}:${item.vehicleId}`;
      result.set(key, [...(result.get(key) ?? []), item]);
    }
    return Array.from(result.entries());
  }, [cart]);

  function updateDraft(productId: string, quantity: number) {
    setDraft((current) => {
      const next = { ...current };
      if (!Number.isFinite(quantity) || quantity <= 0) delete next[productId];
      else next[productId] = quantity;
      return next;
    });
  }

  function addToCart() {
    if (!vehicleId || selectedCount === 0) return;
    setCart((current) => {
      const map = new Map(current.map((item) => [cartKey(item), item]));
      for (const [productId, quantity] of Object.entries(draft)) {
        if (quantity <= 0) continue;
        const item = { productId, quantity, type, vehicleId } satisfies CartItem;
        map.set(cartKey(item), item);
      }
      return Array.from(map.values());
    });
    setDraft({});
    setSearch("");
    setToast(`เพิ่ม ${selectedCount} รายการลงตะกร้าแล้ว`);
  }

  function removeFromCart(item: CartItem) {
    setCart((current) => current.filter((candidate) => cartKey(candidate) !== cartKey(item)));
  }

  function saveAll() {
    setError(null);
    startTransition(async () => {
      const result = await saveDailySpecialItemsAction(date, cart);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setToast("บันทึกเรียบร้อย");
      setIsOpen(false);
      router.refresh();
    });
  }

  const mobileTrigger = (
    <div className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-2 rounded-2xl border border-[#E1BEE7] bg-white p-2.5 shadow-[0_10px_28px_rgba(74,20,140,0.08)] sm:flex sm:w-auto sm:min-w-[360px]">
      <button type="button" onClick={() => setIsOpen(true)} className="flex min-w-0 items-center gap-2 px-2 text-left text-[#4A148C]">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#F3E5F5]"><Plus className="h-5 w-5" /></span>
        <span className="min-w-0"><strong className="block truncate text-sm font-black">เพิ่มรายการพิเศษ</strong><small className="block truncate text-[10px] font-bold text-[#4A148C]/65">ประจำวันที่ {formatDate(date)}</small></span>
      </button>
      <button type="button" onClick={() => { setType("office"); setIsOpen(true); }} className="rounded-xl border border-[#CE93D8] px-3 py-2 text-xs font-black text-[#4A148C] transition hover:bg-[#F3E5F5] active:scale-95">เข้าออฟฟิศ</button>
      <button type="button" onClick={() => { setType("claim"); setIsOpen(true); }} className="rounded-xl border border-pink-300 px-3 py-2 text-xs font-black text-pink-600 transition hover:bg-pink-50 active:scale-95">เคลม</button>
    </div>
  );

  const desktopTrigger = (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setIsMenuOpen((open) => !open)}
        aria-expanded={isMenuOpen}
        aria-haspopup="menu"
        className={`inline-flex h-12 min-w-[148px] items-center justify-center gap-2 rounded-xl border bg-white px-4 text-sm font-black text-[#4A148C] shadow-sm transition hover:border-[#CE93D8] hover:bg-[#FBF7FC] active:scale-[0.98] ${isMenuOpen ? "border-[#AB47BC] ring-2 ring-[#EA80FC]/20" : "border-[#EA80FC]/45"}`}
      >
        <Plus className="h-4.5 w-4.5" strokeWidth={2.5} />
        รายการพิเศษ
        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isMenuOpen ? "rotate-180" : ""}`} />
      </button>

      {isMenuOpen ? (
        <div role="menu" className="animate-in fade-in zoom-in-95 absolute right-0 top-[calc(100%+8px)] z-[80] w-[220px] overflow-hidden rounded-2xl border border-[#E1BEE7] bg-white p-2 shadow-[0_20px_48px_rgba(74,20,140,0.18)] duration-150">
          <button
            type="button"
            role="menuitem"
            onClick={() => { setType("office"); setIsMenuOpen(false); setIsOpen(true); }}
            className="group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-[#F3E5F5]"
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#F3E5F5] text-[#4A148C] transition group-hover:bg-white"><Building2 className="h-4.5 w-4.5" /></span>
            <span><strong className="block text-sm font-black text-[#4A148C]">เข้าออฟฟิศ</strong><small className="text-[10px] font-bold text-slate-500">เพิ่มในใบสั่งของโรงงาน</small></span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { setType("claim"); setIsMenuOpen(false); setIsOpen(true); }}
            className="group mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-pink-50"
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-pink-50 text-pink-600 transition group-hover:bg-white"><PackageCheck className="h-4.5 w-4.5" /></span>
            <span><strong className="block text-sm font-black text-pink-600">เคลม</strong><small className="text-[10px] font-bold text-slate-500">เพิ่มในใบขึ้นของตามรถ</small></span>
          </button>
        </div>
      ) : null}
    </div>
  );

  const mobileCompactTrigger = (
    <button
      type="button"
      onClick={() => setIsOpen(true)}
      className="inline-flex h-9 w-full min-w-0 items-center justify-center gap-2 rounded-lg border border-[#4A148C]/25 bg-[#F3E5F5] px-3 text-xs font-black text-[#4A148C] transition hover:border-[#4A148C]/40 hover:bg-[#EA80FC]/20 active:scale-[0.98]"
    >
      <Plus className="h-4 w-4 shrink-0" strokeWidth={2.4} />
      <span className="truncate">รายการพิเศษ</span>
    </button>
  );

  return (
    <>
      {variant === "mobile" ? mobileTrigger : variant === "mobile-compact" ? mobileCompactTrigger : desktopTrigger}
      {toast ? <div className="fixed left-1/2 top-5 z-[700] flex -translate-x-1/2 items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-black text-white shadow-xl"><Check className="h-4 w-4" />{toast}</div> : null}
      {isOpen && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-[600] flex items-end justify-center bg-slate-950/45 backdrop-blur-sm sm:items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsOpen(false); }}>
          <div className="flex h-[100dvh] w-[100dvw] max-w-none flex-col overflow-hidden rounded-none bg-[#FBF8FC] shadow-2xl sm:h-[88vh] sm:w-full sm:max-w-[1320px] sm:rounded-[30px]">
            <header className="flex shrink-0 items-center justify-between border-b border-[#E1BEE7] bg-white px-4 py-3 sm:px-6 sm:py-4">
              <div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#4A148C] text-white"><ShoppingBasket className="h-5 w-5" /></span><div className="min-w-0"><h2 className="truncate text-lg font-black text-[#4A148C]">เพิ่มรายการพิเศษ</h2><p className="truncate text-xs font-bold text-slate-500">ไม่แสดงราคา · เลือกหลายสินค้า · {formatDate(date)}</p></div></div>
              <button type="button" onClick={() => setIsOpen(false)} className="ml-2 shrink-0 rounded-full bg-slate-100 p-2.5 text-slate-500 transition hover:bg-slate-200" aria-label="ปิด"><X className="h-5 w-5" /></button>
            </header>

            <div className="grid min-h-0 min-w-0 flex-1 lg:grid-cols-[minmax(0,1fr)_360px]">
              <main className="flex min-h-0 min-w-0 flex-col overflow-hidden">
                <div className="shrink-0 space-y-3 border-b border-[#E1BEE7]/70 bg-white px-4 py-3 sm:px-6">
                  <div className="grid grid-cols-2 rounded-2xl bg-[#F3E5F5] p-1">
                    {(["office", "claim"] as const).map((entryType) => {
                      const meta = typeMeta[entryType]; const Icon = meta.icon; const selected = type === entryType;
                      return <button key={entryType} type="button" onClick={() => { setType(entryType); setDraft({}); }} className={`flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-black transition ${selected ? entryType === "office" ? "bg-[#4A148C] text-white shadow-md" : "bg-pink-500 text-white shadow-md" : "text-[#4A148C]"}`}><Icon className="h-4.5 w-4.5" />{meta.label}</button>;
                    })}
                  </div>
                  <div className="mobile-special-filter-row grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-2 sm:hidden">
                    <label className="relative min-w-0">
                      <Truck className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[#4A148C]" />
                      <select
                        value={vehicleId}
                        onChange={(event) => { setVehicleId(event.target.value); setDraft({}); }}
                        className="h-11 w-full appearance-none rounded-xl border border-[#CE93D8] bg-white pl-9 pr-8 text-sm font-black text-[#4A148C] outline-none focus:border-[#7B1FA2] focus:ring-2 focus:ring-[#EA80FC]/25"
                        aria-label="เลือกรถ"
                      >
                        {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.name}</option>)}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4A148C]" />
                    </label>
                    <label className="relative min-w-0">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4A148C]/60" />
                      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาสินค้า" className="h-11 w-full min-w-0 rounded-xl border border-[#E1BEE7] bg-[#FBF8FC] pl-9 pr-3 text-sm font-bold text-slate-900 outline-none focus:border-[#AB47BC] focus:ring-2 focus:ring-[#EA80FC]/20" />
                    </label>
                  </div>
                  <div className="hidden gap-2 overflow-x-auto pb-1 no-scrollbar sm:flex">
                    {vehicles.map((vehicle) => <button key={vehicle.id} type="button" onClick={() => { setVehicleId(vehicle.id); setDraft({}); }} className={`flex h-10 shrink-0 items-center gap-2 rounded-xl border px-4 text-sm font-black transition active:scale-95 ${vehicleId === vehicle.id ? "border-[#4A148C] bg-[#4A148C] text-white" : "border-[#E1BEE7] bg-white text-[#4A148C]"}`}><Truck className="h-4 w-4" />{vehicle.name}</button>)}
                  </div>
                  <label className="relative hidden sm:block"><Search className="absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-[#4A148C]/60" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาชื่อหรือรหัสสินค้า" className="h-11 w-full rounded-xl border border-[#E1BEE7] bg-[#FBF8FC] pl-10 pr-4 text-sm font-bold text-slate-900 outline-none focus:border-[#AB47BC] focus:ring-2 focus:ring-[#EA80FC]/20" /></label>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-6">
                  <div className="grid gap-2 xl:grid-cols-2">
                    {filteredProducts.map((product) => {
                      const quantity = draft[product.id] ?? 0; const selected = quantity > 0;
                      return <article key={product.id} className={`grid min-w-0 grid-cols-[24px_52px_minmax(0,1fr)] items-start gap-x-2.5 gap-y-2 rounded-2xl border bg-white px-3 py-3 transition sm:grid-cols-[24px_52px_minmax(0,1fr)_112px] sm:items-center sm:gap-3 sm:p-2.5 ${selected ? type === "claim" ? "border-pink-400 shadow-[0_8px_20px_rgba(236,72,153,.10)]" : "border-[#9C27B0] shadow-[0_8px_20px_rgba(74,20,140,.10)]" : "border-slate-200"}`}>
                        <button type="button" onClick={() => updateDraft(product.id, selected ? 0 : 1)} className={`mt-1 grid h-5 w-5 place-items-center rounded-md border text-white ${selected ? "border-[#4A148C] bg-[#4A148C]" : "border-slate-300 bg-white"}`} aria-label={selected ? `ยกเลิกเลือก ${product.name}` : `เลือก ${product.name}`}>{selected ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}</button>
                        <button type="button" onClick={() => updateDraft(product.id, selected ? 0 : 1)} className="relative h-12 w-12 overflow-hidden bg-transparent">
                          {product.imageUrl ? <Image src={product.imageUrl} alt={product.name} fill sizes="48px" className="object-contain" /> : <PackageCheck className="m-2.5 h-7 w-7 text-slate-300" />}
                        </button>
                        <button type="button" onClick={() => updateDraft(product.id, selected ? 0 : 1)} className="min-w-0 self-start text-left sm:self-center"><strong className="mobile-special-product-name block whitespace-normal break-words text-sm font-black leading-5 text-slate-900">{product.name}</strong><span className="mt-1 block text-[11px] font-bold leading-4 text-slate-500">{product.sku} · {product.unit}</span></button>
                        <div className="col-start-3 row-start-2 grid w-28 grid-cols-[32px_1fr_32px] justify-self-end overflow-hidden rounded-xl border border-slate-200 bg-slate-50 sm:col-start-4 sm:row-start-1 sm:w-auto sm:self-center"><button type="button" onClick={() => updateDraft(product.id, quantity - 1)} className="grid h-9 place-items-center text-slate-500 active:bg-slate-200"><Minus className="h-3.5 w-3.5" /></button><input inputMode="decimal" value={quantity || ""} onChange={(event) => updateDraft(product.id, Number(event.target.value))} placeholder="0" className="min-w-0 bg-white text-center text-sm font-black outline-none" /><button type="button" onClick={() => updateDraft(product.id, quantity + 1)} className="grid h-9 place-items-center text-[#4A148C] active:bg-[#F3E5F5]"><Plus className="h-3.5 w-3.5" /></button></div>
                      </article>;
                    })}
                  </div>
                </div>

                <div className="shrink-0 border-t border-[#E1BEE7] bg-white p-3 sm:px-6"><button type="button" onClick={addToCart} disabled={!vehicleId || selectedCount === 0} className={`flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-black text-white shadow-lg transition active:scale-[.99] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none ${type === "claim" ? "bg-pink-500" : "bg-[#4A148C]"}`}><ShoppingBasket className="h-4.5 w-4.5" />เพิ่มลงตะกร้า {selectedCount > 0 ? `${selectedCount} รายการ` : ""}</button></div>
              </main>

              <aside className="hidden min-h-0 flex-col border-l border-[#E1BEE7] bg-white lg:flex">
                <div className="flex items-center justify-between border-b border-[#E1BEE7] px-5 py-4"><div><h3 className="font-black text-[#4A148C]">ตะกร้ารายการพิเศษ</h3><p className="text-xs font-bold text-slate-500">{cart.length} รายการ · {groups.length} กลุ่ม</p></div><ShoppingBasket className="h-5 w-5 text-[#AB47BC]" /></div>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">{groups.map(([key, items]) => { const first = items[0]; if (!first) return null; const meta = typeMeta[first.type]; return <section key={key} className="overflow-hidden rounded-2xl border border-[#E1BEE7]"><header className="flex items-center justify-between bg-[#FBF8FC] px-3 py-2.5"><strong className="text-xs font-black text-[#4A148C]">{vehicleById.get(first.vehicleId)?.name} · {meta.label}</strong><span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-slate-500">{items.length}</span></header><div className="divide-y divide-slate-100">{items.map((item) => <div key={cartKey(item)} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 px-3 py-2"><span className="truncate text-xs font-bold text-slate-700">{productById.get(item.productId)?.name}</span><strong className="text-xs text-slate-950">{item.quantity.toLocaleString("th-TH")}</strong><button type="button" onClick={() => removeFromCart(item)} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div></section>; })}</div>
                <div className="border-t border-[#E1BEE7] p-4">{error ? <p className="mb-2 text-xs font-bold text-rose-600">{error}</p> : null}<button type="button" onClick={saveAll} disabled={isPending} className="h-12 w-full rounded-2xl bg-[#4A148C] text-sm font-black text-white shadow-[0_12px_24px_rgba(74,20,140,.22)] transition active:scale-[.99] disabled:opacity-60">{isPending ? "กำลังบันทึก..." : "บันทึกทั้งหมด"}</button></div>
              </aside>
            </div>

            <div className="shrink-0 border-t border-[#E1BEE7] bg-white p-3 lg:hidden">
              {isMobileCartOpen ? (
                <div className="max-h-[34dvh] space-y-2 overflow-y-auto pb-2">
                  {groups.map(([key, items]) => {
                    const first = items[0];
                    if (!first) return null;
                    return (
                      <section key={key} className="mobile-special-cart-group overflow-hidden rounded-xl border border-[#E1BEE7] bg-white">
                        <header className="flex items-center justify-between bg-[#FBF8FC] px-3 py-2">
                          <strong className="text-xs font-black text-[#4A148C]">{vehicleById.get(first.vehicleId)?.name} · {typeMeta[first.type].label}</strong>
                          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-slate-600">{items.length} รายการ</span>
                        </header>
                        <div className="divide-y divide-slate-100">
                          {items.map((item) => {
                            const product = productById.get(item.productId);
                            return (
                              <div key={cartKey(item)} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-3 py-2.5">
                                <div className="min-w-0">
                                  <strong className="block whitespace-normal break-words text-[13px] font-black leading-5 text-slate-900">{product?.name}</strong>
                                  <span className="mt-0.5 block text-[11px] font-bold text-slate-500">{product?.sku} · {product?.unit}</span>
                                </div>
                                <strong className="min-w-8 text-right text-sm font-black tabular-nums text-slate-950">{item.quantity.toLocaleString("th-TH")}</strong>
                                <button type="button" onClick={() => removeFromCart(item)} className="grid h-8 w-8 place-items-center rounded-lg text-rose-500 active:bg-rose-50" aria-label={`ลบ ${product?.name ?? "สินค้า"}`}><Trash2 className="h-4 w-4" /></button>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    );
                  })}
                </div>
              ) : null}
              {error ? <p className="mb-2 text-xs font-bold text-rose-600">{error}</p> : null}
              <div className="mobile-special-action-row grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-2">
                <button type="button" onClick={() => setIsMobileCartOpen((open) => !open)} aria-expanded={isMobileCartOpen} className="flex h-12 min-w-0 items-center justify-center gap-1.5 rounded-2xl bg-[#F3E5F5] px-2 text-sm font-black text-[#4A148C]">
                  <ShoppingBasket className="h-4 w-4 shrink-0" />
                  <span className="truncate">ดูตะกร้า ({cart.length})</span>
                  <ChevronDown className={`h-4 w-4 shrink-0 transition ${isMobileCartOpen ? "rotate-180" : ""}`} />
                </button>
                <button type="button" onClick={saveAll} disabled={isPending} className="h-12 min-w-0 rounded-2xl bg-[#4A148C] px-3 text-sm font-black text-white shadow-lg disabled:opacity-60">{isPending ? "กำลังบันทึก..." : "บันทึกทั้งหมด"}</button>
              </div>
            </div>
          </div>
        </div>, document.body) : null}
    </>
  );
}
