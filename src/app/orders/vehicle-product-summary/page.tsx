import { Suspense } from "react";
import type { Viewport } from "next";
import { PageLoader } from "@/components/page-loader";
import { requireAnyRole } from "@/lib/auth/authorization";
import { getVehicleProductSummaryData } from "@/lib/orders/vehicle-product-summary";
import { VehicleProductSummaryClient } from "./vehicle-product-summary-client";

export const metadata = { title: "สรุปสินค้าตามรถ" };
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

export default async function VehicleProductSummaryWrapper({ searchParams }: Props) {
  return (
    <Suspense fallback={<PageLoader />}>
      <VehicleProductSummaryPage searchParams={searchParams} />
    </Suspense>
  );
}

async function VehicleProductSummaryPage({ searchParams }: Props) {
  const session = await requireAnyRole(["admin", "member", "warehouse"]);
  const params = await searchParams;
  const date = params.date ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
  const endDate = params.endDate ?? date;
  const autoprint = params.autoprint === "1";

  const summaryData = await getVehicleProductSummaryData(session.organizationId, date, endDate);

  return (
    <VehicleProductSummaryClient
      summaryData={summaryData}
      date={date}
      endDate={endDate}
      autoprint={autoprint}
    />
  );
}
