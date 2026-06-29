"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import {
  AutoScrollActivator,
  closestCenter,
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ListTree, LoaderCircle, PencilLine, Store } from "lucide-react";
import { updateCustomerOrderAction } from "@/app/settings/customers/actions";
import type { SettingsCustomer, SettingsVehicle } from "@/lib/settings/admin";
import type { WarehouseOption } from "@/lib/warehouses";
import {
  SettingsEmptyState,
  SettingsPanel,
  SettingsPanelBody,
} from "@/components/settings/settings-ui";
import { CustomerDeleteButton } from "@/components/settings/customer-delete-button";
import { CustomerVehicleSelect } from "@/components/settings/customer-vehicle-select";
import { CustomerWarehouseSelect } from "@/components/settings/customer-warehouse-select";

type CustomerListPanelProps = {
  customers: SettingsCustomer[];
  reorderEnabled?: boolean;
  searchTerm?: string;
  vehicles: SettingsVehicle[];
  warehouses: WarehouseOption[];
  onEdit: (customer: SettingsCustomer) => void;
};

type MobileCustomerCardProps = {
  customer: SettingsCustomer;
  isDragging?: boolean;
  leadingSlot?: ReactNode;
  onEdit: (customer: SettingsCustomer) => void;
  vehicles: SettingsVehicle[];
  warehouses: WarehouseOption[];
};

function MobileCustomerCard({
  customer,
  isDragging = false,
  leadingSlot,
  onEdit,
  vehicles,
  warehouses,
}: MobileCustomerCardProps) {
  return (
    <div
      className={`select-none px-4 py-3.5 transition [-webkit-touch-callout:none] [-webkit-user-select:none] [user-select:none] ${
        isDragging
          ? "relative z-20 scale-[1.035] rounded-2xl bg-white shadow-[0_22px_46px_rgba(74,20,140,0.24)] ring-2 ring-[#EA80FC]/35"
          : "bg-white"
      }`}
    >
      <div className="flex items-start gap-2.5">
        {leadingSlot}

        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#4A148C]/15">
          <Store className="h-5 w-5 text-[#4A148C]" strokeWidth={2.2} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pr-1">
            <p className="text-base font-bold leading-snug text-slate-950">
              {customer.name}
            </p>
            <p className="font-mono text-xs font-bold text-slate-500">{customer.code}</p>
          </div>
        </div>

        <div className="flex shrink-0 gap-1.5 pt-0.5">
          <button
            type="button"
            onClick={() => onEdit(customer)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#E1BEE7] bg-white text-[#4A148C] transition hover:border-[#EA80FC] hover:bg-[#F3E5F5] active:scale-95"
            aria-label={`แก้ไข ${customer.name}`}
          >
            <PencilLine className="h-3.5 w-3.5" strokeWidth={2.2} />
          </button>
          <CustomerDeleteButton
            customerId={customer.id}
            customerName={customer.name}
            customerCode={customer.code}
          />
        </div>
      </div>

      {customer.address ? (
        <p className="mt-2 w-full break-words text-xs font-semibold leading-5 text-slate-600">
          {customer.address}
        </p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full border border-[#EA80FC] bg-[#F3E5F5] px-2.5 py-0.5 text-xs font-bold text-[#4A148C]">
          ผูกราคา {customer.pricingCount} รายการ
        </span>
      </div>

      <div className="mt-2 grid w-full grid-cols-2 gap-2">
        <CustomerWarehouseSelect
          compact
          className="min-w-0"
          customerId={customer.id}
          currentWarehouseId={customer.defaultWarehouseId}
          currentWarehouseName={customer.defaultWarehouseName}
          warehouses={warehouses}
        />

        <CustomerVehicleSelect
          compact
          className="min-w-0"
          customerId={customer.id}
          currentVehicleId={customer.defaultVehicleId}
          currentVehicleName={customer.defaultVehicleName}
          vehicles={vehicles}
        />
      </div>
    </div>
  );
}

function SortableMobileCustomerCard({
  customer,
  onEdit,
  vehicles,
  warehouses,
}: Omit<MobileCustomerCardProps, "isDragging" | "leadingSlot">) {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: customer.id });

  return (
    <div
      className={isDragging ? "relative z-0 opacity-0" : "relative"}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <MobileCustomerCard
        customer={customer}
        isDragging={false}
        leadingSlot={
          <button
            type="button"
            ref={setActivatorNodeRef}
            className="mt-1 inline-flex h-9 w-5 shrink-0 touch-none items-center justify-center rounded-lg text-slate-300 transition active:scale-95 active:bg-[#F3E5F5] active:text-[#4A148C]"
            aria-label={`ลากเพื่อจัดลำดับ ${customer.name}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-5 w-5" strokeWidth={2.4} />
          </button>
        }
        onEdit={onEdit}
        vehicles={vehicles}
        warehouses={warehouses}
      />
    </div>
  );
}

export function CustomerListPanel({
  customers,
  reorderEnabled = false,
  searchTerm = "",
  vehicles,
  warehouses,
  onEdit,
}: CustomerListPanelProps) {
  const [orderedCustomers, setOrderedCustomers] = useState(customers);
  const [activeCustomerId, setActiveCustomerId] = useState<string | null>(null);
  const [isReordering, startReorderTransition] = useTransition();
  const q = searchTerm.toLocaleLowerCase("th").trim();
  const filtered = useMemo(() => {
    return q
      ? orderedCustomers.filter((customer) => {
        return (
          customer.name.toLocaleLowerCase("th").includes(q) ||
          customer.code.toLocaleLowerCase("th").includes(q) ||
          customer.address.toLocaleLowerCase("th").includes(q)
        );
      })
      : orderedCustomers;
  }, [orderedCustomers, q]);

  const canReorder = reorderEnabled && !q && filtered.length > 1;
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const [visibleCount, setVisibleCount] = useState(25);
  const loaderRef = useRef<HTMLDivElement | null>(null);
  const activeCustomer = activeCustomerId
    ? orderedCustomers.find((customer) => customer.id === activeCustomerId) ?? null
    : null;

  const [prevCustomers, setPrevCustomers] = useState(customers);
  const [prevSearchTerm, setPrevSearchTerm] = useState(searchTerm);
  if (customers !== prevCustomers || searchTerm !== prevSearchTerm) {
    setPrevCustomers(customers);
    setPrevSearchTerm(searchTerm);
    setOrderedCustomers(customers);
    setVisibleCount(25);
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveCustomerId(String(event.active.id));
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(12);
    }
  }

  function handleDragCancel() {
    setActiveCustomerId(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveCustomerId(null);
    if (!over || active.id === over.id || !canReorder) return;

    const oldIndex = orderedCustomers.findIndex((customer) => customer.id === active.id);
    const newIndex = orderedCustomers.findIndex((customer) => customer.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const previousCustomers = orderedCustomers;
    const nextCustomers = arrayMove(orderedCustomers, oldIndex, newIndex);
    setOrderedCustomers(nextCustomers);

    startReorderTransition(async () => {
      const result = await updateCustomerOrderAction(nextCustomers.map((customer) => customer.id));
      if (result.error) {
        setOrderedCustomers(previousCustomers);
        alert(result.error);
      }
    });
  }

  useEffect(() => {
    if (!activeCustomerId) return;

    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverscrollY = html.style.overscrollBehaviorY;
    const previousBodyOverscrollY = body.style.overscrollBehaviorY;
    const previousBodyTouchAction = body.style.touchAction;

    html.style.overscrollBehaviorY = "contain";
    body.style.overscrollBehaviorY = "contain";
    body.style.touchAction = "none";

    const preventNativeDragGesture = (event: TouchEvent) => {
      event.preventDefault();
    };

    document.addEventListener("touchmove", preventNativeDragGesture, {
      capture: false,
      passive: false,
    });

    return () => {
      html.style.overscrollBehaviorY = previousHtmlOverscrollY;
      body.style.overscrollBehaviorY = previousBodyOverscrollY;
      body.style.touchAction = previousBodyTouchAction;
      document.removeEventListener("touchmove", preventNativeDragGesture);
    };
  }, [activeCustomerId]);

  useEffect(() => {
    const currentLoader = loaderRef.current;
    if (!currentLoader) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && filtered.length > visibleCount) {
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
  }, [filtered.length, visibleCount]);

  return (
    <>
    <SettingsPanel>
      <div className="border-b border-slate-100 px-5 py-4 md:px-6 md:py-5">
        <div className="flex items-center gap-2">
          <ListTree className="h-5 w-5 text-[#4A148C]" strokeWidth={2.2} />
          <h2 className="text-xl font-bold text-slate-950">รายการร้านค้า</h2>
          {filtered.length > 0 ? (
            <span className="ml-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-sm font-semibold tabular-nums text-slate-500">
              {filtered.length}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          ร้านค้าที่บันทึกแล้วจะแสดงในรายการนี้ทันที พร้อมเลือกรถประจำร้านได้จากคอลัมน์รถประจำร้าน
        </p>
      </div>

      <SettingsPanelBody className="p-0">
        {filtered.length === 0 ? (
          <div className="p-6">
            <SettingsEmptyState className="py-14">
              {q
                ? "ไม่พบร้านค้าที่ตรงกับการค้นหา"
                : 'ยังไม่มีร้านค้าในระบบ กดปุ่ม "เพิ่มร้านค้า" เพื่อสร้างรายการแรก'}
            </SettingsEmptyState>
          </div>
        ) : (
          <>
            <div className="divide-y divide-slate-200 sm:hidden">
              {canReorder ? (
                <DndContext
                  autoScroll={{
                    acceleration: 14,
                    activator: AutoScrollActivator.DraggableRect,
                    enabled: true,
                    interval: 5,
                    threshold: { x: 0.15, y: 0.32 },
                  }}
                  collisionDetection={closestCenter}
                  onDragCancel={handleDragCancel}
                  onDragEnd={handleDragEnd}
                  onDragStart={handleDragStart}
                  sensors={sensors}
                >
                  <SortableContext
                    items={filtered.slice(0, visibleCount).map((customer) => customer.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {filtered.slice(0, visibleCount).map((customer) => (
                      <SortableMobileCustomerCard
                        key={customer.id}
                        customer={customer}
                        onEdit={onEdit}
                        vehicles={vehicles}
                        warehouses={warehouses}
                      />
                    ))}
                  </SortableContext>
                  <DragOverlay
                    dropAnimation={{ duration: 220, easing: "cubic-bezier(0.2, 0, 0, 1)" }}
                    zIndex={10000}
                  >
                    {activeCustomer ? (
                      <MobileCustomerCard
                        customer={activeCustomer}
                        isDragging
                        leadingSlot={
                          <div className="mt-1 inline-flex h-9 w-5 shrink-0 items-center justify-center rounded-lg text-[#4A148C]">
                            <GripVertical className="h-5 w-5" strokeWidth={2.4} />
                          </div>
                        }
                        onEdit={onEdit}
                        vehicles={vehicles}
                        warehouses={warehouses}
                      />
                    ) : null}
                  </DragOverlay>
                </DndContext>
              ) : null}
              <div className={canReorder ? "hidden" : "contents"}>
              {filtered.slice(0, visibleCount).map((customer) => (
                <div key={customer.id} className="px-4 py-3.5">
                  <div className="flex items-start gap-2.5">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#4A148C]/15">
                      <Store className="h-5 w-5 text-[#4A148C]" strokeWidth={2.2} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pr-1">
                        <p className="text-base font-bold leading-snug text-slate-950">
                          {customer.name}
                        </p>
                        <p className="font-mono text-xs font-bold text-slate-500">{customer.code}</p>
                      </div>
                    </div>

                    <div className="flex shrink-0 gap-1.5 pt-0.5">
                      <button
                        type="button"
                        onClick={() => onEdit(customer)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#E1BEE7] bg-white text-[#4A148C] transition hover:border-[#EA80FC] hover:bg-[#F3E5F5] active:scale-95"
                        aria-label={`แก้ไข ${customer.name}`}
                      >
                        <PencilLine className="h-3.5 w-3.5" strokeWidth={2.2} />
                      </button>
                      <CustomerDeleteButton
                        customerId={customer.id}
                        customerName={customer.name}
                        customerCode={customer.code}
                      />
                    </div>
                  </div>

                  {customer.address ? (
                    <p className="mt-2 w-full break-words text-xs leading-5 font-semibold text-slate-600">
                      {customer.address}
                    </p>
                  ) : null}

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-[#F3E5F5] px-2.5 py-0.5 text-xs font-bold text-[#4A148C] border border-[#EA80FC]">
                      ผูกราคา {customer.pricingCount} รายการ
                    </span>
                  </div>

                  <div className="mt-2 grid w-full grid-cols-2 gap-2">
                    <CustomerWarehouseSelect
                      compact
                      className="min-w-0"
                      customerId={customer.id}
                      currentWarehouseId={customer.defaultWarehouseId}
                      currentWarehouseName={customer.defaultWarehouseName}
                      warehouses={warehouses}
                    />

                    <CustomerVehicleSelect
                      compact
                      className="min-w-0"
                      customerId={customer.id}
                      currentVehicleId={customer.defaultVehicleId}
                      currentVehicleName={customer.defaultVehicleName}
                      vehicles={vehicles}
                    />
                  </div>
                </div>
              ))}
              </div>
              {isReordering ? (
                <div className="sticky bottom-0 flex items-center justify-center gap-2 border-t border-[#E1BEE7] bg-white/90 px-4 py-2 text-xs font-bold text-[#4A148C] backdrop-blur">
                  <LoaderCircle className="h-4 w-4 animate-spin" strokeWidth={2.4} />
                  กำลังบันทึกลำดับร้านค้า...
                </div>
              ) : null}
            </div>

            <div className="hidden overflow-x-auto sm:block">
              <table className="min-w-full border-collapse text-left">
                <thead>
                  <tr className="bg-[#4A148C]">
                    <th className="w-16 border-b border-[#4A148C] border-r border-white/20 px-4 py-4 text-center text-xs font-bold uppercase tracking-[0.14em] text-white">
                      ลำดับ
                    </th>
                    <th className="border-b border-[#4A148C] border-r border-white/20 px-5 py-4 text-xs font-bold uppercase tracking-[0.14em] text-white md:px-6">
                      ร้านค้า
                    </th>
                    <th className="border-b border-[#4A148C] border-r border-white/20 px-5 py-4 text-xs font-bold uppercase tracking-[0.14em] text-white">
                      รหัสร้าน
                    </th>
                    <th className="border-b border-[#4A148C] border-r border-white/20 px-5 py-4 text-xs font-bold uppercase tracking-[0.14em] text-white">
                      ที่อยู่
                    </th>
                    <th className="border-b border-[#4A148C] border-r border-white/20 px-5 py-4 text-xs font-bold uppercase tracking-[0.14em] text-white">
                      ราคาที่ผูก
                    </th>
                    <th className="border-b border-[#4A148C] border-r border-white/20 px-5 py-4 text-xs font-bold uppercase tracking-[0.14em] text-white">
                      คลังประจำ
                    </th>
                    <th className="border-b border-[#4A148C] border-r border-white/20 px-5 py-4 text-xs font-bold uppercase tracking-[0.14em] text-white">
                      รถประจำร้าน
                    </th>
                    <th className="border-b border-[#4A148C] px-4 py-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.slice(0, visibleCount).map((customer, index) => (
                    <tr key={customer.id} className="align-middle transition hover:bg-slate-50/70">
                      <td className="border-r border-slate-100 px-4 py-4 text-center font-bold text-slate-500 tabular-nums">
                        {index + 1}
                      </td>
                      <td className="px-5 py-4 md:px-6">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#4A148C]/20">
                            <Store className="h-5 w-5 text-[#4A148C]" strokeWidth={2.2} />
                          </div>
                          <p className="text-base font-bold text-slate-950">{customer.name}</p>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-mono text-sm font-bold text-slate-700">
                        {customer.code}
                      </td>
                      <td className="max-w-xs px-5 py-4 text-sm leading-6 font-bold text-slate-700 xl:max-w-sm">
                        {customer.address || <span className="text-slate-300">-</span>}
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex rounded-full bg-[#F3E5F5] px-3 py-1 text-sm font-bold text-[#4A148C] border border-[#EA80FC]">
                          {customer.pricingCount} รายการ
                        </span>
                      </td>
                      <td className="min-w-[220px] px-5 py-4 text-sm text-slate-600">
                        <CustomerWarehouseSelect
                           customerId={customer.id}
                           currentWarehouseId={customer.defaultWarehouseId}
                           currentWarehouseName={customer.defaultWarehouseName}
                           warehouses={warehouses}
                        />
                      </td>
                      <td className="min-w-[220px] px-5 py-4 text-sm text-slate-600">
                        <CustomerVehicleSelect
                           customerId={customer.id}
                           currentVehicleId={customer.defaultVehicleId}
                           currentVehicleName={customer.defaultVehicleName}
                           vehicles={vehicles}
                        />
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="inline-flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => onEdit(customer)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#E1BEE7] bg-white text-[#4A148C] transition hover:border-[#EA80FC] hover:bg-[#F3E5F5] active:scale-95"
                            aria-label={`แก้ไข ${customer.name}`}
                          >
                            <PencilLine className="h-3.5 w-3.5" strokeWidth={2.2} />
                          </button>
                          <CustomerDeleteButton
                            customerId={customer.id}
                            customerName={customer.name}
                            customerCode={customer.code}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SettingsPanelBody>
    </SettingsPanel>

    {filtered.length > visibleCount && (
      <div ref={loaderRef} className="flex justify-center py-6 bg-transparent mt-2 items-center gap-2">
        <LoaderCircle className="h-5.5 w-5.5 animate-spin text-[#4A148C]" strokeWidth={2.4} />
        <span className="text-sm font-bold text-slate-500">กำลังโหลดร้านค้าเพิ่มเติม... ({filtered.length - visibleCount} รายการ)</span>
      </div>
    )}
    </>
  );
}
