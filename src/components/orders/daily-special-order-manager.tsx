"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Building2,
  Check,
  ChevronDown,
  ListFilter,
  Minus,
  PackageCheck,
  PackageMinus,
  Plus,
  Search,
  ShoppingBasket,
  Trash2,
  Truck,
  X,
} from "lucide-react";
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
  remaining: { label: "ของเหลือ", icon: PackageMinus, tone: "amber" },
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
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState("__all__");
  const [selectedBrand, setSelectedBrand] = useState("__all__");
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

  const categoryOptions = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; sortOrder: number }>();
    for (const product of products) {
      if (!product.categoryIds || !product.categoryNames) continue;
      for (let i = 0; i < product.categoryIds.length; i++) {
        const id = product.categoryIds[i];
        const name = product.categoryNames[i];
        const sortOrder = product.categorySortOrders?.[i] ?? Number.MAX_SAFE_INTEGER;
        if (id && name && !seen.has(id)) {
          seen.set(id, { id, name, sortOrder });
        }
      }
    }
    return Array.from(seen.values()).sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "th"),
    );
  }, [products]);

  const brandOptions = useMemo(() => {
    const brands = new Set<string>();
    for (const product of products) {
      if (selectedCategoryId !== "__all__" && !product.categoryIds?.includes(selectedCategoryId)) {
        continue;
      }
      const b = product.brand?.trim();
      if (b) brands.add(b);
    }
    return Array.from(brands).sort((a, b) => a.localeCompare(b, "th"));
  }, [products, selectedCategoryId]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("th");
    let available = type === "remaining" ? products.filter((product) => product.isFresh) : products;

    if (selectedCategoryId !== "__all__") {
      available = available.filter((p) => p.categoryIds?.includes(selectedCategoryId));
    }

    if (selectedBrand !== "__all__") {
      available = available.filter((p) => p.brand?.trim() === selectedBrand);
    }

    if (term) {
      available = available.filter((product) =>
        `${product.sku} ${product.name}`.toLocaleLowerCase("th").includes(term),
      );
    }

    return available;
  }, [products, search, type, selectedCategoryId, selectedBrand]);

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
    setIsSearchOpen(false);
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
            onClick={() => { setType("remaining"); setIsMenuOpen(false); setIsOpen(true); }}
            className="group mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-amber-50"
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-50 text-amber-700 transition group-hover:bg-white"><PackageMinus className="h-4.5 w-4.5" /></span>
            <span><strong className="block text-sm font-black text-amber-700">ของเหลือ</strong><small className="text-[10px] font-bold text-slate-500">หักยอดผลิตสดตามรถ</small></span>
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
      {toast ? (
        <div className="fixed left-1/2 top-5 z-[700] flex -translate-x-1/2 items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-black text-white shadow-xl animate-in fade-in">
          <Check className="h-4 w-4" />
          {toast}
        </div>
      ) : null}

      {isOpen && typeof document !== "undefined" ? createPortal(
        <div
          className="fixed inset-0 z-[600] flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-5 animate-in fade-in duration-150"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsOpen(false);
          }}
        >
          <div className="relative flex h-[100dvh] w-[100dvw] max-w-none flex-col overflow-hidden rounded-none bg-white font-[family:var(--font-noto-sans-thai)] subpixel-antialiased sm:h-[90vh] sm:w-full sm:max-w-[1240px] sm:rounded-3xl sm:border sm:border-slate-200 sm:shadow-[0_12px_40px_rgba(0,0,0,0.12)]">
            
            {/* Modal Header */}
            <header className="flex shrink-0 items-center justify-between border-b border-[#E1BEE7] bg-white px-3.5 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:px-6 sm:py-3.5">
              <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#4A148C] text-white shadow-sm">
                  <ShoppingBasket className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-bold text-[#4A148C] sm:text-lg leading-tight">
                    เพิ่มรายการพิเศษ
                  </h2>
                  <p className="truncate text-xs font-medium text-slate-500 leading-tight mt-0.5">
                    ไม่แสดงราคา · เลือกหลายสินค้า · {formatDate(date)}
                  </p>
                </div>
              </div>

              {/* Action Buttons: Search right in front of [X] close button */}
              <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => setIsSearchOpen((prev) => !prev)}
                  className="relative flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 active:scale-95"
                  aria-label="ค้นหาสินค้า"
                >
                  <Search className="h-4.5 w-4.5" />
                  {search ? (
                    <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#4A148C]" />
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-800 active:scale-95"
                  aria-label="ปิด"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </header>

            {/* Slide-Down Search Drawer */}
            {isSearchOpen ? (
              <div className="fixed inset-0 z-[10020] flex flex-col justify-start bg-slate-950/45 animate-in fade-in duration-200">
                <div className="w-full bg-white shadow-xl animate-in slide-in-from-top-full duration-250 rounded-b-2xl border-b border-[#E1BEE7] p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <Search className="h-5 w-5 text-[#4A148C]" strokeWidth={2.5} />
                      <h3 className="text-base font-bold text-slate-900">ค้นหารายการพิเศษ</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsSearchOpen(false)}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
                      aria-label="ปิดค้นหา"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="relative mt-3">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      autoFocus
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="ค้นหาชื่อ หรือรหัสสินค้า..."
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 py-2.5 pl-10 pr-9 text-sm sm:text-base font-medium text-slate-900 placeholder:text-slate-400 focus:border-[#4A148C] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#4A148C]"
                    />
                    {search ? (
                      <button
                        type="button"
                        onClick={() => setSearch("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-2.5 flex items-center justify-between text-xs font-semibold text-slate-500">
                    <span>พบ {filteredProducts.length} รายการ</span>
                    <button
                      type="button"
                      onClick={() => setIsSearchOpen(false)}
                      className="font-bold text-[#4A148C] hover:underline"
                    >
                      เสร็จสิ้น
                    </button>
                  </div>
                </div>
                <div className="flex-1" onClick={() => setIsSearchOpen(false)} />
              </div>
            ) : null}

            {/* 3 Tabs: เข้าออฟฟิศ, เคลม, ของเหลือ (ชิดกับ Header ด้านบนเลย) */}
            <div className="shrink-0 border-b border-[#E1BEE7] bg-[#F3E5F5]/30">
              <div className="grid grid-cols-3 divide-x divide-[#E1BEE7]">
                {(["office", "claim", "remaining"] as const).map((entryType) => {
                  const meta = typeMeta[entryType];
                  const Icon = meta.icon;
                  const isSelected = type === entryType;
                  return (
                    <button
                      key={entryType}
                      type="button"
                      onClick={() => {
                        setType(entryType);
                        setDraft({});
                      }}
                      className={`flex h-11 items-center justify-center gap-1.5 text-xs sm:text-sm font-bold transition active:scale-[0.99] ${
                        isSelected
                          ? entryType === "office"
                            ? "bg-[#4A148C] text-white shadow-xs"
                            : entryType === "claim"
                            ? "bg-pink-600 text-white shadow-xs"
                            : "bg-amber-600 text-white shadow-xs"
                          : "bg-white text-slate-700 hover:bg-[#F3E5F5]/60 hover:text-[#4A148C]"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{meta.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Vehicle Selector (ชิดติดใต้แท็บ 3 อัน) */}
            <div className="shrink-0 border-b border-slate-200 bg-slate-50 px-3 py-2 sm:px-6">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
                <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-slate-500 mr-0.5">
                  <Truck className="h-3.5 w-3.5" />
                  <span>รถ:</span>
                </span>
                {vehicles.map((v) => {
                  const isSelected = vehicleId === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        setVehicleId(v.id);
                        setDraft({});
                      }}
                      className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs sm:text-sm font-bold transition active:scale-95 ${
                        isSelected
                          ? type === "claim"
                            ? "bg-pink-600 text-white shadow-xs"
                            : type === "remaining"
                            ? "bg-amber-600 text-white shadow-xs"
                            : "bg-[#4A148C] text-white shadow-xs"
                          : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
                      }`}
                    >
                      <span>{v.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Category & Brand Bars (เหมือน design modal เพิ่มสินค้า) */}
            {categoryOptions.length > 0 ? (
              <div className="shrink-0 border-b border-slate-200 bg-white">
                {/* Category bar */}
                <div className="flex items-center gap-3 px-3 sm:px-6 border-b border-slate-100">
                  <div className="flex h-10 shrink-0 items-center gap-1 text-xs sm:text-sm font-bold text-[#4A148C]">
                    <ListFilter className="h-3.5 w-3.5" />
                    <span>หมวดหมู่</span>
                  </div>
                  <div className="flex min-w-0 flex-1 items-center gap-5 overflow-x-auto no-scrollbar">
                    <button
                      type="button"
                      onClick={(e) => {
                        setSelectedCategoryId("__all__");
                        setSelectedBrand("__all__");
                        e.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
                      }}
                      className={`relative h-10 shrink-0 px-1 text-xs sm:text-sm font-bold whitespace-nowrap transition-colors ${
                        selectedCategoryId === "__all__" ? "text-[#4A148C]" : "text-slate-500 hover:text-slate-800"
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
                        onClick={(e) => {
                          setSelectedCategoryId(c.id);
                          setSelectedBrand("__all__");
                          e.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
                        }}
                        className={`relative h-10 shrink-0 px-1 text-xs sm:text-sm font-bold whitespace-nowrap transition-colors ${
                          selectedCategoryId === c.id ? "text-[#4A148C]" : "text-slate-500 hover:text-slate-800"
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

                {/* Brand bar */}
                {brandOptions.length > 0 ? (
                  <div className="flex items-center gap-3 bg-slate-50/60 px-3 sm:px-6">
                    <div className="flex h-9 shrink-0 items-center gap-1 text-xs sm:text-sm font-bold text-[#4A148C]">
                      <ListFilter className="h-3.5 w-3.5" />
                      <span>แบรนด์</span>
                    </div>
                    <div className="flex min-w-0 flex-1 items-center gap-5 overflow-x-auto no-scrollbar">
                      <button
                        type="button"
                        onClick={(e) => {
                          setSelectedBrand("__all__");
                          e.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
                        }}
                        className={`relative flex h-9 shrink-0 items-center whitespace-nowrap px-1 text-xs sm:text-sm font-bold transition-colors ${
                          selectedBrand === "__all__" ? "text-[#4A148C]" : "text-slate-500 hover:text-slate-800"
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
                          onClick={(e) => {
                            setSelectedBrand(brand);
                            e.currentTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
                          }}
                          className={`relative flex h-9 shrink-0 items-center whitespace-nowrap px-1 text-xs sm:text-sm font-bold transition-colors ${
                            selectedBrand === brand ? "text-[#4A148C]" : "text-slate-500 hover:text-slate-800"
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

            {/* Main Area: Product Grid (Left/Center) + Cart Aside (Right on Desktop) */}
            <div className="grid min-h-0 min-w-0 flex-1 lg:grid-cols-[minmax(0,1fr)_360px]">
              <main className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-slate-50/50">
                {/* 2-Card Grid Area */}
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2.5 sm:p-4">
                  {filteredProducts.length === 0 ? (
                    <div className="flex h-56 flex-col items-center justify-center text-center">
                      <Search className="h-10 w-10 text-slate-300" />
                      <p className="mt-2 text-sm font-bold text-slate-500">
                        ไม่พบสินค้าที่ตรงกับการค้นหา
                      </p>
                      {search ? (
                        <button
                          type="button"
                          onClick={() => setSearch("")}
                          className="mt-2 text-xs font-bold text-[#4A148C] underline"
                        >
                          ล้างการค้นหา
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
                      {filteredProducts.map((product) => {
                        const quantity = draft[product.id] ?? 0;
                        const selected = quantity > 0;
                        return (
                          <article
                            key={product.id}
                            className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border p-2.5 transition-all select-none sm:p-3 ${
                              selected
                                ? type === "claim"
                                  ? "border-pink-500 bg-pink-50/40 ring-1 ring-pink-500/20"
                                  : type === "remaining"
                                  ? "border-amber-500 bg-amber-50/40 ring-1 ring-amber-500/20"
                                  : "border-[#4A148C] bg-[#FAF5FF] ring-1 ring-[#4A148C]/20"
                                : "border-slate-200 bg-white hover:border-slate-300 shadow-xs"
                            }`}
                          >
                            {/* Top: SKU & Selected Badge */}
                            <div className="flex items-center justify-between gap-1">
                              <span className="truncate rounded bg-slate-100 px-1.5 py-0.5 text-[10px] sm:text-[11px] font-mono font-bold text-slate-600">
                                {product.sku}
                              </span>
                              {selected ? (
                                <span
                                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white shadow-xs ${
                                    type === "claim" ? "bg-pink-500" : type === "remaining" ? "bg-amber-500" : "bg-[#4A148C]"
                                  }`}
                                >
                                  <Check className="h-3 w-3 stroke-[3]" />
                                </span>
                              ) : (
                                <span className="text-[10px] sm:text-[11px] font-semibold text-slate-400">
                                  {product.unit}
                                </span>
                              )}
                            </div>

                            {/* Middle: Product Image & Name */}
                            <div className="my-2 flex flex-col items-center gap-1.5">
                              <div className="relative h-16 w-16 sm:h-20 sm:w-20 shrink-0 overflow-hidden rounded-xl bg-slate-50 flex items-center justify-center">
                                {product.imageUrl ? (
                                  <Image
                                    src={product.imageUrl}
                                    alt={product.name}
                                    fill
                                    sizes="80px"
                                    className="object-contain p-1"
                                  />
                                ) : (
                                  <PackageCheck className="h-8 w-8 text-slate-300" />
                                )}
                              </div>

                              {/* Product Name: FULL text, NO ellipsis (...), max 2 lines */}
                              <div className="w-full text-center">
                                <h4
                                  title={product.name}
                                  className="text-xs sm:text-[13px] font-bold text-slate-900 leading-snug break-words line-clamp-2 min-h-[2.4em] flex items-center justify-center"
                                >
                                  {product.name}
                                </h4>
                                <p className="mt-0.5 text-[10px] sm:text-[11px] font-semibold text-slate-500">
                                  หน่วย: {product.unit}
                                </p>
                              </div>
                            </div>

                            {/* Bottom: Stepper [-] [number] [+] */}
                            <div className="mt-1 flex items-center rounded-xl border border-slate-200 bg-slate-50 p-0.5 shadow-inner">
                              <button
                                type="button"
                                onClick={() => updateDraft(product.id, Math.max(0, quantity - 1))}
                                disabled={quantity <= 0}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-200 active:scale-90 disabled:opacity-30 disabled:pointer-events-none"
                                aria-label="ลดจำนวน"
                              >
                                <Minus className="h-3.5 w-3.5 stroke-[2.5]" />
                              </button>
                              <input
                                type="number"
                                inputMode="decimal"
                                min="0"
                                value={quantity || ""}
                                onChange={(event) => updateDraft(product.id, Math.max(0, Number(event.target.value) || 0))}
                                placeholder="0"
                                className="h-8 w-full min-w-0 bg-transparent text-center text-sm sm:text-base font-black text-slate-900 outline-none placeholder:text-slate-300"
                              />
                              <button
                                type="button"
                                onClick={() => updateDraft(product.id, quantity + 1)}
                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[#4A148C] shadow-xs transition hover:bg-purple-50 active:scale-90"
                                aria-label="เพิ่มจำนวน"
                              >
                                <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Main area bottom: Add to Cart button */}
                <div className="shrink-0 border-t border-[#E1BEE7] bg-white p-3 sm:px-6">
                  <button
                    type="button"
                    onClick={addToCart}
                    disabled={!vehicleId || selectedCount === 0}
                    className={`flex h-11 sm:h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-white shadow-sm transition active:scale-[.99] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none ${
                      type === "claim"
                        ? "bg-pink-600 hover:bg-pink-700"
                        : type === "remaining"
                        ? "bg-amber-600 hover:bg-amber-700"
                        : "bg-[#4A148C] hover:bg-[#3B1070]"
                    }`}
                  >
                    <ShoppingBasket className="h-4.5 w-4.5" />
                    <span>เพิ่มลงตะกร้า {selectedCount > 0 ? `(${selectedCount} รายการ)` : ""}</span>
                  </button>
                </div>
              </main>

              {/* Desktop Right Column: Cart Summary */}
              <aside className="hidden min-h-0 flex-col border-l border-[#E1BEE7] bg-white lg:flex">
                <div className="flex items-center justify-between border-b border-[#E1BEE7] px-5 py-4">
                  <div>
                    <h3 className="font-bold text-[#4A148C]">ตะกร้ารายการพิเศษ</h3>
                    <p className="text-xs font-semibold text-slate-500">
                      {cart.length} รายการ · {groups.length} กลุ่ม
                    </p>
                  </div>
                  <ShoppingBasket className="h-5 w-5 text-[#AB47BC]" />
                </div>
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                  {groups.length === 0 ? (
                    <div className="flex h-40 flex-col items-center justify-center text-center">
                      <ShoppingBasket className="h-8 w-8 text-slate-300" />
                      <p className="mt-2 text-xs font-bold text-slate-400">ยังไม่มีสินค้าในตะกร้า</p>
                    </div>
                  ) : (
                    groups.map(([key, items]) => {
                      const first = items[0];
                      if (!first) return null;
                      const meta = typeMeta[first.type];
                      return (
                        <section key={key} className="overflow-hidden rounded-xl border border-[#E1BEE7]">
                          <header className="flex items-center justify-between bg-[#FBF8FC] px-3 py-2">
                            <strong className="text-xs font-bold text-[#4A148C]">
                              {vehicleById.get(first.vehicleId)?.name} · {meta.label}
                            </strong>
                            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500">
                              {items.length}
                            </span>
                          </header>
                          <div className="divide-y divide-slate-100">
                            {items.map((item) => (
                              <div key={cartKey(item)} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 px-3 py-2">
                                <span className="truncate text-xs font-semibold text-slate-700">
                                  {productById.get(item.productId)?.name}
                                </span>
                                <strong className="text-xs font-bold text-slate-950">
                                  {item.quantity.toLocaleString("th-TH")}
                                </strong>
                                <button
                                  type="button"
                                  onClick={() => removeFromCart(item)}
                                  className="rounded-lg p-1 text-rose-500 hover:bg-rose-50"
                                  aria-label="ลบรายการ"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </section>
                      );
                    })
                  )}
                </div>
                <div className="border-t border-[#E1BEE7] p-4">
                  {error ? <p className="mb-2 text-xs font-bold text-rose-600">{error}</p> : null}
                  <button
                    type="button"
                    onClick={saveAll}
                    disabled={isPending}
                    className="h-11 w-full rounded-xl bg-[#4A148C] hover:bg-[#3B1070] text-sm font-bold text-white shadow-sm transition active:scale-[.99] disabled:opacity-60"
                  >
                    {isPending ? "กำลังบันทึก..." : "บันทึกทั้งหมด"}
                  </button>
                </div>
              </aside>
            </div>

            {/* Mobile Bottom Bar */}
            <div className="shrink-0 border-t border-[#E1BEE7] bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden">
              {isMobileCartOpen ? (
                <div className="max-h-[32dvh] space-y-2 overflow-y-auto pb-2">
                  {groups.length === 0 ? (
                    <p className="py-4 text-center text-xs font-semibold text-slate-400">
                      ยังไม่มีรายการในตะกร้า
                    </p>
                  ) : (
                    groups.map(([key, items]) => {
                      const first = items[0];
                      if (!first) return null;
                      return (
                        <section key={key} className="overflow-hidden rounded-xl border border-[#E1BEE7] bg-white">
                          <header className="flex items-center justify-between bg-[#FBF8FC] px-3 py-1.5">
                            <strong className="text-xs font-bold text-[#4A148C]">
                              {vehicleById.get(first.vehicleId)?.name} · {typeMeta[first.type].label}
                            </strong>
                            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600">
                              {items.length} รายการ
                            </span>
                          </header>
                          <div className="divide-y divide-slate-100">
                            {items.map((item) => {
                              const product = productById.get(item.productId);
                              return (
                                <div key={cartKey(item)} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2.5 px-3 py-2">
                                  <div className="min-w-0">
                                    <strong className="block whitespace-normal break-words text-xs font-bold leading-tight text-slate-900">
                                      {product?.name}
                                    </strong>
                                    <span className="mt-0.5 block text-[10px] font-semibold text-slate-500">
                                      {product?.sku} · {product?.unit}
                                    </span>
                                  </div>
                                  <strong className="min-w-8 text-right text-xs font-bold tabular-nums text-slate-950">
                                    {item.quantity.toLocaleString("th-TH")}
                                  </strong>
                                  <button
                                    type="button"
                                    onClick={() => removeFromCart(item)}
                                    className="grid h-7 w-7 place-items-center rounded-lg text-rose-500 active:bg-rose-50"
                                    aria-label={`ลบ ${product?.name ?? "สินค้า"}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </section>
                      );
                    })
                  )}
                </div>
              ) : null}

              {error ? <p className="mb-2 text-xs font-bold text-rose-600">{error}</p> : null}

              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-2">
                <button
                  type="button"
                  onClick={() => setIsMobileCartOpen((open) => !open)}
                  aria-expanded={isMobileCartOpen}
                  className="flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl bg-[#F3E5F5] px-2 text-xs sm:text-sm font-bold text-[#4A148C] active:scale-95 transition"
                >
                  <ShoppingBasket className="h-4 w-4 shrink-0" />
                  <span className="truncate">ตะกร้า ({cart.length})</span>
                  <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition ${isMobileCartOpen ? "rotate-180" : ""}`} />
                </button>
                <button
                  type="button"
                  onClick={saveAll}
                  disabled={isPending}
                  className="h-11 min-w-0 rounded-xl bg-[#4A148C] hover:bg-[#3B1070] px-3 text-xs sm:text-sm font-bold text-white shadow-sm disabled:opacity-60 active:scale-95 transition"
                >
                  {isPending ? "กำลังบันทึก..." : "บันทึกทั้งหมด"}
                </button>
              </div>
            </div>

          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
