import { Suspense } from "react";
import type { Viewport } from "next";
import { PageLoader } from "@/components/page-loader";
import { requireAnyRole } from "@/lib/auth/authorization";
import { getFactoryOrderSheetData } from "@/lib/orders/vehicle-product-summary";
import { FactoryOrderSheetClient } from "./factory-order-sheet-client";

export const metadata = { title: "พิมพ์ใบสั่งของ" };
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

type Props = {
  searchParams: Promise<{
    date?: string;
    endDate?: string;
    autoprint?: string;
  }>;
};

export default async function FactoryOrderSheetWrapper({ searchParams }: Props) {
  return (
    <Suspense fallback={<PageLoader />}>
      <FactoryOrderSheetPage searchParams={searchParams} />
    </Suspense>
  );
}

async function FactoryOrderSheetPage({ searchParams }: Props) {
  const session = await requireAnyRole(["admin", "member", "warehouse"]);
  const params = await searchParams;
  const date = params.date ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
  const endDate = params.endDate ?? date;
  const autoprint = params.autoprint === "1";
  const factorySheets = await getFactoryOrderSheetData(session.organizationId, date, endDate);

  return (
    <FactoryOrderSheetClient
      factorySheets={factorySheets}
      date={date}
      endDate={endDate}
      autoprint={autoprint}
    />
  );
}
