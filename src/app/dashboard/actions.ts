"use server";

import { requireAppRole } from "@/lib/auth/authorization";
import { getStockDashboardData } from "@/lib/stock/admin";

/**
 * Lazy loader for the dashboard stock-receive modal. The full product payload
 * (images, sale units, warehouse stocks, modes) is heavy, so it is fetched
 * only when the user actually opens the modal — not on every dashboard load.
 */
export async function fetchDashboardStockProductsAction() {
  const session = await requireAppRole("admin");
  const data = await getStockDashboardData(session.organizationId, 0, 0);
  return data.products;
}
