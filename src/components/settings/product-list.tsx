"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { GripVertical, Package2, Pencil, Power } from "lucide-react";
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
};

function formatCost(value: number) {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Sortable Mobile Card ──────────────────────────────────────────────────
function SortableMobileCard({ 
  product, 
  editHref, 
  deleteFormId, 
  defaultUnit 
}: { 
  product: SettingsProduct; 
  editHref: string; 
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
    opacity: isDragging ? 0.5 : (product.isActive ? 1 : 0.7),
    backgroundColor: isDragging ? "#F8FAFC" : "white",
    zIndex: isDragging ? 50 : 1,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`w-full px-4 py-6 shadow-none transition-colors relative ${isDragging ? 'shadow-lg' : ''}`}
    >
      <div className="flex items-start gap-4">
        {/* Drag Handle - Specific target for mobile touch */}
        <div 
          {...attributes} 
          {...listeners} 
          className="cursor-grab p-2 text-slate-400 hover:text-slate-600 active:cursor-grabbing flex items-center justify-center border border-slate-200 rounded-lg bg-slate-50"
          aria-label="ลากเพื่อย้ายลำดับ"
        >
          <GripVertical className="h-5 w-5" />
        </div>

        <div className="relative flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white">
          {product.imageUrls[0] ? (
            <ProductImagePreview src={product.imageUrls[0]} alt={product.name} thumbnailSizes="128px" />
          ) : (
            <Package2 className="h-12 w-12 text-slate-300" strokeWidth={1.5} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#082A63]/40">
            {product.sku}
          </p>
          <p className="mt-0.5 text-lg font-black leading-tight text-slate-950">
            {product.name}
          </p>
          
          <div className="mt-3">
            <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400 mb-1.5 ml-1">ต้นทุน / หน่วย</p>
            <div className="flex items-center justify-between rounded-xl px-3 py-2 text-sm bg-[#082A63]/15 border border-[#082A63]/10">
              <span className="font-bold text-[#082A63]">
                {product.baseUnit}
              </span>
              <span className="font-black text-[#082A63]">
                {formatCost(defaultUnit ? defaultUnit.effectiveCostPrice : (product.costPrice || 0))} บาท
              </span>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                product.isActive ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-slate-100 text-slate-500 border border-slate-200"
              }`}
            >
              {product.isActive ? "ใช้งาน" : "ปิดใช้งาน"}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-slate-100">
        <div className="grid grid-cols-4 gap-2">
          <Link
            href={editHref}
            scroll={false}
            className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2.5 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50 active:scale-95"
          >
            <Pencil className="h-4 w-4 text-[#082A63]" strokeWidth={2.5} />
            แก้ไข
          </Link>

          <ProductCostHistoryButton 
            productId={product.id} 
            productName={product.name} 
            triggerClassName="w-full flex flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2.5 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50 active:scale-95"
          />

          <form action={setProductActive}>
            <input type="hidden" name="productId" value={product.id} />
            <input type="hidden" name="nextState" value={product.isActive ? "false" : "true"} />
            <button
              type="submit"
              className="w-full flex flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2.5 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50 active:scale-95"
            >
              <Power className="h-4 w-4 text-emerald-600" strokeWidth={2.5} />
              {product.isActive ? "ปิด" : "เปิด"}
            </button>
          </form>

          <div className="relative">
            <form id={deleteFormId} className="hidden">
              <input type="hidden" name="productId" value={product.id} />
            </form>
            <DeleteProductButton 
              formId={deleteFormId} 
              productName={product.name}
              triggerClassName="w-full h-full flex flex-col items-center justify-center gap-1.5 rounded-xl border border-rose-100 bg-rose-50/50 py-2.5 text-[11px] font-bold text-rose-600 transition hover:bg-rose-50 active:scale-95"
            />
          </div>
        </div>
      </div>
    </article>
  );
}

// ─── Sortable Desktop Row ──────────────────────────────────────────────────
function SortableDesktopRow({
  product,
  index,
  editHref,
  deleteFormId,
  defaultUnit,
}: {
  product: SettingsProduct;
  index: number;
  editHref: string;
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
    backgroundColor: isDragging ? "#F8FAFC" : "transparent",
    zIndex: isDragging ? 50 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`${product.isActive ? "bg-white hover:bg-slate-50" : "bg-slate-50/70"} ${isDragging ? "shadow-lg" : ""}`}
    >
      <td className="border-b border-r border-[#EEF1F5] px-4 py-4 text-center align-middle text-base font-bold tabular-nums text-[#082A63]">
        <span className="inline-flex items-center gap-2">
          <span>{index + 1}</span>
          <span
            {...attributes}
            {...listeners}
            className="inline-flex cursor-grab text-slate-300 hover:text-[#D4AF37] active:cursor-grabbing"
            aria-label="ลากเพื่อย้ายลำดับ"
          >
            <GripVertical className="h-4 w-4" />
          </span>
        </span>
      </td>

      <td className="border-b border-r border-[#EEF1F5] px-6 py-4 align-middle">
        <div className="space-y-1">
          <p className="font-mono text-base font-black text-[#082A63]">{product.sku}</p>
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
            <p className="text-base font-black text-[#082A63]">{product.name}</p>
            <p className="mt-0.5 text-sm font-semibold text-[#667085]">
              {product.categoryNames[0] ?? "ยังไม่ระบุหมวดหมู่"}
            </p>
          </div>
        </div>
      </td>

      <td className="border-b border-r border-[#EEF1F5] px-6 py-4 text-center align-middle">
        <div className="flex min-h-[3rem] items-center justify-center">
          <span className="text-base font-bold text-[#082A63]">{product.baseUnit}</span>
        </div>
      </td>

      <td className="border-b border-r border-[#EEF1F5] px-6 py-4 text-right align-middle">
        <div className="flex min-h-[3rem] items-center justify-end">
          <p className="text-base font-black tabular-nums text-[#082A63]">
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
          <Link
            href={editHref}
            scroll={false}
            className="action-touch-safe inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#E8DCC7] bg-white text-[#082A63] transition hover:border-[#082A63]/35 hover:bg-[#082A63]/[0.04] active:scale-95"
            aria-label={`แก้ไข ${product.name}`}
          >
            <Pencil className="h-4 w-4" strokeWidth={2.4} />
          </Link>

          <ProductCostHistoryButton
            iconOnly
            productId={product.id}
            productName={product.name}
            triggerClassName="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#E8DCC7] bg-white text-[#082A63] transition hover:border-[#082A63]/35 hover:bg-[#082A63]/[0.04] active:scale-95"
          />

          <form action={setProductActive}>
            <input type="hidden" name="productId" value={product.id} />
            <input type="hidden" name="nextState" value={product.isActive ? "false" : "true"} />
            <button
              type="submit"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#E8DCC7] bg-white text-[#082A63] transition hover:border-[#082A63]/35 hover:bg-[#082A63]/[0.04] active:scale-95"
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
              triggerClassName="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#E8DCC7] bg-white text-red-600 transition hover:border-red-200 hover:bg-red-50 active:scale-95"
            />
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────
export function ProductList({ products, baseListHref = "/settings/products" }: ProductListProps) {
  const [localProducts, setLocalProducts] = useState(products);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setLocalProducts(products);
  }, [products]);

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
    <SettingsPanel className="rounded-lg border border-[#E8DCC7] bg-white shadow-[0_18px_45px_rgba(31,42,68,0.06)]">
      {isPending ? (
        <div className="border-b border-[#EEF1F5] bg-white px-5 py-2 text-xs font-semibold text-[#082A63]">
          กำลังบันทึกลำดับ...
        </div>
      ) : null}

      <SettingsPanelBody className="p-0">
        {localProducts.length > 0 ? (
          <DndContext 
            id="product-list-dnd"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToVerticalAxis]}
          >
            <SortableContext 
              items={localProducts.map(p => p.id)}
              strategy={verticalListSortingStrategy}
            >
              {/* Mobile cards - Full Width */}
              <div className="grid grid-cols-1 divide-y divide-slate-200 px-0 py-0 sm:hidden">
                {localProducts.map((product) => {
                  const deleteFormId = `delete-product-${product.id}`;
                  const defaultUnit = product.saleUnits.find((u) => u.isDefault) || product.saleUnits[0];

                  return (
                    <SortableMobileCard 
                      key={product.id}
                      product={product}
                      editHref={editHref(product.id)}
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
                    <tr className="bg-[#082A63]">
                      <th className="border-b border-[#082A63] border-r border-white/20 px-4 py-4 text-center text-sm font-black text-white">
                        ลำดับ
                      </th>
                      <th className="border-b border-[#082A63] border-r border-white/20 px-6 py-4 text-left text-sm font-black text-white">
                        รหัสสินค้า
                      </th>
                      <th className="border-b border-[#082A63] border-r border-white/20 px-6 py-4 text-left text-sm font-black text-white">
                        ชื่อสินค้า
                      </th>
                      <th className="border-b border-[#082A63] border-r border-white/20 px-6 py-4 text-center text-sm font-black text-white">
                        หน่วย
                      </th>
                      <th className="border-b border-[#082A63] border-r border-white/20 px-6 py-4 text-right text-sm font-black text-white">
                        ต้นทุนต่อหน่วย
                      </th>
                      <th className="border-b border-[#082A63] border-r border-white/20 px-6 py-4 text-center text-sm font-black text-white">
                        สถานะ
                      </th>
                      <th className="border-b border-[#082A63] px-6 py-4 text-center text-sm font-black text-white">
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
                          editHref={editHref(product.id)}
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
    </>
  );
}
