"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AutoScrollActivator,
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Check,
  GripVertical,
  LayoutGrid,
  Package2,
  PencilLine,
  Plus,
  Save,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import {
  deleteProductCategory,
  updateProductCategoryOrder,
  upsertProductCategory,
} from "@/app/dashboard/settings/actions";
import { SettingsEmptyState } from "@/components/settings/settings-ui";
import { normalizeSearch } from "@/lib/utils/search";
import type {
  SettingsProduct,
  SettingsProductCategory,
} from "@/lib/settings/admin";

type ProductCategoryManagerProps = {
  categories: SettingsProductCategory[];
  products: SettingsProduct[];
};

function arraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function sortIds(values: string[]) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function SortableCategoryRow({
  category,
  index,
  isActive,
  onSelect,
}: {
  category: SettingsProductCategory;
  index: number;
  isActive: boolean;
  onSelect: (categoryId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.62 : 1,
    zIndex: isDragging ? 50 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(category.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(category.id);
        }
      }}
      className={cx(
        "grid w-full grid-cols-[4rem_minmax(12rem,1fr)_8rem_8rem_7rem] items-center border-t border-[#EA80FC]/15 px-4 py-4 text-left transition hover:bg-[#F3E5F5]/45",
        isActive && "bg-[#F3E5F5]/70",
        isDragging && "relative shadow-[0_18px_42px_rgba(74,20,140,0.18)]",
      )}
    >
      <span className="flex items-center gap-2 text-sm font-black text-slate-950">
        <span>{index + 1}</span>
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="inline-flex cursor-grab text-slate-400 transition hover:text-[#4A148C] active:cursor-grabbing"
          aria-label={`ลากเพื่อย้ายลำดับหมวดหมู่ ${category.name}`}
          onClick={(event) => event.stopPropagation()}
        >
          <GripVertical className="h-4 w-4" strokeWidth={2.4} />
        </button>
      </span>
      <span className="min-w-0">
        <span className="block truncate text-base font-black text-slate-950">
          {category.name}
        </span>
        <span className="mt-1 block text-xs font-bold text-slate-700">
          ลากไอคอนเพื่อจัดลำดับ
        </span>
      </span>
      <span className="text-center text-base font-black text-slate-950">
        {category.productCount}
      </span>
      <span className="text-center">
        <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
          ใช้งาน
        </span>
      </span>
      <span className="flex items-center justify-center gap-2">
        <span className="inline-flex h-9 w-9 items-center justify-center border border-[#EA80FC]/35 bg-white text-[#4A148C]">
          <PencilLine className="h-4 w-4" strokeWidth={2.3} />
        </span>
        {isActive ? (
          <span className="inline-flex h-9 w-9 items-center justify-center bg-[#4A148C] text-white">
            <Check className="h-4 w-4" strokeWidth={2.8} />
          </span>
        ) : null}
      </span>
    </div>
  );
}

export function ProductCategoryManager({
  categories,
  products,
}: ProductCategoryManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [localCategories, setLocalCategories] = useState(categories);
  const [prevCategories, setPrevCategories] = useState(categories);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    categories[0]?.id ?? null,
  );
  const [isCreating, setIsCreating] = useState(categories.length === 0);
  const [draftName, setDraftName] = useState(categories[0]?.name ?? "");
  const [draftProductIds, setDraftProductIds] = useState<string[]>(categories[0]?.productIds ?? []);
  const [categorySearch, setCategorySearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productCategoryFilter, setProductCategoryFilter] = useState("__all__");
  const [productBrandFilter, setProductBrandFilter] = useState("__all__");
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "error" | "success"; message: string } | null>(
    null,
  );
  const [nameModalMode, setNameModalMode] = useState<"create" | "rename" | null>(null);
  const [nameModalValue, setNameModalValue] = useState("");
  const [saveNameOnConfirm, setSaveNameOnConfirm] = useState(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  if (categories !== prevCategories) {
    setPrevCategories(categories);
    setLocalCategories(categories);
  }

  const selectedCategory = useMemo(
    () => localCategories.find((category) => category.id === selectedCategoryId) ?? null,
    [localCategories, selectedCategoryId],
  );

  useEffect(() => {
    if (!nameModalMode) return;

    const frame = window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [nameModalMode]);

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
    }),
  );

  const activeCategoryCount = localCategories.filter((category) => category.isActive).length;
  const hiddenCategoryCount = Math.max(localCategories.length - activeCategoryCount, 0);
  const selectedCount = draftProductIds.length;
  const normalizedCategorySearch = normalizeSearch(categorySearch);
  const normalizedProductSearch = normalizeSearch(productSearch);

  const filteredCategories = useMemo(() => {
    if (!normalizedCategorySearch) return localCategories;

    return localCategories.filter((category) => normalizeSearch(category.name).includes(normalizedCategorySearch));
  }, [localCategories, normalizedCategorySearch]);

  const brandOptions = useMemo(() => {
    const brands = new Set<string>();

    for (const product of products) {
      const brand = product.brand.trim();
      if (brand) brands.add(brand);
    }

    return [...brands].sort((left, right) => left.localeCompare(right, "th"));
  }, [products]);

  const selectedProducts = useMemo(() => {
    const selectedProductIdSet = new Set(draftProductIds);
    return products.filter((product) => selectedProductIdSet.has(product.id));
  }, [draftProductIds, products]);

  const filteredProducts = useMemo(() => {
    const hasSearch = Boolean(normalizedProductSearch);

    return products.filter((product) => {
      if (productCategoryFilter === "__uncategorized" && product.categoryIds.length > 0) {
        return false;
      }

      if (
        productCategoryFilter !== "__all__" &&
        productCategoryFilter !== "__uncategorized" &&
        !product.categoryIds.includes(productCategoryFilter)
      ) {
        return false;
      }

      if (productBrandFilter !== "__all__" && product.brand !== productBrandFilter) {
        return false;
      }

      if (!hasSearch) return true;

      return (
        normalizeSearch(product.name).includes(normalizedProductSearch) ||
        normalizeSearch(product.sku).includes(normalizedProductSearch) ||
        normalizeSearch(product.brand).includes(normalizedProductSearch) ||
        product.categoryNames.some((name) => normalizeSearch(name).includes(normalizedProductSearch))
      );
    });
  }, [normalizedProductSearch, productBrandFilter, productCategoryFilter, products]);

  const sortedDraftProductIds = useMemo(() => sortIds(draftProductIds), [draftProductIds]);
  const selectedCategoryProductIds = useMemo(
    () => sortIds(selectedCategory?.productIds ?? []),
    [selectedCategory?.productIds],
  );
  const hasChanges = Boolean(
    selectedCategory
      ? draftName.trim() !== selectedCategory.name ||
          !arraysEqual(sortedDraftProductIds, selectedCategoryProductIds)
      : draftName.trim() || draftProductIds.length,
  );

  function openCreateCategoryModal() {
    setNameModalMode("create");
    setNameModalValue("");
    setSaveNameOnConfirm(false);
    setFeedback(null);
  }

  function openRenameCategoryModal() {
    setNameModalMode("rename");
    setNameModalValue(draftName);
    setSaveNameOnConfirm(false);
    setFeedback(null);
  }

  function openMobileRenameCategoryModal(category: SettingsProductCategory) {
    setIsCreating(false);
    setSelectedCategoryId(category.id);
    setDraftName(category.name);
    setDraftProductIds(category.productIds);
    setNameModalMode("rename");
    setNameModalValue(category.name);
    setSaveNameOnConfirm(true);
    setFeedback(null);
  }

  function closeNameModal() {
    setNameModalMode(null);
    setSaveNameOnConfirm(false);
  }

  function confirmNameModal() {
    const trimmedName = nameModalValue.trim();

    if (!trimmedName) {
      setFeedback({ tone: "error", message: "กรุณาตั้งชื่อหมวดหมู่ก่อนยืนยัน" });
      return;
    }

    if (nameModalMode === "create") {
      setIsCreating(true);
      setSelectedCategoryId(null);
      setDraftProductIds([]);
      setProductSearch("");
      setProductCategoryFilter("__uncategorized");
      setProductBrandFilter("__all__");
      setIsProductModalOpen(true);
    }

    setDraftName(trimmedName);
    setFeedback(null);
    setNameModalMode(null);
    setSaveNameOnConfirm(false);

    if (nameModalMode === "rename" && saveNameOnConfirm && selectedCategoryId) {
      startTransition(async () => {
        const result = await upsertProductCategory({
          categoryId: selectedCategoryId,
          name: trimmedName,
          productIds: draftProductIds,
        });

        if (!result.success) {
          setFeedback({ tone: "error", message: result.error });
          return;
        }

        setLocalCategories((current) =>
          current.map((category) =>
            category.id === selectedCategoryId ? { ...category, name: trimmedName } : category,
          ),
        );
        setFeedback({ tone: "success", message: "บันทึกชื่อหมวดหมู่แล้ว" });
        router.refresh();
      });
    }
  }

  function openCategory(categoryId: string) {
    const category = localCategories.find((item) => item.id === categoryId);
    if (!category) return;

    setIsCreating(false);
    setSelectedCategoryId(category.id);
    setDraftName(category.name);
    setDraftProductIds(category.productIds);
    setFeedback(null);
  }

  function toggleProduct(productId: string) {
    setDraftProductIds((current) =>
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId],
    );
  }

  function removeProduct(productId: string) {
    setDraftProductIds((current) => current.filter((id) => id !== productId));
  }

  function openProductModal() {
    if (!draftName.trim()) {
      setFeedback({ tone: "error", message: "กรุณาตั้งชื่อหมวดหมู่ก่อนเพิ่มสินค้า" });
      return;
    }

    setProductSearch("");
    setProductCategoryFilter("__uncategorized");
    setProductBrandFilter("__all__");
    setIsProductModalOpen(true);
  }

  function openCategoryProductModal(categoryId: string) {
    const category = localCategories.find((item) => item.id === categoryId);
    if (!category) return;

    setIsCreating(false);
    setSelectedCategoryId(category.id);
    setDraftName(category.name);
    setDraftProductIds(category.productIds);
    setFeedback(null);
    setProductSearch("");
    setProductCategoryFilter("__uncategorized");
    setProductBrandFilter("__all__");
    setIsProductModalOpen(true);
  }

  function handleCategoryDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || normalizedCategorySearch) return;

    let updatedCategories: SettingsProductCategory[] = [];

    setLocalCategories((items) => {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);

      if (oldIndex < 0 || newIndex < 0) {
        updatedCategories = items;
        return items;
      }

      updatedCategories = arrayMove(items, oldIndex, newIndex).map((category, index) => ({
        ...category,
        sortOrder: index,
      }));
      return updatedCategories;
    });

    startTransition(async () => {
      try {
        await updateProductCategoryOrder(updatedCategories.map((category) => category.id));
      } catch (error) {
        console.error("Failed to update category order:", error);
        setFeedback({ tone: "error", message: "บันทึกลำดับหมวดหมู่ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" });
        setLocalCategories(categories);
      }
    });
  }

  function handleSave() {
    const trimmedName = draftName.trim();
    if (!trimmedName) {
      setFeedback({ tone: "error", message: "กรุณาตั้งชื่อหมวดหมู่ก่อนบันทึก" });
      return;
    }

    startTransition(async () => {
      const result = await upsertProductCategory({
        categoryId: selectedCategoryId,
        name: trimmedName,
        productIds: draftProductIds,
      });

      if (!result.success) {
        setFeedback({ tone: "error", message: result.error });
        return;
      }

      setFeedback({
        tone: "success",
        message: selectedCategoryId ? "บันทึกการเปลี่ยนแปลงหมวดหมู่แล้ว" : "สร้างหมวดหมู่ใหม่แล้ว",
      });
      setIsCreating(false);
      setSelectedCategoryId(result.categoryId);
      router.refresh();
    });
  }

  function handleDelete() {
    if (!selectedCategory) return;

    const isConfirmed = window.confirm(
      `ต้องการลบหมวดหมู่ "${selectedCategory.name}" ใช่หรือไม่`,
    );
    if (!isConfirmed) return;

    startTransition(async () => {
      const result = await deleteProductCategory(selectedCategory.id);

      if (!result.success) {
        setFeedback({ tone: "error", message: result.error });
        return;
      }

      setFeedback({ tone: "success", message: "ลบหมวดหมู่แล้ว" });
      setIsCreating(categories.length <= 1);
      setSelectedCategoryId(null);
      setDraftName("");
      setDraftProductIds([]);
      setProductSearch("");
      router.refresh();
    });
  }

  return (
    <section className="overflow-hidden border border-[#EA80FC]/20 bg-white shadow-[0_18px_55px_rgba(74,20,140,0.08)] sm:rounded-[1.5rem]">
      <header className="border-b border-[#EA80FC]/20 bg-white px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center bg-[#4A148C] text-white shadow-[0_12px_28px_rgba(74,20,140,0.22)]">
              <LayoutGrid className="h-7 w-7" strokeWidth={2.3} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#4A148C]">
                ALL NOODLES SETTINGS
              </p>
              <h2 className="mt-1 text-2xl font-black leading-tight tracking-tight text-slate-950 sm:text-3xl">
                จัดการหมวดหมู่
              </h2>
              <p className="mt-1 max-w-2xl text-sm font-bold leading-6 text-slate-800">
                จัดกลุ่มสินค้าให้ค้นหาเร็วขึ้น และเลือกสินค้าเข้าออเดอร์ได้เป็นระเบียบกว่าเดิม
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={openCreateCategoryModal}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#EA80FC]/60 bg-[#4A148C] px-5 text-sm font-black text-white shadow-[0_14px_32px_rgba(74,20,140,0.24)] transition active:scale-[0.98] sm:w-auto"
          >
            <Plus className="h-5 w-5" strokeWidth={2.7} />
            เพิ่มหมวดหมู่
          </button>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
          {[
            { label: "หมวดหมู่ทั้งหมด", value: localCategories.length },
            { label: "ใช้งานอยู่", value: activeCategoryCount },
            { label: "ซ่อนอยู่", value: hiddenCategoryCount },
          ].map((item, index) => (
            <article
              key={item.label}
              className={cx(
                "border border-[#EA80FC]/20 bg-white px-3 py-3 sm:px-5 sm:py-4",
                index === 1 && "bg-[#F3E5F5]/60",
              )}
            >
              <p className="text-[11px] font-black leading-tight text-slate-950 sm:text-sm">
                {item.label}
              </p>
              <p className="mt-2 text-2xl font-black leading-none text-[#4A148C] sm:text-3xl">
                {item.value}
              </p>
            </article>
          ))}
        </div>
      </header>

      <div className="grid min-h-[42rem] lg:grid-cols-[minmax(0,1.05fr)_minmax(24rem,0.95fr)]">
        <div className="min-w-0 border-b border-[#EA80FC]/20 bg-white lg:border-b-0 lg:border-r">
          <div className="space-y-4 px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-3 xl:flex-row">
              <label className="flex min-h-12 flex-1 items-center gap-3 border border-[#EA80FC]/25 bg-white px-4">
                <Search className="h-5 w-5 shrink-0 text-[#4A148C]" strokeWidth={2.3} />
                <input
                  value={categorySearch}
                  onChange={(event) => setCategorySearch(event.target.value)}
                  placeholder="ค้นหาหมวดหมู่..."
                  className="min-w-0 flex-1 bg-transparent text-base font-bold text-slate-950 outline-none placeholder:text-slate-500"
                />
              </label>
            </div>

            {feedback ? (
              <div
                className={cx(
                  "border px-4 py-3 text-sm font-black",
                  feedback.tone === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-rose-200 bg-rose-50 text-rose-700",
                )}
              >
                {feedback.message}
              </div>
            ) : null}
          </div>

          <div className="hidden px-4 pb-6 sm:block sm:px-6 lg:px-8">
            {normalizedCategorySearch ? (
              <p className="mb-2 text-xs font-black text-slate-700">
                ล้างคำค้นหาก่อน หากต้องการลากเพื่อจัดลำดับหมวดหมู่
              </p>
            ) : null}
            <div className="overflow-hidden border border-[#EA80FC]/20">
              <div className="grid grid-cols-[4rem_minmax(12rem,1fr)_8rem_8rem_7rem] bg-[#4A148C] px-4 py-3 text-sm font-black text-white">
                <span>ลำดับ</span>
                <span>หมวดหมู่</span>
                <span className="text-center">จำนวนสินค้า</span>
                <span className="text-center">สถานะ</span>
                <span className="text-center">จัดการ</span>
              </div>

              {filteredCategories.length === 0 ? (
                <SettingsEmptyState className="m-4 border-[#EA80FC]/35 bg-white py-10 text-slate-950">
                  ไม่พบหมวดหมู่ที่ค้นหา
                </SettingsEmptyState>
              ) : (
                <DndContext
                  id="product-category-list-dnd"
                  sensors={sensors}
                  autoScroll={{
                    enabled: true,
                    activator: AutoScrollActivator.Pointer,
                    acceleration: 16,
                    interval: 5,
                    threshold: { x: 0, y: 0.28 },
                  }}
                  collisionDetection={closestCenter}
                  onDragEnd={handleCategoryDragEnd}
                  modifiers={[restrictToVerticalAxis]}
                >
                  <SortableContext
                    items={filteredCategories.map((category) => category.id)}
                    strategy={verticalListSortingStrategy}
                    disabled={Boolean(normalizedCategorySearch)}
                  >
                    {filteredCategories.map((category, index) => (
                      <SortableCategoryRow
                        key={category.id}
                        category={category}
                        index={index}
                        isActive={!isCreating && category.id === selectedCategoryId}
                        onSelect={openCategory}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </div>

          <div className="space-y-3 px-0 pb-6 sm:hidden">
            {filteredCategories.length === 0 ? (
              <SettingsEmptyState className="mx-4 border-[#EA80FC]/35 bg-white py-10 text-slate-950">
                ไม่พบหมวดหมู่ที่ค้นหา
              </SettingsEmptyState>
            ) : (
              filteredCategories.map((category, index) => {
                const isActive = !isCreating && category.id === selectedCategoryId;

                return (
                  <article
                    key={category.id}
                    className={cx(
                      "border-y border-[#EA80FC]/25 bg-white px-4 py-4 shadow-[0_12px_26px_rgba(74,20,140,0.06)] transition",
                      isActive && "border-[#EA80FC]/55 bg-[#F3E5F5]/45",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 shrink-0 text-center text-lg font-black text-[#4A148C] tabular-nums">
                        {index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-start justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => openCategoryProductModal(category.id)}
                            className="min-w-0 text-left"
                          >
                            <span className="block truncate text-xl font-black leading-tight text-slate-950">
                              {category.name}
                            </span>
                            <span className="mt-1 flex items-center gap-2 text-sm font-black text-slate-800">
                              <Tag className="h-4 w-4 text-[#4A148C]" strokeWidth={2.4} />
                              {category.productCount} สินค้า
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => openCategoryProductModal(category.id)}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#EA80FC]/35 bg-[#F3E5F5] text-[#4A148C] shadow-[0_10px_22px_rgba(74,20,140,0.12)] transition active:scale-95"
                            aria-label={`แก้ไขสินค้าในหมวด ${category.name}`}
                          >
                            <PencilLine className="h-5 w-5" strokeWidth={2.5} />
                          </button>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                          <button
                            type="button"
                            onClick={() => openCategoryProductModal(category.id)}
                            className="inline-flex items-center gap-2 text-sm font-black text-[#4A148C] underline decoration-2 decoration-[#EA80FC]/55 underline-offset-4"
                          >
                            เลือกสินค้า
                            <PencilLine className="h-4 w-4" strokeWidth={2.4} />
                          </button>
                          <button
                            type="button"
                            onClick={() => openMobileRenameCategoryModal(category)}
                            className="inline-flex items-center gap-2 text-sm font-black text-slate-950 underline decoration-2 decoration-slate-300 underline-offset-4"
                          >
                            แก้ชื่อ
                            <PencilLine className="h-4 w-4 text-[#4A148C]" strokeWidth={2.4} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>

        <aside className="hidden min-w-0 bg-[#fbf8ff] sm:block">
          <div className="sticky top-0 z-10 border-b border-[#EA80FC]/20 bg-white px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#4A148C]">
                    CATEGORY DETAIL
                  </p>
                  <h3 className="mt-1 truncate text-2xl font-black text-slate-950">
                    {draftName || "หมวดหมู่ใหม่"}
                  </h3>
                  <p className="mt-1 text-sm font-bold text-slate-800">
                    เลือกแล้ว {selectedCount} รายการ จากทั้งหมด {products.length} รายการ
                  </p>
                </div>
                {isCreating ? (
                  <span className="shrink-0 rounded-full bg-[#F3E5F5] px-3 py-1.5 text-xs font-black text-[#4A148C]">
                    กำลังสร้าง
                  </span>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto]">
                <button
                  type="button"
                  onClick={draftName ? openRenameCategoryModal : openCreateCategoryModal}
                  disabled={isPending}
                  className="inline-flex h-11 items-center justify-center gap-2 border border-[#EA80FC]/35 bg-white px-4 text-sm font-black text-slate-950 transition hover:bg-[#F3E5F5] disabled:opacity-50"
                >
                  <PencilLine className="h-4 w-4 text-[#4A148C]" strokeWidth={2.4} />
                  {draftName ? "แก้ชื่อ" : "ตั้งชื่อ"}
                </button>
                {selectedCategory ? (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isPending}
                    className="inline-flex h-11 items-center justify-center gap-2 border border-rose-200 bg-white px-4 text-sm font-black text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={2.4} />
                    ลบ
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isPending || !hasChanges || !draftName.trim()}
                  className="col-span-2 inline-flex h-11 items-center justify-center gap-2 bg-[#4A148C] px-5 text-sm font-black text-white shadow-[0_12px_28px_rgba(74,20,140,0.2)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 sm:col-span-1"
                >
                  <Save className="h-4 w-4" strokeWidth={2.5} />
                  {isPending ? "กำลังบันทึก..." : "บันทึก"}
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-4 px-4 py-4 sm:px-6">
            <button
              type="button"
              onClick={openProductModal}
              className="flex h-12 w-full items-center justify-center gap-2 bg-[#4A148C] text-base font-black text-white shadow-[0_14px_32px_rgba(74,20,140,0.2)] transition active:scale-[0.98]"
            >
              <Plus className="h-5 w-5" strokeWidth={2.7} />
              เพิ่มสินค้าในหมวดนี้
            </button>

            {!draftName.trim() ? (
              <SettingsEmptyState className="border-[#EA80FC]/35 bg-white py-12 text-slate-950">
                ตั้งชื่อหมวดหมู่ก่อน แล้วค่อยเพิ่มสินค้า
              </SettingsEmptyState>
            ) : selectedProducts.length === 0 ? (
              <div className="border border-dashed border-[#EA80FC]/45 bg-white px-5 py-10 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center bg-[#F3E5F5] text-[#4A148C]">
                  <Package2 className="h-6 w-6" strokeWidth={2.4} />
                </div>
                <p className="mt-4 text-lg font-black text-slate-950">ยังไม่มีสินค้าในหมวดนี้</p>
                <p className="mt-1 text-sm font-bold text-slate-700">
                  กดปุ่มเพิ่มสินค้า แล้วเลือกสินค้าที่ต้องการจัดเข้าหมวดนี้
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {selectedProducts.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center gap-3 border border-[#EA80FC]/20 bg-white px-3 py-3"
                  >
                    {product.imageUrls[0] ? (
                      <Image
                        src={product.imageUrls[0]}
                        alt={product.name}
                        width={52}
                        height={52}
                        sizes="52px"
                        className="h-13 w-13 shrink-0 object-cover"
                      />
                    ) : (
                      <div className="flex h-13 w-13 shrink-0 items-center justify-center bg-[#F3E5F5] text-[#4A148C]">
                        <Package2 className="h-5 w-5" strokeWidth={2.2} />
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-black text-slate-950">{product.name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-black text-[#4A148C]">
                          {product.sku}
                        </span>
                        {product.brand ? (
                          <span className="text-xs font-black text-slate-800">{product.brand}</span>
                        ) : null}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeProduct(product.id)}
                      className="flex h-10 w-10 shrink-0 items-center justify-center border border-rose-200 bg-white text-rose-600 transition hover:bg-rose-50"
                      aria-label={`เอา ${product.name} ออกจากหมวดหมู่`}
                    >
                      <X className="h-5 w-5" strokeWidth={2.5} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="sticky bottom-0 border-t border-[#EA80FC]/20 bg-white px-4 py-3 sm:px-6 lg:hidden">
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending || !hasChanges || !draftName.trim()}
              className="flex h-12 w-full items-center justify-center gap-2 bg-[#4A148C] text-base font-black text-white shadow-[0_-10px_30px_rgba(74,20,140,0.16)] disabled:opacity-45"
            >
              <Save className="h-5 w-5" strokeWidth={2.5} />
              {isPending ? "กำลังบันทึก..." : "บันทึกหมวดหมู่"}
            </button>
          </div>
        </aside>
      </div>

      {isProductModalOpen ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4">
          <div
            className="absolute inset-0"
            onClick={() => setIsProductModalOpen(false)}
            aria-hidden="true"
          />
          <div className="relative flex h-dvh max-h-dvh w-full max-w-5xl flex-col overflow-hidden bg-white shadow-[0_28px_80px_rgba(15,23,42,0.24)] sm:h-auto sm:max-h-[88vh] sm:rounded-[1.5rem]">
            <div className="border-b border-[#EA80FC]/20 px-3 py-3 sm:px-6 sm:py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-xl font-black tracking-tight text-black sm:text-2xl">
                    {draftName || "หมวดหมู่ใหม่"}
                  </h3>
                  <p className="mt-0.5 text-xs font-black text-[#4A148C] sm:text-sm">
                    {selectedCount} รายการ
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center border border-[#EA80FC]/35 bg-white text-[#4A148C] transition hover:bg-[#F3E5F5] sm:h-11 sm:w-11"
                  aria-label="ปิด"
                >
                  <X className="h-5 w-5" strokeWidth={2.4} />
                </button>
              </div>

              <div className="mt-3 sm:mt-4">
                <label className="flex h-11 items-center gap-3 border border-[#EA80FC]/25 bg-white px-3 sm:h-12 sm:px-4">
                  <Search className="h-5 w-5 shrink-0 text-[#4A148C]" strokeWidth={2.3} />
                  <input
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                    placeholder="ค้นหาชื่อสินค้า รหัสสินค้า หรือแบรนด์..."
                    className="min-w-0 flex-1 bg-transparent text-[15px] font-black text-black outline-none placeholder:font-black placeholder:text-slate-700 sm:text-base"
                  />
                </label>

                <div className="mt-3 space-y-2 sm:mt-4 sm:space-y-3">
                  <div>
                    <p className="mb-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-slate-700 sm:mb-2">
                      หมวดหมู่
                    </p>
                    <div className="no-scrollbar flex gap-5 overflow-x-auto pb-1">
                      {[
                        { id: "__uncategorized", label: "ยังไม่อยู่หมวด" },
                        { id: "__all__", label: "ทั้งหมด" },
                        ...categories.map((category) => ({
                          id: category.id,
                          label: category.name,
                        })),
                      ].map((option) => {
                        const isActive = productCategoryFilter === option.id;

                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setProductCategoryFilter(option.id)}
                            className={cx(
                              "shrink-0 pb-1 text-[14px] font-black underline decoration-2 underline-offset-4 transition sm:text-sm",
                              isActive
                                ? "text-[#4A148C] decoration-[#EA80FC]"
                                : "text-slate-800 decoration-transparent",
                            )}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="mb-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-slate-700 sm:mb-2">
                      แบรนด์
                    </p>
                    <div className="no-scrollbar flex gap-5 overflow-x-auto pb-1">
                      {[
                        { id: "__all__", label: "ทุกแบรนด์" },
                        ...brandOptions.map((brand) => ({ id: brand, label: brand })),
                      ].map((option) => {
                        const isActive = productBrandFilter === option.id;

                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => setProductBrandFilter(option.id)}
                            className={cx(
                              "shrink-0 pb-1 text-[14px] font-black underline decoration-2 underline-offset-4 transition sm:text-sm",
                              isActive
                                ? "text-[#4A148C] decoration-[#EA80FC]"
                                : "text-slate-800 decoration-transparent",
                            )}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-[#fbf8ff] px-3 py-3 sm:px-6 sm:py-4">
              {filteredProducts.length === 0 ? (
                <SettingsEmptyState className="border-[#EA80FC]/35 bg-white py-12 text-slate-950">
                  ไม่พบสินค้าตามเงื่อนไขที่เลือก
                </SettingsEmptyState>
              ) : (
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-2">
                  {filteredProducts.map((product) => {
                    const isSelected = draftProductIds.includes(product.id);
                    const otherCategoryName =
                      product.categoryIds.length > 0 &&
                      !product.categoryIds.includes(selectedCategoryId ?? "")
                        ? product.categoryNames[0]
                        : null;
                    const isDisabled = Boolean(otherCategoryName) || isSelected;

                    return (
                      <label
                        key={product.id}
                        className={cx(
                          "relative flex min-w-0 flex-col items-center gap-2 overflow-hidden rounded-[1.35rem] border bg-white px-2.5 py-3 text-center transition sm:flex-row sm:items-center sm:gap-3 sm:rounded-none sm:px-3 sm:text-left",
                          otherCategoryName
                            ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-70"
                            : isSelected
                              ? "cursor-not-allowed border-[#EA80FC]/25 bg-slate-100 opacity-85"
                              : "cursor-pointer border-[#EA80FC]/20 hover:border-[#EA80FC]/60",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isDisabled}
                          onChange={() => !isDisabled && toggleProduct(product.id)}
                          className="sr-only"
                        />

                        <span
                          className={cx(
                            "absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full border-2 transition",
                            isSelected
                              ? "border-[#4A148C] bg-[#4A148C] text-white"
                              : otherCategoryName
                                ? "border-slate-300 bg-slate-100 text-slate-400"
                                : "border-slate-300 bg-white text-transparent",
                          )}
                          aria-hidden="true"
                        >
                          <Check className="h-3.5 w-3.5" strokeWidth={4} />
                        </span>

                        {product.imageUrls[0] ? (
                          <Image
                            src={product.imageUrls[0]}
                            alt={product.name}
                            width={56}
                            height={56}
                            sizes="(max-width: 640px) 64px, 56px"
                            className="h-16 w-16 shrink-0 rounded-xl object-cover sm:h-14 sm:w-14 sm:rounded-none"
                          />
                        ) : (
                          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-[#F3E5F5] text-[#4A148C] sm:h-14 sm:w-14 sm:rounded-none">
                            <Package2 className="h-6 w-6" strokeWidth={2.2} />
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 min-h-[2.25rem] text-[14px] font-black leading-tight text-black sm:min-h-0 sm:truncate sm:text-base">
                            {product.name}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5 sm:justify-start sm:gap-2">
                            <span className="font-mono text-[11px] font-black text-[#4A148C] sm:text-xs">
                              {product.sku}
                            </span>
                            {product.brand ? (
                              <span className="max-w-full truncate text-[11px] font-black text-slate-900 sm:text-xs">
                                {product.brand}
                              </span>
                            ) : null}
                          </div>
                          {otherCategoryName ? (
                            <p className="mt-1 line-clamp-1 text-[11px] font-black text-slate-800 sm:truncate sm:text-xs">
                              อยู่ในหมวด: {otherCategoryName} แล้ว
                            </p>
                          ) : isSelected ? (
                            <p className="mt-1 text-[11px] font-black text-slate-800 sm:text-xs">
                              อยู่ในหมวดนี้แล้ว
                            </p>
                          ) : null}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-[#EA80FC]/20 bg-white px-4 py-4 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-black text-slate-950">
                  เลือกสินค้าในหมวดนี้แล้ว {selectedCount} รายการ
                </p>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                  <button
                    type="button"
                    onClick={() => setIsProductModalOpen(false)}
                    className="h-11 border border-[#EA80FC]/35 bg-white px-5 text-sm font-black text-slate-950 transition hover:bg-[#F3E5F5]"
                  >
                    ปิด
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsProductModalOpen(false);
                      handleSave();
                    }}
                    disabled={isPending || !hasChanges || !draftName.trim()}
                    className="h-11 bg-[#4A148C] px-5 text-sm font-black text-white shadow-[0_12px_28px_rgba(74,20,140,0.2)] transition active:scale-[0.98] disabled:opacity-45"
                  >
                    {isPending ? "กำลังบันทึก..." : "บันทึกหมวดหมู่"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {nameModalMode ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4">
          <div className="absolute inset-0" onClick={closeNameModal} aria-hidden="true" />
          <div className="relative w-full max-w-md overflow-hidden bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)]">
            <div className="flex items-start justify-between gap-4 border-b border-[#EA80FC]/20 px-6 py-5">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#4A148C]">
                  หมวดหมู่สินค้า
                </p>
                <h3 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
                  {nameModalMode === "create" ? "เพิ่มหมวดหมู่ใหม่" : "แก้ชื่อหมวดหมู่"}
                </h3>
                <p className="mt-2 text-sm font-bold leading-6 text-slate-800">
                  {nameModalMode === "create"
                    ? "ตั้งชื่อหมวดหมู่ก่อน แล้วค่อยเลือกสินค้าที่ต้องการให้อยู่ในหมวดนี้"
                    : "เปลี่ยนชื่อหมวดหมู่ให้ชัดเจนและค้นหาได้ง่ายขึ้น"}
                </p>
              </div>

              <button
                type="button"
                onClick={closeNameModal}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center border border-[#EA80FC]/35 bg-white text-[#4A148C] transition hover:bg-[#F3E5F5]"
                aria-label="ปิด"
              >
                <X className="h-5 w-5" strokeWidth={2.4} />
              </button>
            </div>

            <div className="px-6 py-6">
              <label
                className="mb-2 block text-sm font-black text-slate-950"
                htmlFor="category-name-modal"
              >
                ชื่อหมวดหมู่
              </label>
              <input
                ref={nameInputRef}
                id="category-name-modal"
                value={nameModalValue}
                onChange={(event) => setNameModalValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    confirmNameModal();
                  }
                }}
                className="h-12 w-full border border-[#EA80FC]/35 bg-white px-4 text-base font-black text-slate-950 outline-none transition placeholder:text-slate-500 focus:border-[#4A148C] focus:ring-2 focus:ring-[#4A148C]/15"
                placeholder="เช่น กลุ่มเส้นเล็ก หรือ เต้าหู้"
              />
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-[#EA80FC]/20 px-6 py-5">
              <button
                type="button"
                onClick={closeNameModal}
                className="inline-flex h-11 items-center border border-[#EA80FC]/35 bg-white px-5 text-sm font-black text-slate-950 transition hover:bg-[#F3E5F5]"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={confirmNameModal}
                className="inline-flex h-11 items-center gap-2 bg-[#4A148C] px-5 text-sm font-black text-white shadow-[0_12px_28px_rgba(74,20,140,0.2)] transition active:scale-[0.98]"
              >
                <Save className="h-4 w-4" strokeWidth={2.5} />
                ยืนยันชื่อหมวดหมู่
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
