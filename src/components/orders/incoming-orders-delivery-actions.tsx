"use client";

import { AllStoresDeliveryButton } from "@/components/orders/pending-orders-section";

type IncomingOrdersDeliveryActionsProps = {
  date: string;
  stores: {
    customerId: string;
    customerName: string;
    customerCode: string;
    orderIds?: string[];
    orderNumbers?: string[];
    orderRounds: number;
    totalAmount: number;
  }[];
};

export function IncomingOrdersDeliveryActions({ date, stores }: IncomingOrdersDeliveryActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <AllStoresDeliveryButton date={date} stores={stores} />
    </div>
  );
}
