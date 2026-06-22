"use client";

import Link from "next/link";
import { useState, useTransition, useRef, useEffect } from "react";
import { GripVertical, MoreVertical, Package2, Pencil, Power, History, Trash2, LoaderCircle } from "lucide-react";
import { setProductActive, updateProductOrder } from "@/app/dashboard/settings/actions";
import { DeleteProductButton } from "@/components/settings/delete-product-button";
import { ProductCostHistoryButton } from "@/components/settings/product-cost-history-button";
import { ProductImagePreview } from "@/components/settings/product-image-preview";
import {
  SettingsEmptyState,
  SettingsPanel,
  SettingsPanelBody,
} from "@/components/settings/settings-ui";
import type { SettingsProduct } from "@/lib/settings/admin";

// Drag & Drop Imports
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  AutoScrollActivator,
  useSensor,
  useSensors,
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
  baseListHref?: string;
  products: SettingsProduct[];
  onEdit: (product: SettingsProduct) => void;
};

function formatCost(value: number) {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Mobile Card ───────────────────────────────────────────────────────────
function MobileCard({ 
  product, 
  onEdit, 
  deleteFormId, 
  defaultUnit 
}: { 
  product: SettingsProduct; 
  onEdit: (product: SettingsProduct) => void; 
  deleteFormId: string; 
  defaultUnit: { effectiveCostPrice: number } | null | undefined; 
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const style = {
    opacity: product.isActive ? 1 : 0.65,
    zIndex: menuOpen ? 40 : 1,
  };

  return (
    <article
      style={style}
      className="w-full px-4 py-4 shadow-none transition-colors relative border-b border-slate-100 bg-white"
    >
      <div className="flex items-center gap-4">
        {/* Medium image container */}
        <div className="relative h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 border border-slate-100 flex">
          {product.imageUrls[0] ? (
            <ProductImagePreview src={product.imageUrls[0]} alt={product.name} thumbnailSizes="96px" />
          ) : (
            <Package2 className="h-10 w-10 text-slate-300" strokeWidth={1.5} />
          )}
        </div>

        {/* Compact Info Panel */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                product.isActive ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-slate-100 text-slate-500 border border-slate-200"
              }`}
            >
              {product.isActive ? "พร้อมขาย" : "ปิดขาย"}
            </span>
            <p className="text-xs font-mono font-black text-[#4A148C] tracking-wider truncate">
              {product.sku}
            </p>
          </div>
          <p className="mt-1 text-base font-black leading-snug text-slate-950 truncate">
            {product.name}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            <span className="font-black text-slate-950">หน่วย: </span>
            <span className="font-black text-[#4A148C]">{product.baseUnit}</span>
            <span className="mx-1.5 text-slate-300">|</span>
            <span className="font-black text-slate-950">ต้นทุน: </span>
            <span className="font-black text-[#4A148C]">{formatCost(defaultUnit ? defaultUnit.effectiveCostPrice : (product.costPrice || 0))} ฿</span>
          </p>
        </div>

        {/* Action Button - More Options */}
        <div className="relative shrink-0 self-center">
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-100 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 shadow-sm"
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

                <form action={setProductActive} className="w-full" onClick={() => setMenuOpen(false)}>
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="nextState" value={product.isActive ? "false" : "true"} />
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <Power className={`h-4.5 w-4.5 ${product.isActive ? 'text-red-500' : 'text-emerald-500'}`} strokeWidth={2.2} />
                    {product.isActive ? "ปิดขาย" : "เปิดขาย"}
                  </button>
                </form>

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
          productName={product.name}
        />
      </div>
    </article>
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
    transform,
    transition,
    isDragging
  } = useSortable({ id: product.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : (product.isActive ? 1 : 0.6),
    backgroundColor: isDragging ? "#F3E5F5" : "transparent",
    zIndex: isDragging ? 50 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`${product.isActive ? "bg-white hover:bg-slate-50" : "bg-slate-50/70"} ${isDragging ? "shadow-lg" : ""}`}
    >
      <td className="border-b border-r border-[#EEF1F5] px-4 py-4 text-center align-middle text-base font-bold tabular-nums text-[#4A148C]">
        <span className="inline-flex items-center gap-2">
          <span>{index + 1}</span>
          <span
            {...attributes}
            {...listeners}
            className="inline-flex cursor-grab text-slate-300 hover:text-[#EA80FC] active:cursor-grabbing"
            aria-label="ลากเพื่อย้ายลำดับ"
          >
            <GripVertical className="h-4 w-4" />
          </span>
        </span>
      </td>

      <td className="border-b border-r border-[#EEF1F5] px-6 py-4 align-middle">
        <div className="space-y-1">
          <p className="font-mono text-base font-black text-[#4A148C]">{product.sku}</p>
        </div>
      </td>

      <td className="border-b border-r border-[#EEF1F5] px-6 py-4 align-middle">
        <div className="flex items-center gap-4">
          <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
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

      <td className="border-b border-r border-[#EEF1F5] px-6 py-4 text-center align-middle">
        <div className="flex min-h-[3rem] items-center justify-center">
          <span className="text-base font-bold text-[#4A148C]">{product.baseUnit}</span>
        </div>
      </td>

      <td className="border-b border-r border-[#EEF1F5] px-6 py-4 text-right align-middle">
        <div className="flex min-h-[3rem] items-center justify-end">
          <p className="text-base font-black tabular-nums text-[#4A148C]">
            {formatCost(defaultUnit ? defaultUnit.effectiveCostPrice : (product.costPrice || 0))}
          </p>
        </div>
      </td>

      <td className="border-b border-r border-[#EEF1F5] px-6 py-4 text-center align-middle">
        <span
          className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-black leading-none ${
            product.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${product.isActive ? "bg-emerald-500" : "bg-slate-400"}`} />
          {product.isActive ? "พร้อมขาย" : "ไม่พร้อมขาย"}
        </span>
      </td>

      <td className="border-b border-[#EEF1F5] px-6 py-4 text-center align-middle">
        <div className="flex items-center justify-center gap-1.5">
          <button
            type="button"
            onClick={() => onEdit(product)}
            className="action-touch-safe inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#E1BEE7] bg-white text-[#4A148C] transition hover:border-[#4A148C]/35 hover:bg-[#4A148C]/[0.04] active:scale-95"
            aria-label={`แก้ไข ${product.name}`}
          >
            <Pencil className="h-4 w-4" strokeWidth={2.4} />
          </button>

          <ProductCostHistoryButton
            iconOnly
            productId={product.id}
            productName={product.name}
            triggerClassName="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#E1BEE7] bg-white text-[#4A148C] transition hover:border-[#4A148C]/35 hover:bg-[#4A148C]/[0.04] active:scale-95"
          />

          <form action={setProductActive}>
            <input type="hidden" name="productId" value={product.id} />
            <input type="hidden" name="nextState" value={product.isActive ? "false" : "true"} />
            <button
              type="submit"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#E1BEE7] bg-white text-[#4A148C] transition hover:border-[#4A148C]/35 hover:bg-[#4A148C]/[0.04] active:scale-95"
              aria-label={product.isActive ? `ปิดใช้งาน ${product.name}` : `เปิดใช้งาน ${product.name}`}
            >
              <Power className="h-4 w-4" strokeWidth={2.4} />
            </button>
          </form>

          <div className="ml-1">
            <form id={deleteFormId} className="hidden">
              <input type="hidden" name="productId" value={product.id} />
            </form>
            <DeleteProductButton
              formId={deleteFormId}
              iconOnly
              productName={product.name}
              triggerClassName="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#E1BEE7] bg-white text-red-600 transition hover:border-red-200 hover:bg-red-50 active:scale-95"
            />
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────
export function ProductList({ products, baseListHref = "/settings/products", onEdit }: ProductListProps) {
  const [localProducts, setLocalProducts] = useState(products);
  const [visibleCount, setVisibleCount] = useState(25);
  const [isPending, startTransition] = useTransition();
  const loaderRef = useRef<HTMLDivElement | null>(null);

  const [prevProducts, setPrevProducts] = useState(products);
  if (products !== prevProducts) {
    setPrevProducts(products);
    setLocalProducts(products);
    setVisibleCount(25);
  }

  useEffect(() => {
    const currentLoader = loaderRef.current;
    if (!currentLoader) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && localProducts.length > visibleCount) {
          setVisibleCount((prev) => prev + 25);
        }
      },
      {
        rootMargin: "200px",
      }
    );

    observer.observe(currentLoader);

    return () => {
      observer.unobserve(currentLoader);
    };
  }, [localProducts.length, visibleCount]);

  const editHref = (id: string) =>
    `${baseListHref}${baseListHref.includes("?") ? "&" : "?"}edit=${id}`;

  // DnD Sensors
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8, // Require 8px movement to start drag on desktop
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250, // Press and hold for 250ms to start drag on mobile (like professional apps)
        tolerance: 5, // Allow 5px movement during the delay
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    
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

  return (
    <>
    <SettingsPanel className="rounded-none border-x-0 shadow-none sm:rounded-lg sm:border sm:border-[#E1BEE7] sm:shadow-[0_18px_45px_rgba(31,42,68,0.06)] bg-white">
      {isPending ? (
        <div className="border-b border-[#EEF1F5] bg-white px-5 py-2 text-xs font-semibold text-[#4A148C]">
          กำลังบันทึกลำดับ...
        </div>
      ) : null}

      <SettingsPanelBody className="p-0">
        {localProducts.length > 0 ? (
          <DndContext 
            id="product-list-dnd"
            sensors={sensors}
            autoScroll={{
              enabled: true,
              activator: AutoScrollActivator.Pointer,
              acceleration: 16,
              interval: 5,
              threshold: { x: 0, y: 0.28 },
            }}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToVerticalAxis]}
          >
            <SortableContext 
              items={localProducts.slice(0, visibleCount).map(p => p.id)}
              strategy={verticalListSortingStrategy}
            >
              {/* Mobile cards - Full Width */}
              <div className="grid grid-cols-1 divide-y divide-slate-200 px-0 py-0 sm:hidden">
                {localProducts.slice(0, visibleCount).map((product) => {
                  const deleteFormId = `delete-product-${product.id}`;
                  const defaultUnit = product.saleUnits.find((u) => u.isDefault) || product.saleUnits[0];

                  return (
                    <MobileCard 
                      key={product.id}
                      product={product}
                      onEdit={onEdit}
                      deleteFormId={deleteFormId}
                      defaultUnit={defaultUnit}
                    />
                  );
                })}
              </div>

              {/* Desktop table */}
              <div className="hidden overflow-x-auto sm:block">
                <table className="min-w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-[#4A148C]">
                      <th className="border-b border-[#4A148C] border-r border-white/20 px-4 py-4 text-center text-sm font-black text-white">
                        ลำดับ
                      </th>
                      <th className="border-b border-[#4A148C] border-r border-white/20 px-6 py-4 text-left text-sm font-black text-white">
                        รหัสสินค้า
                      </th>
                      <th className="border-b border-[#4A148C] border-r border-white/20 px-6 py-4 text-left text-sm font-black text-white">
                        ชื่อสินค้า
                      </th>
                      <th className="border-b border-[#4A148C] border-r border-white/20 px-6 py-4 text-center text-sm font-black text-white">
                        หน่วย
                      </th>
                      <th className="border-b border-[#4A148C] border-r border-white/20 px-6 py-4 text-right text-sm font-black text-white">
                        ต้นทุนต่อหน่วย
                      </th>
                      <th className="border-b border-[#4A148C] border-r border-white/20 px-6 py-4 text-center text-sm font-black text-white">
                        สถานะ
                      </th>
                      <th className="border-b border-[#4A148C] px-6 py-4 text-center text-sm font-black text-white">
                        จัดการ
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {localProducts.slice(0, visibleCount).map((product, index) => {
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
          <div className="p-6">
            <SettingsEmptyState className="py-14">
              {'ยังไม่มีสินค้าในระบบ กดปุ่ม "เพิ่มสินค้า" เพื่อเริ่มสร้างรายการแรก'}
            </SettingsEmptyState>
          </div>
        )}
      </SettingsPanelBody>
    </SettingsPanel>

    {localProducts.length > visibleCount && (
      <div ref={loaderRef} className="flex justify-center py-6 bg-transparent mt-2 items-center gap-2">
        <LoaderCircle className="h-5.5 w-5.5 animate-spin text-[#4A148C]" strokeWidth={2.4} />
        <span className="text-sm font-bold text-slate-500">กำลังโหลดสินค้าเพิ่มเติม... ({localProducts.length - visibleCount} รายการ)</span>
      </div>
    )}
    </>
  );
}
