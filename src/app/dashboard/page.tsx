import "server-only";

import { redirect } from "next/navigation";
import { AppSidebarLayout } from "@/components/app-sidebar";
import { requireAppSession, roleHomePage } from "@/lib/auth/authorization";
import { getDashboardOverview } from "@/lib/dashboard/overview";
import { getTodayInBangkok } from "@/lib/orders/date";
import { getOrderStoreStatusSummary } from "@/lib/orders/store-status";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import type { DashboardOverview } from "@/lib/dashboard/overview";
import type { OrderStoreStatusSummary } from "@/lib/orders/store-status";

export const metadata = { title: "ภาพรวม" };

export default async function DashboardPage() {
  const session = await requireAppSession();
  if (session.role === "warehouse") redirect(roleHomePage("warehouse"));

  const today = getTodayInBangkok();
  
  let overview: DashboardOverview | null = null;
  let storeStatusSummary: OrderStoreStatusSummary | null = null;

  try {
    const results = await Promise.all([
      getDashboardOverview(session.organizationId),
      getOrderStoreStatusSummary(session.organizationId, today),
    ]);
    overview = results[0];
    storeStatusSummary = results[1];
  } catch (error) {
    console.error("Dashboard data fetch error:", error);
    // Fallback empty states to prevent crash
    overview = {
      kpi: {
        todayOrderCount: 0,
        todayOrderAmount: 0,
        submittedOrderCount: 0,
        pendingDeliveryCount: 0,
        pendingDeliveryAmount: 0,
        monthDeliveredAmount: 0,
        activeCustomerCount: 0,
        lowStockCount: 0,
      },
      recentOrders: [],
      weeklyTrend: [],
      topCustomers: [],
      topProducts: [],
      stockProducts: [],
      stockSuppliers: [],
    };
    storeStatusSummary = {
      allStores: [],
      orderedStores: [],
      unorderedStores: [],
    };
  }

  return (
    <AppSidebarLayout>
      <DashboardClient 
        overview={overview}
        storeStatusSummary={storeStatusSummary}
        stockProducts={overview.stockProducts}
        stockSuppliers={overview.stockSuppliers}
        displayName={session.displayName}
        today={today}
      />
    </AppSidebarLayout>
  );
}
