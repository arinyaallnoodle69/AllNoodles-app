"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { GripVertical, MoreVertical, Package2, Pencil, Power, History, Trash2, LoaderCircle } from "lucide-react";
import { setProductActive, updateProductOrder } from "@/app/dashboard/settings/actions";
import { DeleteProductButton } from "@/components/settings/delete-product-button";
import { ProductCostHistoryButton } from "@/components/settings/product-cost-history-button";
import { ProductImagePreview } from "@/components/settings/product-image-preview";
import {
  SettingsEmptyState,
} from "@/components/settings/settings-ui";
import type { SettingsProduct } from "@/lib/settings/admin";

// Drag & Drop Imports
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragOverlay,
  DragStartEvent,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

type ProductListProps = {
  products: SettingsProduct[];
  onEdit: (product: SettingsProduct) => void;
};

function formatCost(value: number) {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ProductActiveAction({
  onComplete,
  product,
}: {
  onComplete: () => void;
  product: SettingsProduct;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    const formData = new FormData();
    formData.set("productId", product.id);
    formData.set("nextState", product.isActive ? "false" : "true");

    startTransition(async () => {
      const result = await setProductActive(formData);

      if (!result.success) {
        window.alert(result.error);
        return;
      }

      onComplete();
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={isPending}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
    >
      {isPending ? (
        <LoaderCircle className="h-4.5 w-4.5 animate-spin text-[#4A148C]" strokeWidth={2.2} />
      ) : (
        <Power
          className={`h-4.5 w-4.5 ${product.isActive ? "text-red-500" : "text-emerald-500"}`}
          strokeWidth={2.2}
        />
      )}
      {isPending ? "กำลังอัปเดต..." : product.isActive ? "ปิดใช้งาน" : "เปิดใช้งาน"}
    </button>
  );
}

// ─── Mobile Card ───────────────────────────────────────────────────────────
type MobileCardProps = {
  product: SettingsProduct;
  onEdit: (product: SettingsProduct) => void;
  deleteFormId: string;
  defaultUnit: { effectiveCostPrice: number } | null | undefined;
  displayIndex?: number;
  isDragging?: boolean;
  dragHandle?: React.ReactNode;
};

// Presentational component for the mobile card
function MobileCard({ 
  product, 
  onEdit, 
  deleteFormId, 
  defaultUnit,
  displayIndex,
  isDragging = false,
  dragHandle
}: MobileCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <article
      className={`w-full px-4 py-5 transition-colors relative select-none [-webkit-touch-callout:none] [-webkit-user-select:none] [user-select:none] ${
        isDragging 
          ? "shadow-lg bg-slate-50 rounded-xl border border-slate-200" 
          : "bg-white border-b border-slate-100 shadow-none"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Grip Handle + Index */}
        <div className="flex items-center gap-2 mt-1.5 shrink-0">
          {dragHandle}
          {displayIndex !== undefined && (
            <div className="w-6 shrink-0 text-center text-base font-black tabular-nums text-[#4A148C]">
              {displayIndex}
            </div>
          )}
        </div>

        {/* Content Column */}
        <div className="flex-1 min-w-0">
          {/* Header Row: SKU, Name and Action Button */}
          <div className="flex items-start justify-between gap-3">
            <div className={`min-w-0 flex-1 ${product.isActive ? "" : "opacity-65"}`}>
              <p className="text-xs font-mono font-black text-[#4A148C] tracking-wider truncate">
                {product.sku}
              </p>
              <p className="mt-0.5 text-base font-black leading-snug text-slate-950 line-clamp-2 break-words">
                {product.name}
              </p>
            </div>

            {/* Action Button - More Options */}
            <div className="relative shrink-0 mt-0.5">
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex h-9 w-9 items-center justify-center text-[#4A148C] transition hover:text-[#4A148C]/80 active:scale-95 drop-shadow-[0_1.5px_2px_rgba(74,20,140,0.35)]"
                aria-label="เมนูจัดการสินค้า"
              >
                <MoreVertical className="h-5.5 w-5.5" />
              </button>

              {menuOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-40 bg-transparent" 
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="absolute right-0 mt-1.5 z-50 w-40 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl animate-in fade-in slide-in-from-top-1 duration-150">
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onEdit(product);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-bold text-slate-700 hover:bg-slate-50"
                    >
                      <Pencil className="h-4.5 w-4.5 text-[#4A148C]" strokeWidth={2.2} />
                      แก้ไข
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        document.getElementById(`history-trigger-${product.id}`)?.click();
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-bold text-slate-700 hover:bg-slate-50"
                    >
                      <History className="h-4.5 w-4.5 text-[#4A148C]" strokeWidth={2.2} />
                      ประวัติ
                    </button>

                    <ProductActiveAction
                      product={product}
                      onComplete={() => setMenuOpen(false)}
                    />

                    <div className="border-t border-slate-100 my-1" />

                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        document.getElementById(`delete-trigger-${product.id}`)?.click();
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-bold text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-4.5 w-4.5 text-red-600" strokeWidth={2.2} />
                      ลบ
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Details Row: Image and Stats */}
          <div className="mt-2.5 flex items-center gap-3">
            {/* Column wrapper for image and its badge below */}
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              {/* Medium image container */}
              <div
                className={`relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl bg-slate-50 pointer-events-none select-none [-webkit-user-drag:none] ${
                  product.isActive ? "" : "opacity-65"
                }`}
              >
                {product.imageUrls[0] ? (
                  <ProductImagePreview src={product.imageUrls[0]} alt={product.name} thumbnailSizes="80px" />
                ) : (
                  <Package2 className="h-8 w-8 text-slate-300" strokeWidth={1.5} />
                )}
              </div>

              {/* Badge under the image */}
              <span
                className={`rounded px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider shadow-sm ${
                  product.isActive
                    ? "bg-emerald-500 text-white"
                    : "bg-red-600 text-white"
                }`}
              >
                {product.isActive ? "พร้อมขาย" : "ปิดขาย"}
              </span>
            </div>

            {/* Stats: หน่วย and ต้นทุน */}
            <div className={`min-w-0 flex-1 ${product.isActive ? "" : "opacity-65"} flex flex-col justify-center gap-0.5`}>
              <p className="text-sm text-slate-500 leading-normal">
                <span className="font-black text-slate-950">หน่วย: </span>
                <span className="font-black text-[#4A148C]">{product.baseUnit}</span>
              </p>
              <p className="text-sm text-slate-500 leading-normal">
                <span className="font-black text-slate-950">ต้นทุน: </span>
                <span className="font-black text-[#4A148C]">{formatCost(defaultUnit ? defaultUnit.effectiveCostPrice : (product.costPrice || 0))} ฿</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden cost history and delete buttons to prevent unmounting when dropdown menu closes */}
      <div className="hidden" aria-hidden="true">
        <ProductCostHistoryButton
          id={`history-trigger-${product.id}`}
          productId={product.id}
          productName={product.name}
        />
        <DeleteProductButton
          id={`delete-trigger-${product.id}`}
          formId={deleteFormId}
          productId={product.id}
          productName={product.name}
        />
      </div>
    </article>
  );
}

// Draggable wrapper component for the mobile card
function SortableMobileCard({ 
  product, 
  onEdit, 
  deleteFormId, 
  defaultUnit,
  displayIndex
}: Omit<MobileCardProps, "isDragging" | "dragHandle">) {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: product.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? "relative z-0 opacity-0 w-full" : "relative w-full"}
    >
      <MobileCard 
        product={product}
        onEdit={onEdit}
        deleteFormId={deleteFormId}
        defaultUnit={defaultUnit}
        displayIndex={displayIndex}
        isDragging={false}
        dragHandle={
          <button
            type="button"
            ref={setActivatorNodeRef}
            className="cursor-grab touch-none p-1 text-slate-300 transition-colors hover:text-[#EA80FC] active:cursor-grabbing"
            aria-label="ลากเพื่อจัดลำดับ"
            onClick={(e) => e.stopPropagation()}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-5 w-5" strokeWidth={2.3} />
          </button>
        }
      />
    </div>
  );
}

// ─── Sortable Desktop Row ──────────────────────────────────────────────────
function DesktopActionMenu({
  product,
  onEdit,
}: {
  product: SettingsProduct;
  onEdit: (product: SettingsProduct) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setMenuOpen(!menuOpen)}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E1BEE7] bg-white text-slate-500 transition hover:border-[#4A148C]/35 hover:bg-[#4A148C]/[0.04] hover:text-[#4A148C] active:scale-95 shadow-sm"
        aria-label="เมนูจัดการสินค้า"
      >
        <MoreVertical className="h-4.5 w-4.5" />
      </button>

      {menuOpen && (
        <>
          <div 
            className="fixed inset-0 z-40 bg-transparent" 
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute right-0 mt-1.5 z-50 w-40 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl text-left">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onEdit(product);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              <Pencil className="h-4.5 w-4.5 text-[#4A148C]" strokeWidth={2.2} />
              แก้ไข
            </button>

            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                document.getElementById(`table-history-trigger-${product.id}`)?.click();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              <History className="h-4.5 w-4.5 text-[#4A148C]" strokeWidth={2.2} />
              ประวัติ
            </button>

            <ProductActiveAction
              product={product}
              onComplete={() => setMenuOpen(false)}
            />

            <div className="border-t border-slate-100 my-1" />

            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                document.getElementById(`table-delete-trigger-${product.id}`)?.click();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-4.5 w-4.5 text-red-600" strokeWidth={2.2} />
              ลบ
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Sortable Desktop Row ──────────────────────────────────────────────────
function SortableDesktopRow({
  product,
  index,
  onEdit,
  deleteFormId,
  defaultUnit,
}: {
  product: SettingsProduct;
  index: number;
  onEdit: (product: SettingsProduct) => void;
  deleteFormId: string;
  defaultUnit: { effectiveCostPrice: number } | null | undefined;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: product.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`${
        product.isActive ? "bg-white hover:bg-slate-50" : "bg-slate-50/70 [&>td:not(:last-child)]:opacity-60"
      } ${isDragging ? "shadow-md bg-slate-50" : ""}`}
    >
      <td className="border-b border-r border-[#EEF1F5] px-4 py-2 text-center align-middle text-sm font-bold tabular-nums text-[#4A148C]">
        <span className="inline-flex items-center gap-2">
          <span>{index + 1}</span>
          <span
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            className="inline-flex cursor-grab touch-none text-slate-300 hover:text-[#EA80FC] active:cursor-grabbing"
            aria-label="ลากเพื่อย้ายลำดับ"
          >
            <GripVertical className="h-4 w-4" />
          </span>
        </span>
      </td>

      <td className="border-b border-r border-[#EEF1F5] px-6 py-2 align-middle">
        <div className="space-y-1">
          <p className="font-mono text-sm font-black text-[#4A148C]">{product.sku}</p>
        </div>
      </td>

      <td className="border-b border-r border-[#EEF1F5] px-6 py-2 align-middle">
        <div className="flex items-center gap-4">
          <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden">
            {product.imageUrls[0] ? (
              <ProductImagePreview src={product.imageUrls[0]} alt={product.name} thumbnailSizes="80px" />
            ) : (
              <Package2 className="h-10 w-10 text-slate-300" strokeWidth={1.5} />
            )}
          </div>
          <div>
            <p className="text-base font-black text-[#4A148C]">{product.name}</p>
            <p className="mt-0.5 text-sm font-semibold text-[#667085]">
              {product.categoryNames[0] ?? "ยังไม่ระบุหมวดหมู่"}
            </p>
          </div>
        </div>
      </td>

      <td className="border-b border-r border-[#EEF1F5] px-6 py-2 text-center align-middle">
        <div className="flex items-center justify-center">
          <span className="text-sm font-bold text-[#4A148C]">{product.baseUnit}</span>
        </div>
      </td>

      <td className="border-b border-r border-[#EEF1F5] px-6 py-2 text-right align-middle">
        <div className="flex items-center justify-end">
          <p className="text-sm font-black tabular-nums text-[#4A148C]">
            {formatCost(defaultUnit ? defaultUnit.effectiveCostPrice : (product.costPrice || 0))}
          </p>
        </div>
      </td>

      <td className="hidden border-b border-r border-[#EEF1F5] px-6 py-2 text-center align-middle 2xl:table-cell">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black leading-none ${
            product.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${product.isActive ? "bg-emerald-500" : "bg-slate-400"}`} />
          {product.isActive ? "พร้อมขาย" : "ไม่พร้อมขาย"}
        </span>
      </td>

      <td className="border-b border-[#EEF1F5] px-6 py-2 text-center align-middle">
        <div className="flex items-center justify-center">
          <DesktopActionMenu
            product={product}
            onEdit={onEdit}
          />
        </div>

        <div className="hidden" aria-hidden="true">
          <ProductCostHistoryButton
            id={`table-history-trigger-${product.id}`}
            productId={product.id}
            productName={product.name}
          />
          <form id={deleteFormId} className="hidden">
            <input type="hidden" name="productId" value={product.id} />
          </form>
          <DeleteProductButton
            id={`table-delete-trigger-${product.id}`}
            formId={deleteFormId}
            productId={product.id}
            productName={product.name}
          />
        </div>
      </td>
    </tr>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────
export function ProductList({ products, onEdit }: ProductListProps) {
  const [localProducts, setLocalProducts] = useState(products);
  const [isPending, startTransition] = useTransition();

  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const dragPointerYRef = useRef<number | null>(null);
  const dragPointerXRef = useRef<number | null>(null);
  const dragScrollFrameRef = useRef<number | null>(null);

  const activeProduct = activeProductId
    ? localProducts.find((p) => p.id === activeProductId) ?? null
    : null;

  const [prevProducts, setPrevProducts] = useState(products);
  if (products !== prevProducts) {
    setPrevProducts(products);
    setLocalProducts(products);
  }

  useEffect(() => {
    const query = window.matchMedia("(min-width: 640px)");
    const updateViewport = () => {
      setIsDesktopViewport(query.matches);
      setIsMounted(true);
    };

    updateViewport();
    query.addEventListener("change", updateViewport);

    return () => {
      query.removeEventListener("change", updateViewport);
    };
  }, []);

  // Removed infinite scroll observer - rendering all products directly for optimal performance and sorting

  // DnD Sensors
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragStart(event: DragStartEvent) {
    if (isDesktopViewport) return;
    setActiveProductId(String(event.active.id));
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(12);
    }
  }

  function handleDragCancel() {
    setActiveProductId(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveProductId(null);
    
    if (over && active.id !== over.id) {
      let updatedItems: typeof localProducts = [];
      
      setLocalProducts((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        
        updatedItems = arrayMove(items, oldIndex, newIndex);
        return updatedItems;
      });
      
      // Call server action to persist order OUTSIDE of state setter
      startTransition(async () => {
        try {
          await updateProductOrder(updatedItems.map(i => i.id));
        } catch (error) {
          console.error("Failed to update product order:", error);
          // Revert on error if needed, but optimistic update is usually fine for UI
        }
      });
    }
  }

  // Custom smooth auto-scroller for mobile touch drag
  useEffect(() => {
    if (!activeProductId || isDesktopViewport) return;

    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverscrollY = html.style.overscrollBehaviorY;
    const previousBodyOverscrollY = body.style.overscrollBehaviorY;
    const previousScrollBehavior = html.style.scrollBehavior;

    html.style.overscrollBehaviorY = "contain";
    body.style.overscrollBehaviorY = "contain";
    html.style.scrollBehavior = "auto";
    dragPointerYRef.current = null;
    dragPointerXRef.current = null;

    const updatePointerY = (event: TouchEvent | PointerEvent) => {
      if ("touches" in event) {
        dragPointerXRef.current = event.touches[0]?.clientX ?? null;
        dragPointerYRef.current = event.touches[0]?.clientY ?? null;
        return;
      }
      dragPointerXRef.current = event.clientX;
      dragPointerYRef.current = event.clientY;
    };

    const getScrollableTarget = (x: number, y: number) => {
      let element = document.elementFromPoint(x, y);
      while (element && element !== document.body && element !== document.documentElement) {
        const style = window.getComputedStyle(element);
        const canScrollY = /(auto|scroll)/.test(style.overflowY);
        if (canScrollY && element.scrollHeight > element.clientHeight) {
          return element as HTMLElement;
        }
        element = element.parentElement;
      }

      return (document.scrollingElement || document.documentElement || document.body) as HTMLElement;
    };

    const autoScroll = () => {
      const pointerY = dragPointerYRef.current;
      const pointerX = dragPointerXRef.current ?? Math.round(window.innerWidth / 2);
      if (pointerY !== null) {
        const bottomNavOffset = 126;
        const edgeSize = 300;
        const baseSpeed = 5;
        const maxSpeed = 22;
        const effectiveBottom = Math.max(260, window.innerHeight - bottomNavOffset);
        let delta = 0;

        if (pointerY > effectiveBottom - edgeSize) {
          const ratio = (pointerY - (effectiveBottom - edgeSize)) / edgeSize;
          delta = Math.min(100, Math.round(baseSpeed + ratio * maxSpeed));
        } else if (pointerY < edgeSize) {
          const ratio = (edgeSize - pointerY) / edgeSize;
          delta = -Math.min(100, Math.round(baseSpeed + ratio * maxSpeed));
        }

        if (delta !== 0) {
          const scrollTarget = getScrollableTarget(pointerX, Math.min(pointerY, effectiveBottom - 1));
          if (scrollTarget) {
            scrollTarget.scrollTop += delta;
          } else {
            window.scrollBy({ top: delta, behavior: "auto" });
          }
        }
      }

      dragScrollFrameRef.current = window.requestAnimationFrame(autoScroll);
    };

    document.addEventListener("touchmove", updatePointerY, { capture: true, passive: true });
    document.addEventListener("pointermove", updatePointerY, { capture: true, passive: true });
    dragScrollFrameRef.current = window.requestAnimationFrame(autoScroll);

    return () => {
      html.style.overscrollBehaviorY = previousHtmlOverscrollY;
      body.style.overscrollBehaviorY = previousBodyOverscrollY;
      html.style.scrollBehavior = previousScrollBehavior;
      dragPointerYRef.current = null;
      dragPointerXRef.current = null;
      if (dragScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(dragScrollFrameRef.current);
        dragScrollFrameRef.current = null;
      }
      document.removeEventListener("touchmove", updatePointerY, { capture: true });
      document.removeEventListener("pointermove", updatePointerY, { capture: true });
    };
  }, [activeProductId, isDesktopViewport]);

  if (!isMounted) {
    return (
      <div className="w-full bg-white px-4 py-10 text-center text-sm font-bold text-slate-400">
        กำลังโหลดรายการสินค้า...
      </div>
    );
  }

  return (
    <>
    <div className="w-full bg-white overflow-visible sm:overflow-visible">
      {isPending ? (
        <div className="border-b border-[#EEF1F5] bg-white px-5 py-2 text-xs font-semibold text-[#4A148C] shrink-0">
          กำลังบันทึกลำดับ...
        </div>
      ) : null}

      <div className="p-0 overflow-visible sm:overflow-visible">
        {localProducts.length > 0 ? (
          isDesktopViewport ? (
            /* Desktop View with Desktop DndContext */
            <DndContext 
              id="product-list-desktop-dnd"
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
              modifiers={[restrictToVerticalAxis]}
            >
              <SortableContext 
                items={localProducts.map(p => p.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="hidden sm:block overflow-x-auto lg:overflow-visible">
                  <table className="min-w-full border-collapse text-left table-fixed">
                    <thead>
                      <tr className="bg-[#4A148C]">
                        <th className="w-16 border-b border-[#4A148C] border-r border-white/20 px-4 py-4 text-center text-sm font-black text-white">
                          ลำดับ
                        </th>
                        <th className="w-32 border-b border-[#4A148C] border-r border-white/20 px-6 py-4 text-left text-sm font-black text-white">
                          รหัสสินค้า
                        </th>
                        <th className="border-b border-[#4A148C] border-r border-white/20 px-6 py-4 text-left text-sm font-black text-white">
                          ชื่อสินค้า
                        </th>
                        <th className="w-24 border-b border-[#4A148C] border-r border-white/20 px-6 py-4 text-center text-sm font-black text-white">
                          หน่วย
                        </th>
                        <th className="w-36 border-b border-[#4A148C] border-r border-white/20 px-4 py-4 text-right text-sm font-black text-white whitespace-nowrap">
                          ต้นทุนต่อหน่วย
                        </th>
                        <th className="hidden w-32 border-b border-[#4A148C] border-r border-white/20 px-6 py-4 text-center text-sm font-black text-white 2xl:table-cell">
                          สถานะ
                        </th>
                        <th className="w-20 border-b border-[#4A148C] px-6 py-4 text-center text-sm font-black text-white">
                          จัดการ
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {localProducts.map((product, index) => {
                        const deleteFormId = `delete-product-table-${product.id}`;
                        const defaultUnit = product.saleUnits.find((u) => u.isDefault) || product.saleUnits[0];

                        return (
                          <SortableDesktopRow 
                            key={product.id}
                            product={product}
                            index={index}
                            onEdit={onEdit}
                            deleteFormId={deleteFormId}
                            defaultUnit={defaultUnit}
                          />
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            /* Mobile View with Mobile DndContext */
            <DndContext 
              id="product-list-mobile-dnd"
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragCancel={handleDragCancel}
              onDragEnd={handleDragEnd}
              modifiers={[restrictToVerticalAxis]}
              autoScroll={false}
            >
              <SortableContext 
                items={localProducts.map(p => p.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="divide-y divide-slate-200 px-0 py-0 sm:hidden">
                  {localProducts.map((product, index) => {
                    const deleteFormId = `delete-product-${product.id}`;
                    const defaultUnit = product.saleUnits.find((u) => u.isDefault) || product.saleUnits[0];

                    return (
                      <SortableMobileCard 
                        key={product.id}
                        product={product}
                        onEdit={onEdit}
                        deleteFormId={deleteFormId}
                        defaultUnit={defaultUnit}
                        displayIndex={index + 1}
                      />
                    );
                  })}
                </div>
              </SortableContext>
              <DragOverlay
                dropAnimation={{ duration: 220, easing: "cubic-bezier(0.2, 0, 0, 1)" }}
                zIndex={10000}
              >
                {activeProduct ? (
                  <div className="w-[calc(100vw-2rem)] mx-auto pointer-events-none select-none [-webkit-touch-callout:none] [-webkit-user-select:none] [user-select:none]">
                    <MobileCard
                      product={activeProduct}
                      onEdit={onEdit}
                      deleteFormId={`delete-product-${activeProduct.id}`}
                      defaultUnit={activeProduct.saleUnits.find((u) => u.isDefault) || activeProduct.saleUnits[0]}
                      displayIndex={localProducts.findIndex((p) => p.id === activeProduct.id) + 1}
                      isDragging={true}
                      dragHandle={
                        <div className="p-1 text-[#4A148C]">
                          <GripVertical className="h-5 w-5" strokeWidth={2.3} />
                        </div>
                      }
                    />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )
        ) : (
          <div className="p-6">
            <SettingsEmptyState className="py-14">
              {'ยังไม่มีสินค้าในระบบ กดปุ่ม "เพิ่มสินค้า" เพื่อเริ่มสร้างรายการแรก'}
            </SettingsEmptyState>
          </div>
        )}
      </div>
    </div>

    {/* Loader removed - all items are rendered directly */}
    </>
  );
}
