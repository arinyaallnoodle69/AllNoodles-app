"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import {
  WarehouseForm,
  type WarehouseFormItem,
} from "@/components/settings/warehouse-form";

type WarehouseModalState =
  | { mode: "create" }
  | { mode: "edit"; warehouse: WarehouseFormItem }
  | null;

type WarehouseModalCtx = {
  openCreate: () => void;
  openEdit: (warehouse: WarehouseFormItem) => void;
};

const Ctx = createContext<WarehouseModalCtx | null>(null);

export function useWarehouseModal() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWarehouseModal must be used inside WarehouseModalProvider");
  return ctx;
}

/**
 * Opens/closes the warehouse form instantly with client state.
 * The ?create=1 / ?edit=<id> URL params are still honored on first render
 * (deep links) and cleaned up via history.replaceState on close — no server
 * round trip on open/close anymore.
 */
export function WarehouseModalProvider({
  children,
  warehouses,
  initialCreate = false,
  initialEditId = null,
}: {
  children: React.ReactNode;
  warehouses: WarehouseFormItem[];
  initialCreate?: boolean;
  initialEditId?: string | null;
}) {
  const [state, setState] = useState<WarehouseModalState>(() => {
    if (initialEditId) {
      const found = warehouses.find((warehouse) => warehouse.id === initialEditId);
      if (found) return { mode: "edit", warehouse: found };
    }
    if (initialCreate) return { mode: "create" };
    return null;
  });

  const close = useCallback(() => {
    setState(null);
    window.history.replaceState(null, "", "/settings/warehouses");
  }, []);

  const value = useMemo<WarehouseModalCtx>(
    () => ({
      openCreate: () => setState({ mode: "create" }),
      openEdit: (warehouse) => setState({ mode: "edit", warehouse }),
    }),
    [],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {state?.mode === "create" ? (
        <WarehouseForm returnHref="/settings/warehouses" onClose={close} />
      ) : null}
      {state?.mode === "edit" ? (
        <WarehouseForm
          key={state.warehouse.id}
          initialWarehouse={state.warehouse}
          returnHref="/settings/warehouses"
          onClose={close}
        />
      ) : null}
    </Ctx.Provider>
  );
}

export function WarehouseCreateButton({ variant }: { variant: "desktop" | "fab" }) {
  const { openCreate } = useWarehouseModal();

  if (variant === "fab") {
    return (
      <button
        type="button"
        onClick={openCreate}
        aria-label="เพิ่มคลัง"
        className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom)+12px)] left-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#4A148C] text-white shadow-[0_14px_32px_rgba(142, 36, 170,0.32)] transition active:scale-95 lg:hidden"
      >
        <Plus className="h-7 w-7" strokeWidth={2.6} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={openCreate}
      className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#4A148C] px-4 text-sm font-bold text-white shadow-[0_12px_26px_rgba(142, 36, 170,0.22)] transition hover:bg-[#4A148C] active:scale-[0.98]"
    >
      <Plus className="h-4.5 w-4.5" strokeWidth={2.4} />
      เพิ่มคลัง
    </button>
  );
}
