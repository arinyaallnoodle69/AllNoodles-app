"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  AutoScrollActivator,
  closestCenter,
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
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
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical,
  IdCard,
  LoaderCircle,
  PencilLine,
  Store,
  Trash2,
  Truck,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { deleteVehicleAction, updateVehicleOrderAction } from "@/app/settings/vehicles/actions";
import type { SettingsVehicle } from "@/lib/settings/admin";
import {
  SettingsEmptyState,
  SettingsPanel,
  SettingsPanelBody,
} from "@/components/settings/settings-ui";

type VehicleListPanelProps = {
  vehicles: SettingsVehicle[];
};

// ─── Customer count button ────────────────────────────────────────────────────

function CustomerCountButton({
  onClick,
  vehicle,
}: {
  onClick: () => void;
  vehicle: SettingsVehicle;
}) {
  const count = vehicle.customers.length;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={count === 0}
      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-[#1a1a1a] shadow-sm transition hover:border-[#4A148C]/35 hover:bg-[#4A148C]/15 disabled:cursor-not-allowed disabled:border-slate-100 disabled:bg-slate-50 disabled:text-slate-500 disabled:shadow-none"
    >
      <span>{count.toLocaleString("th-TH")} ร้านค้า</span>
      <UsersRound className="h-3.5 w-3.5" strokeWidth={2.4} />
    </button>
  );
}

// ─── Delete / action buttons ──────────────────────────────────────────────────

function ActionButtons({ vehicleId }: { vehicleId: string }) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (!window.confirm("ต้องการลบรถคันนี้ใช่ไหม?")) return;
    setIsDeleting(true);
    const result = await deleteVehicleAction(vehicleId);
    if (result.error) {
      alert(result.error);
    } else {
      router.refresh();
    }
    setIsDeleting(false);
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/settings/vehicles?edit=${vehicleId}`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#E1BEE7] bg-white px-3 py-1.5 text-xs font-black text-[#4A148C] transition hover:border-[#EA80FC] hover:bg-[#F3E5F5] active:scale-95"
      >
        <PencilLine className="h-3.5 w-3.5" strokeWidth={2.2} />
        แก้ไข
      </Link>

      <button
        type="button"
        onClick={handleDelete}
        disabled={isDeleting}
        className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-black text-red-600 transition hover:border-red-300 hover:bg-red-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Trash2 className="h-3.5 w-3.5" strokeWidth={2.2} />
        ลบ
      </button>
    </div>
  );
}

// ─── Mobile card ──────────────────────────────────────────────────────────────

type MobileVehicleCardProps = {
  vehicle: SettingsVehicle;
  displayIndex: number;
  isDragging?: boolean;
  leadingSlot?: ReactNode;
  onViewCustomers: (vehicle: SettingsVehicle) => void;
};

function MobileVehicleCard({
  vehicle,
  displayIndex,
  isDragging = false,
  leadingSlot,
  onViewCustomers,
}: MobileVehicleCardProps) {
  return (
    <div
      className={`select-none px-4 py-4 transition [-webkit-touch-callout:none] [-webkit-user-select:none] [user-select:none] ${
        isDragging
          ? "relative z-20 scale-[1.035] rounded-2xl bg-white shadow-[0_22px_46px_rgba(74,20,140,0.24)] ring-2 ring-[#EA80FC]/35"
          : "bg-white"
      }`}
    >
      <div className="flex items-center gap-3">
        {leadingSlot}

        <div className="w-6 shrink-0 text-center text-base font-black tabular-nums text-[#4A148C]">
          {displayIndex}
        </div>

        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#4A148C]/10 text-[#4A148C]">
          <Truck className="h-5 w-5" strokeWidth={2.2} />
        </div>

        <div className="min-w-0 flex-1 overflow-visible">
          <div className="grid min-w-0 gap-2">
            <p className="w-full max-w-full whitespace-nowrap text-[clamp(0.78rem,4vw,1rem)] font-black leading-tight text-[#1a1a1a]">
              {vehicle.name}
            </p>
            <span
              className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-black ${
                vehicle.isActive ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-[#1a1a1a]"
              }`}
            >
              {vehicle.isActive ? "พร้อมใช้งาน" : "ปิดใช้งาน"}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {vehicle.licensePlate ? (
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-[#1a1a1a]">
                <IdCard className="h-3.5 w-3.5 text-[#4A148C]" strokeWidth={2.2} />
                {vehicle.licensePlate}
              </div>
            ) : null}

            {vehicle.driverName ? (
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-[#1a1a1a]">
                <UserRound className="h-3.5 w-3.5 text-[#4A148C]" strokeWidth={2.2} />
                {vehicle.driverName}
              </div>
            ) : null}

            <CustomerCountButton vehicle={vehicle} onClick={() => onViewCustomers(vehicle)} />
          </div>

          <div className="mt-4">
            <ActionButtons vehicleId={vehicle.id} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sortable mobile card ─────────────────────────────────────────────────────

function SortableMobileVehicleCard({
  vehicle,
  displayIndex,
  onViewCustomers,
}: Omit<MobileVehicleCardProps, "isDragging" | "leadingSlot">) {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: vehicle.id });

  return (
    <div
      className={isDragging ? "relative z-0 opacity-0" : "relative"}
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <MobileVehicleCard
        vehicle={vehicle}
        displayIndex={displayIndex}
        isDragging={false}
        leadingSlot={
          <button
            type="button"
            ref={setActivatorNodeRef}
            className="inline-flex h-9 w-5 shrink-0 touch-none items-center justify-center rounded-lg text-slate-300 transition active:scale-95 active:bg-[#F3E5F5] active:text-[#4A148C]"
            aria-label={`ลากเพื่อจัดลำดับ ${vehicle.name}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-5 w-5" strokeWidth={2.4} />
          </button>
        }
        onViewCustomers={onViewCustomers}
      />
    </div>
  );
}

// ─── Desktop row ──────────────────────────────────────────────────────────────

type DesktopVehicleRowProps = {
  vehicle: SettingsVehicle;
  displayIndex: number;
  dragHandle?: ReactNode;
  isDragging?: boolean;
  onViewCustomers: (vehicle: SettingsVehicle) => void;
  rowRef?: (node: HTMLTableRowElement | null) => void;
  rowStyle?: CSSProperties;
};

function DesktopVehicleRow({
  vehicle,
  displayIndex,
  dragHandle,
  isDragging = false,
  onViewCustomers,
  rowRef,
  rowStyle,
}: DesktopVehicleRowProps) {
  return (
    <tr
      ref={rowRef}
      style={rowStyle}
      className={`align-middle transition hover:bg-slate-50/70 ${
        isDragging ? "relative z-10 bg-white shadow-[0_18px_34px_rgba(74,20,140,0.16)]" : ""
      }`}
    >
      <td className="border-r border-slate-100 px-4 py-4 text-center font-bold text-slate-500 tabular-nums">
        <div className="flex items-center justify-center gap-2">
          {dragHandle}
          <span>{displayIndex}</span>
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-100">
            <Truck className="h-5 w-5 text-[#4A148C]" strokeWidth={2.2} />
          </div>
          <p className="text-sm font-black text-[#1a1a1a]">{vehicle.name}</p>
        </div>
      </td>
      <td className="px-6 py-4 text-sm font-black text-[#1a1a1a]">
        {vehicle.licensePlate || <span className="text-slate-300">-</span>}
      </td>
      <td className="px-6 py-4 text-sm font-black text-[#1a1a1a]">
        {vehicle.driverName || <span className="text-slate-300">-</span>}
      </td>
      <td className="px-6 py-4">
        <CustomerCountButton vehicle={vehicle} onClick={() => onViewCustomers(vehicle)} />
      </td>
      <td className="px-6 py-4">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${
            vehicle.isActive ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-[#1a1a1a]"
          }`}
        >
          {vehicle.isActive ? "พร้อมใช้งาน" : "ปิดใช้งาน"}
        </span>
      </td>
      <td className="px-6 py-4">
        <ActionButtons vehicleId={vehicle.id} />
      </td>
    </tr>
  );
}

// ─── Sortable desktop row ─────────────────────────────────────────────────────

function SortableDesktopVehicleRow({
  vehicle,
  displayIndex,
  onViewCustomers,
}: Omit<DesktopVehicleRowProps, "dragHandle" | "isDragging" | "rowRef" | "rowStyle">) {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: vehicle.id });

  return (
    <DesktopVehicleRow
      vehicle={vehicle}
      displayIndex={displayIndex}
      dragHandle={
        <span
          ref={setActivatorNodeRef}
          className="inline-flex cursor-grab touch-none items-center justify-center text-slate-300 transition-colors hover:text-[#EA80FC] active:cursor-grabbing"
          aria-label={`ลากเพื่อจัดลำดับ ${vehicle.name}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" strokeWidth={2.4} />
        </span>
      }
      isDragging={isDragging}
      onViewCustomers={onViewCustomers}
      rowRef={setNodeRef}
      rowStyle={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        backgroundColor: isDragging ? "#F3E5F5" : "transparent",
        zIndex: isDragging ? 50 : 1,
      }}
    />
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function VehicleListPanel({ vehicles }: VehicleListPanelProps) {
  const [orderedVehicles, setOrderedVehicles] = useState(vehicles);
  const [activeVehicleId, setActiveVehicleId] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);
  const [isReordering, startReorderTransition] = useTransition();
  const [selectedVehicle, setSelectedVehicle] = useState<SettingsVehicle | null>(null);

  const dragPointerYRef = useRef<number | null>(null);
  const dragPointerXRef = useRef<number | null>(null);
  const dragScrollFrameRef = useRef<number | null>(null);

  const activeVehicle = activeVehicleId
    ? orderedVehicles.find((v) => v.id === activeVehicleId) ?? null
    : null;

  // Sync when server-side vehicles prop changes (after revalidation)
  const [prevVehicles, setPrevVehicles] = useState(vehicles);
  if (vehicles !== prevVehicles) {
    setPrevVehicles(vehicles);
    setOrderedVehicles(vehicles);
  }

  // Detect viewport
  useEffect(() => {
    const query = window.matchMedia("(min-width: 640px)");
    const update = () => {
      setIsDesktopViewport(query.matches);
      setIsMounted(true);
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const canReorder = isMounted && orderedVehicles.length > 1;
  const enableMobileReorder = canReorder && !isDesktopViewport;
  const enableDesktopReorder = canReorder && isDesktopViewport;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragStart(event: DragStartEvent) {
    if (isDesktopViewport) return;
    setActiveVehicleId(String(event.active.id));
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(12);
    }
  }

  function handleDragCancel() {
    setActiveVehicleId(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveVehicleId(null);
    if (!over || active.id === over.id || !canReorder) return;

    const oldIndex = orderedVehicles.findIndex((v) => v.id === active.id);
    const newIndex = orderedVehicles.findIndex((v) => v.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const previousVehicles = orderedVehicles;
    const nextVehicles = arrayMove(orderedVehicles, oldIndex, newIndex);
    setOrderedVehicles(nextVehicles);

    startReorderTransition(async () => {
      const result = await updateVehicleOrderAction(nextVehicles.map((v) => v.id));
      if (result.error) {
        setOrderedVehicles(previousVehicles);
        alert(result.error);
      }
    });
  }

  // Custom auto-scroll for mobile drag
  useEffect(() => {
    if (!activeVehicleId || isDesktopViewport) return;

    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverscroll = html.style.overscrollBehaviorY;
    const prevBodyOverscroll = body.style.overscrollBehaviorY;
    const prevScrollBehavior = html.style.scrollBehavior;

    html.style.overscrollBehaviorY = "contain";
    body.style.overscrollBehaviorY = "contain";
    html.style.scrollBehavior = "auto";
    dragPointerYRef.current = null;
    dragPointerXRef.current = null;

    const updatePointer = (event: TouchEvent | PointerEvent) => {
      if ("touches" in event) {
        dragPointerXRef.current = event.touches[0]?.clientX ?? null;
        dragPointerYRef.current = event.touches[0]?.clientY ?? null;
        return;
      }
      dragPointerXRef.current = event.clientX;
      dragPointerYRef.current = event.clientY;
    };

    const getScrollable = (x: number, y: number) => {
      let el = document.elementFromPoint(x, y);
      while (el && el !== document.body && el !== document.documentElement) {
        const style = window.getComputedStyle(el);
        if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight) {
          return el as HTMLElement;
        }
        el = el.parentElement;
      }
      return (document.scrollingElement || document.documentElement || document.body) as HTMLElement;
    };

    const autoScroll = () => {
      const py = dragPointerYRef.current;
      const px = dragPointerXRef.current ?? Math.round(window.innerWidth / 2);
      if (py !== null) {
        const bottomNavOffset = 126;
        const edgeSize = 300;
        const baseSpeed = 5;
        const maxSpeed = 22;
        const effectiveBottom = Math.max(260, window.innerHeight - bottomNavOffset);
        let delta = 0;

        if (py > effectiveBottom - edgeSize) {
          const ratio = (py - (effectiveBottom - edgeSize)) / edgeSize;
          delta = Math.min(100, Math.round(baseSpeed + ratio * maxSpeed));
        } else if (py < edgeSize) {
          const ratio = (edgeSize - py) / edgeSize;
          delta = -Math.min(100, Math.round(baseSpeed + ratio * maxSpeed));
        }

        if (delta !== 0) {
          const target = getScrollable(px, Math.min(py, effectiveBottom - 1));
          if (target) {
            target.scrollTop += delta;
          } else {
            window.scrollBy({ top: delta, behavior: "auto" });
          }
        }
      }
      dragScrollFrameRef.current = window.requestAnimationFrame(autoScroll);
    };

    document.addEventListener("touchmove", updatePointer, { capture: true, passive: true });
    document.addEventListener("pointermove", updatePointer, { capture: true, passive: true });
    dragScrollFrameRef.current = window.requestAnimationFrame(autoScroll);

    return () => {
      html.style.overscrollBehaviorY = prevHtmlOverscroll;
      body.style.overscrollBehaviorY = prevBodyOverscroll;
      html.style.scrollBehavior = prevScrollBehavior;
      dragPointerYRef.current = null;
      dragPointerXRef.current = null;
      if (dragScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(dragScrollFrameRef.current);
        dragScrollFrameRef.current = null;
      }
      document.removeEventListener("touchmove", updatePointer, { capture: true });
      document.removeEventListener("pointermove", updatePointer, { capture: true });
    };
  }, [activeVehicleId, isDesktopViewport]);

  return (
    <>
      <SettingsPanel>
        <div className="border-b border-slate-100 px-6 py-5">
          <h2 className="text-xl font-black text-[#1a1a1a]">รายการรถ</h2>
          <p className="mt-1 text-sm font-extrabold leading-6 text-[#1a1a1a]">
            ใช้เก็บชื่อรถที่ระบบสามารถเลือกเป็นรถประจำร้านได้ และถ้ามีจะใส่ทะเบียนหรือชื่อคนขับไว้ได้ด้วย
          </p>
        </div>

        <SettingsPanelBody className="p-0">
          {vehicles.length === 0 ? (
            <div className="p-6">
              <SettingsEmptyState className="py-14">
                ยังไม่มีรถในระบบ กดปุ่ม &quot;เพิ่มรถ&quot; เพื่อสร้างรายการแรก
              </SettingsEmptyState>
            </div>
          ) : (
            <>
              {/* ── Mobile list ── */}
              <div className="divide-y divide-slate-100 sm:hidden">
                {enableMobileReorder ? (
                  <DndContext
                    id="vehicle-list-mobile-dnd"
                    autoScroll={false}
                    collisionDetection={closestCenter}
                    modifiers={[restrictToVerticalAxis]}
                    onDragCancel={handleDragCancel}
                    onDragEnd={handleDragEnd}
                    onDragStart={handleDragStart}
                    sensors={sensors}
                  >
                    <SortableContext
                      items={orderedVehicles.map((v) => v.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {orderedVehicles.map((vehicle, index) => (
                        <SortableMobileVehicleCard
                          key={vehicle.id}
                          vehicle={vehicle}
                          displayIndex={index + 1}
                          onViewCustomers={setSelectedVehicle}
                        />
                      ))}
                    </SortableContext>
                    <DragOverlay
                      dropAnimation={{ duration: 220, easing: "cubic-bezier(0.2, 0, 0, 1)" }}
                      zIndex={10000}
                    >
                      {activeVehicle ? (
                        <MobileVehicleCard
                          vehicle={activeVehicle}
                          displayIndex={
                            Math.max(1, orderedVehicles.findIndex((v) => v.id === activeVehicle.id) + 1)
                          }
                          isDragging
                          leadingSlot={
                            <div className="inline-flex h-9 w-5 shrink-0 items-center justify-center rounded-lg text-[#4A148C]">
                              <GripVertical className="h-5 w-5" strokeWidth={2.4} />
                            </div>
                          }
                          onViewCustomers={setSelectedVehicle}
                        />
                      ) : null}
                    </DragOverlay>
                  </DndContext>
                ) : (
                  orderedVehicles.map((vehicle, index) => (
                    <MobileVehicleCard
                      key={vehicle.id}
                      vehicle={vehicle}
                      displayIndex={index + 1}
                      onViewCustomers={setSelectedVehicle}
                    />
                  ))
                )}

                {isReordering ? (
                  <div className="sticky bottom-0 flex items-center justify-center gap-2 border-t border-[#E1BEE7] bg-white/90 px-4 py-2 text-xs font-bold text-[#4A148C] backdrop-blur">
                    <LoaderCircle className="h-4 w-4 animate-spin" strokeWidth={2.4} />
                    กำลังบันทึกลำดับรถ...
                  </div>
                ) : null}
              </div>

              {/* ── Desktop table ── */}
              <div className="hidden overflow-x-auto sm:block">
                <DndContext
                  id="vehicle-list-desktop-dnd"
                  autoScroll={{
                    acceleration: 16,
                    activator: AutoScrollActivator.Pointer,
                    enabled: true,
                    interval: 5,
                    threshold: { x: 0, y: 0.28 },
                  }}
                  collisionDetection={closestCenter}
                  modifiers={[restrictToVerticalAxis]}
                  onDragCancel={handleDragCancel}
                  onDragEnd={handleDragEnd}
                  onDragStart={handleDragStart}
                  sensors={sensors}
                >
                  <table className="min-w-full table-fixed border-collapse text-left">
                    <thead>
                      <tr className="bg-[#4A148C]">
                        <th className="w-20 border-r border-white/20 px-4 py-4 text-center text-xs font-bold uppercase tracking-[0.14em] text-white">
                          ลำดับ
                        </th>
                        <th className="border-r border-white/20 px-6 py-4 text-xs font-bold uppercase tracking-[0.14em] text-white">
                          ชื่อรถ
                        </th>
                        <th className="border-r border-white/20 px-6 py-4 text-xs font-bold uppercase tracking-[0.14em] text-white">
                          ทะเบียนรถ
                        </th>
                        <th className="border-r border-white/20 px-6 py-4 text-xs font-bold uppercase tracking-[0.14em] text-white">
                          ชื่อคนขับ
                        </th>
                        <th className="border-r border-white/20 px-6 py-4 text-xs font-bold uppercase tracking-[0.14em] text-white">
                          จำนวนร้านค้า
                        </th>
                        <th className="border-r border-white/20 px-6 py-4 text-xs font-bold uppercase tracking-[0.14em] text-white">
                          สถานะ
                        </th>
                        <th className="px-6 py-4 text-xs font-bold uppercase tracking-[0.14em] text-white">
                          จัดการ
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {enableDesktopReorder ? (
                        <SortableContext
                          items={orderedVehicles.map((v) => v.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          {orderedVehicles.map((vehicle, index) => (
                            <SortableDesktopVehicleRow
                              key={vehicle.id}
                              vehicle={vehicle}
                              displayIndex={index + 1}
                              onViewCustomers={setSelectedVehicle}
                            />
                          ))}
                        </SortableContext>
                      ) : (
                        orderedVehicles.map((vehicle, index) => (
                          <DesktopVehicleRow
                            key={vehicle.id}
                            vehicle={vehicle}
                            displayIndex={index + 1}
                            onViewCustomers={setSelectedVehicle}
                          />
                        ))
                      )}
                    </tbody>
                  </table>

                  {isReordering ? (
                    <div className="flex items-center justify-center gap-2 border-t border-[#E1BEE7] bg-white/90 px-4 py-2 text-xs font-bold text-[#4A148C] backdrop-blur">
                      <LoaderCircle className="h-4 w-4 animate-spin" strokeWidth={2.4} />
                      กำลังบันทึกลำดับรถ...
                    </div>
                  ) : null}
                </DndContext>
              </div>
            </>
          )}
        </SettingsPanelBody>
      </SettingsPanel>

      {/* ── Customer list modal ── */}
      {selectedVehicle ? (
        <div className="fixed inset-0 z-[220] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-t-[32px] bg-white shadow-[0_24px_80px_rgba(15,23,42,0.25)] sm:rounded-[32px]">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-6">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#EA80FC]/30 text-[#4A148C]">
                  <Truck className="h-5 w-5" strokeWidth={2.4} />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#4A148C]">
                    รายชื่อร้านค้า
                  </p>
                  <h3 className="mt-1 truncate text-xl font-black text-slate-950">
                    {selectedVehicle.name}
                  </h3>
                  <p className="mt-1 text-sm font-black text-[#1a1a1a]">
                    {selectedVehicle.customers.length.toLocaleString("th-TH")} ร้านค้า
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedVehicle(null)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-900"
                aria-label="ปิด"
              >
                <X className="h-5 w-5" strokeWidth={2.5} />
              </button>
            </div>

            <div className="overflow-y-auto px-5 py-5 sm:px-6">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {selectedVehicle.customers.map((customer) => (
                  <div
                    key={customer.id}
                    className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_10px_28px_rgba(15,23,42,0.04)]"
                  >
                    <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-[#4A148C]">
                      <Store className="h-4.5 w-4.5" strokeWidth={2.3} />
                    </div>
                    <p className="text-xs font-black text-[#4A148C]">{customer.code}</p>
                    <p className="mt-1 line-clamp-2 text-sm font-black leading-5 text-slate-950">
                      {customer.name}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
