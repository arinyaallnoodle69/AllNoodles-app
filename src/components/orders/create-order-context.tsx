"use client";

import { createContext, useCallback, useContext, useEffect, useState, useTransition } from "react";
import { fetchOrderModalDataAction } from "@/app/orders/incoming/actions";
import type { OrderCustomerOption, OrderProductOption } from "@/lib/orders/manage";

type CreateOrderData = {
  customers: OrderCustomerOption[];
  products: OrderProductOption[];
  today: string;
};

type CreateOrderCtx = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  data: CreateOrderData | null;
  isLoading: boolean;
};

const Ctx = createContext<CreateOrderCtx | null>(null);

export function CreateOrderProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<CreateOrderData | null>(null);
  const [isPending, startTransition] = useTransition();

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);

  // Pre-fetch data on mount for instant access
  useEffect(() => {
    if (!data && !isPending) {
      startTransition(async () => {
        try {
          const result = await fetchOrderModalDataAction();
          setData(result);
        } catch (error) {
          console.error("Failed to pre-fetch order modal data:", error);
        }
      });
    }
  }, [data, isPending]);

  return (
    <Ctx.Provider value={{ isOpen, open, close, data, isLoading: isPending }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCreateOrder() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCreateOrder must be used inside CreateOrderProvider");
  return ctx;
}
