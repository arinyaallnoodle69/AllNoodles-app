"use client";

import { useState, useTransition, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, LoaderCircle, PencilLine, Plus, Search, Tag, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  saveProductBrand,
  deleteProductBrand,
  updateProductBrandOrder,
} from "@/app/dashboard/settings/actions";
import type { SettingsProductBrand } from "@/lib/settings/admin";
import {
  SettingsEmptyState,
} from "@/components/settings/settings-ui";

type ProductBrandManagerProps = {
  brands: SettingsProductBrand[];
};

type BrandRowProps = {
  brand: SettingsProductBrand;
  index: number;
  onEdit: (brand: SettingsProductBrand) => void;
  onDelete: (brandId: string, brandName: string) => void;
};

function BrandRow({ brand, index, onEdit, onDelete }: BrandRowProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white px-4 py-3.5 transition hover:bg-slate-50/70 border-b border-slate-100 gap-3">
      <div className="flex items-center gap-3 min-w-0 sm:flex-1 mr-4">
        <div className="w-8 shrink-0 text-center text-sm font-black text-[#4A148C] tabular-nums">
          {index + 1}
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#4A148C]/10 text-[#4A148C]">
          <Tag className="h-5 w-5" strokeWidth={2.2} />
        </div>
        <div className="min-w-0 sm:flex-1 overflow-x-auto no-scrollbar">
          <p className="text-base font-bold text-slate-950 whitespace-nowrap">{brand.name}</p>
          <p className="text-xs font-semibold text-slate-500 whitespace-nowrap">
            ใช้งานในสินค้า {brand.productCount} รายการ
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 shrink-0 self-end sm:self-auto">
        <button
          type="button"
          onClick={() => onEdit(brand)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#E1BEE7] bg-white text-[#4A148C] transition hover:border-[#EA80FC] hover:bg-[#F3E5F5] active:scale-95"
          aria-label={`แก้ไข ${brand.name}`}
        >
          <PencilLine className="h-4 w-4" strokeWidth={2.2} />
        </button>
        <button
          type="button"
          onClick={() => onDelete(brand.id, brand.name)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 transition hover:border-red-300 hover:bg-red-50 active:scale-95"
          aria-label={`ลบ ${brand.name}`}
        >
          <Trash2 className="h-4 w-4" strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}

function SortableBrandRow({ brand, index, onEdit, onDelete }: BrandRowProps) {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: brand.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white px-4 py-3.5 border-b border-slate-100 gap-3 ${
        isDragging ? "shadow-md bg-slate-50" : ""
      }`}
    >
      <div className="flex items-center gap-3 min-w-0 sm:flex-1 mr-4">
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="cursor-grab touch-none p-1 text-slate-300 transition-colors hover:text-[#EA80FC] active:cursor-grabbing"
          aria-label="ลากเพื่อจัดลำดับ"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-5 w-5" strokeWidth={2.3} />
        </button>

        <div className="w-8 shrink-0 text-center text-sm font-black text-[#4A148C] tabular-nums">
          {index + 1}
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#4A148C]/10 text-[#4A148C]">
          <Tag className="h-5 w-5" strokeWidth={2.2} />
        </div>
        <div className="min-w-0 sm:flex-1 overflow-x-auto no-scrollbar">
          <p className="text-base font-bold text-slate-950 whitespace-nowrap">{brand.name}</p>
          <p className="text-xs font-semibold text-slate-500 whitespace-nowrap">
            ใช้งานในสินค้า {brand.productCount} รายการ
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 shrink-0 self-end sm:self-auto">
        <button
          type="button"
          onClick={() => onEdit(brand)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#E1BEE7] bg-white text-[#4A148C] transition hover:border-[#EA80FC] hover:bg-[#F3E5F5] active:scale-95"
          aria-label={`แก้ไข ${brand.name}`}
        >
          <PencilLine className="h-4 w-4" strokeWidth={2.2} />
        </button>
        <button
          type="button"
          onClick={() => onDelete(brand.id, brand.name)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 transition hover:border-red-300 hover:bg-red-50 active:scale-95"
          aria-label={`ลบ ${brand.name}`}
        >
          <Trash2 className="h-4 w-4" strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}

export function ProductBrandManager({ brands }: ProductBrandManagerProps) {
  const [localBrands, setLocalBrands] = useState(brands);
  const [searchTerm, setSearchTerm] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<SettingsProductBrand | null>(null);
  const [brandNameInput, setBrandNameInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Synchronize initial prop changes
  const [prevBrands, setPrevBrands] = useState(brands);
  if (brands !== prevBrands) {
    setPrevBrands(brands);
    setLocalBrands(brands);
  }

  const q = searchTerm.toLocaleLowerCase("th").trim();
  const filteredBrands = useMemo(() => {
    return q
      ? localBrands.filter((brand) => brand.name.toLocaleLowerCase("th").includes(q))
      : localBrands;
  }, [localBrands, q]);

  const canReorder = !q && filteredBrands.length > 1;

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !canReorder) return;

    const oldIndex = localBrands.findIndex((brand) => brand.id === active.id);
    const newIndex = localBrands.findIndex((brand) => brand.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const previousBrands = localBrands;
    const nextBrands = arrayMove(localBrands, oldIndex, newIndex);
    setLocalBrands(nextBrands);

    startTransition(async () => {
      try {
        const result = await updateProductBrandOrder(nextBrands.map((b) => b.id));
        if (!result.success) {
          setLocalBrands(previousBrands);
          alert(result.error || "เกิดข้อผิดพลาดในการบันทึกลำดับ");
        } else {
          router.refresh();
        }
      } catch (error) {
        setLocalBrands(previousBrands);
        console.error(error);
        alert("ไม่สามารถบันทึกลำดับแบรนด์ได้");
      }
    });
  }

  function openAddModal() {
    setEditingBrand(null);
    setBrandNameInput("");
    setModalOpen(true);
  }

  function openEditModal(brand: SettingsProductBrand) {
    setEditingBrand(brand);
    setBrandNameInput(brand.name);
    setModalOpen(true);
  }

  async function handleSaveBrand(e: React.FormEvent) {
    e.preventDefault();
    const name = brandNameInput.trim();
    if (!name) return;

    setIsSaving(true);
    try {
      const result = await saveProductBrand({
        brandId: editingBrand?.id,
        name,
      });

      if (result.success) {
        setModalOpen(false);
        router.refresh();
      } else {
        alert(result.error || "บันทึกข้อมูลไม่สำเร็จ");
      }
    } catch (error) {
      console.error(error);
      alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteBrand(brandId: string, brandName: string) {
    const confirmDelete = window.confirm(
      `คุณต้องการลบแบรนด์ "${brandName}" ใช่หรือไม่?\n(แบรนด์นี้จะถูกนำออกจากสินค้าทุกรายการที่ใช้งานอยู่)`
    );
    if (!confirmDelete) return;

    startTransition(async () => {
      try {
        const result = await deleteProductBrand(brandId);
        if (result.success) {
          router.refresh();
        } else {
          alert(result.error || "ลบแบรนด์ไม่สำเร็จ");
        }
      } catch (error) {
        console.error(error);
        alert("เกิดข้อผิดพลาดในการลบแบรนด์");
      }
    });
  }

  return (
    <>
      <section className="overflow-hidden border border-[#EA80FC]/20 bg-white shadow-sm sm:rounded-[1.5rem]">
        <header className="border-b border-[#EA80FC]/20 bg-white px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center bg-[#4A148C] text-white shadow-[0_12px_28px_rgba(74,20,140,0.22)]">
                <Tag className="h-7 w-7" strokeWidth={2.3} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#4A148C]">
                  ALL NOODLES SETTINGS
                </p>
                <h2 className="mt-1 text-2xl font-black leading-tight tracking-tight text-slate-950 sm:text-3xl">
                  จัดการแบรนด์สินค้า
                </h2>
                <p className="mt-1 max-w-2xl text-sm font-bold leading-6 text-slate-800">
                  จัดการแบรนด์สินค้าทั้งหมดในระบบ และลากเพื่อจัดลำดับการแสดงผลได้
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#EA80FC]/60 bg-[#4A148C] px-5 text-sm font-black text-white shadow-[0_14px_32px_rgba(74,20,140,0.24)] transition active:scale-[0.98] sm:w-auto"
            >
              <Plus className="h-5 w-5" strokeWidth={2.7} />
              เพิ่มแบรนด์สินค้า
            </button>
          </div>
        </header>

        <div className="p-4 sm:p-6 lg:p-8 space-y-4">
          <label className="flex min-h-12 w-full max-w-md items-center gap-3 border border-[#EA80FC]/25 bg-white px-4">
            <Search className="h-5 w-5 shrink-0 text-[#4A148C]" strokeWidth={2.3} />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="ค้นหาแบรนด์..."
              className="min-w-0 flex-1 bg-transparent text-base font-bold text-slate-950 outline-none placeholder:text-slate-500"
            />
          </label>

          {isPending && (
            <div className="flex items-center gap-2 text-xs font-bold text-[#4A148C] py-1">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              กำลังบันทึกลำดับแบรนด์...
            </div>
          )}

          <div className="overflow-hidden border border-slate-100 rounded-xl divide-y divide-slate-100">
            {filteredBrands.length === 0 ? (
              <SettingsEmptyState className="py-14 bg-slate-50/50">
                {q ? "ไม่พบแบรนด์สินค้าที่ตรงกับการค้นหา" : "ยังไม่มีแบรนด์สินค้าในระบบ"}
              </SettingsEmptyState>
            ) : canReorder ? (
              <DndContext
                id="brand-list-dnd"
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
                modifiers={[restrictToVerticalAxis]}
                autoScroll={false}
              >
                <SortableContext
                  items={filteredBrands.map((b) => b.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {filteredBrands.map((brand, index) => (
                    <SortableBrandRow
                      key={brand.id}
                      brand={brand}
                      index={index}
                      onEdit={openEditModal}
                      onDelete={handleDeleteBrand}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            ) : (
              filteredBrands.map((brand, index) => (
                <BrandRow
                  key={brand.id}
                  brand={brand}
                  index={index}
                  onEdit={openEditModal}
                  onDelete={handleDeleteBrand}
                />
              ))
            )}
          </div>
        </div>
      </section>

      {/* Modal for Create/Edit */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[#E1BEE7] bg-white shadow-2xl animate-in zoom-in-95 duration-200">
            <header className="border-b border-slate-100 bg-slate-50/50 px-6 py-4.5">
              <h3 className="text-lg font-black text-[#4A148C]">
                {editingBrand ? "แก้ไขแบรนด์สินค้า" : "เพิ่มแบรนด์สินค้า"}
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 font-semibold">
                {editingBrand ? "แก้ไขชื่อแบรนด์นี้เพื่ออัปเดตไปที่ทุกสินค้าที่เกี่ยวข้อง" : "เพิ่มแบรนด์ใหม่เข้ามาในระบบ"}
              </p>
            </header>

            <form onSubmit={handleSaveBrand}>
              <div className="p-6 space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-black text-slate-700" htmlFor="brand-name-input">
                    ชื่อแบรนด์
                  </label>
                  <input
                    id="brand-name-input"
                    type="text"
                    required
                    autoFocus
                    value={brandNameInput}
                    onChange={(e) => setBrandNameInput(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-[#4A148C] placeholder:text-slate-400"
                    placeholder="ระบุชื่อแบรนด์..."
                  />
                </div>
              </div>

              <footer className="border-t border-slate-100 bg-slate-50/50 px-6 py-4 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={isSaving}
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-600 transition hover:bg-slate-50 active:scale-95 disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !brandNameInput.trim()}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#4A148C] px-5 text-sm font-black text-white shadow-md transition hover:bg-[#4A148C]/90 active:scale-95 disabled:opacity-50"
                >
                  {isSaving && <LoaderCircle className="h-4 w-4 animate-spin" />}
                  บันทึก
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
