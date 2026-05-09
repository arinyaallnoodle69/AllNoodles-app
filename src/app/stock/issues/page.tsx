import { Suspense } from "react";
import { PageLoader } from "@/components/page-loader";
import { requireAppRole } from "@/lib/auth/authorization";
import { getStockIssueHistoryData } from "@/lib/stock/issues";
import { StockIssuesClient } from "./stock-issues-client";

export const metadata = {
  title: "เบิกสินค้าออก",
};

export default async function StockIssuesPage() {
  const session = await requireAppRole("admin");
  const issues = await getStockIssueHistoryData(session.organizationId);

  return (
    <Suspense fallback={<PageLoader />}>
      <StockIssuesClient issues={issues} />
    </Suspense>
  );
}
