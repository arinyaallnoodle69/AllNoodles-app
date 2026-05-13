import "server-only";

import { redirect } from "next/navigation";
import { AppSidebarLayout } from "@/components/app-sidebar";
import { requireAppSession, roleHomePage } from "@/lib/auth/authorization";
import { getDashboardOverview } from "@/lib/dashboard/overview";
import { getTodayInBangkok } from "@/lib/orders/date";
import { getOrderStoreStatusSummary } from "@/lib/orders/store-status";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { getIncomingOrders, getOrderDetailById } from "@/lib/orders/detail";
import { getProductsForOrder } from "@/lib/orders/manage";

import type { DashboardOverview } from "@/lib/dashboard/overview";
import type { OrderStoreStatusSummary } from "@/lib/orders/store-status";
import type { OrderDetailData, IncomingOrderListItem } from "@/lib/orders/detail";
import type { OrderProductOption } from "@/lib/orders/manage";

export const metadata = { title: "ภาพรวม" };

type DashboardPageProps = {
  searchParams: Promise<{ date?: string; expanded?: string; q?: string }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const session = await requireAppSession();
  if (session.role === "warehouse") redirect(roleHomePage("warehouse"));

  const params = await searchParams;
  const today = getTodayInBangkok();
  const orderDate = params.date || today;
  const expandedOrderId = params.expanded?.trim() ?? "";
  
  let overview: DashboardOverview | null = null;
  let storeStatusSummary: OrderStoreStatusSummary | null = null;
  let expandedDetail: OrderDetailData | null = null;
  let orders: IncomingOrderListItem[] = [];
  let products: OrderProductOption[] = [];

  try {
    const results = await Promise.all([
      getDashboardOverview(session.organizationId),
      getOrderStoreStatusSummary(session.organizationId, orderDate),
      expandedOrderId ? getOrderDetailById(session.organizationId, expandedOrderId) : Promise.resolve(null),
      expandedOrderId ? getIncomingOrders(session.organizationId, { orderDate }) : Promise.resolve([]),
      expandedOrderId ? getProductsForOrder(session.organizationId) : Promise.resolve([]),
    ]);
    overview = results[0];
    storeStatusSummary = results[1];
    expandedDetail = results[2];
    orders = results[3];
    products = results[4];
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
        today={today}
        orderDate={orderDate}
        expandedDetail={expandedDetail}
        expandedOrderId={expandedOrderId}
        allOrders={orders}
        products={products}
      />
    </AppSidebarLayout>
  );
}
