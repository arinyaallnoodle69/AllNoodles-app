"use server";

import { requireAnyRole } from "@/lib/auth/authorization";
import { getStockHistoryData, getStockMovementsData } from "@/lib/stock/admin";
import { getStockIssueHistoryData } from "@/lib/stock/issues";

export async function loadMoreStockHistoryAction(offset: number, limit = 50, warehouseId?: string) {
  const session = await requireAnyRole(["admin", "member"]);
  return getStockHistoryData(session.organizationId, limit, offset, warehouseId);
}

export async function loadMoreStockIssuesAction(offset: number, limit = 50, warehouseId?: string, date?: string) {
  const session = await requireAnyRole(["admin", "member"]);
  return getStockIssueHistoryData(session.organizationId, limit, offset, date, warehouseId);
}

export async function loadMoreStockMovementsAction(offset: number, limit = 50) {
  const session = await requireAnyRole(["admin", "member"]);
  return getStockMovementsData(session.organizationId, limit, offset);
}
