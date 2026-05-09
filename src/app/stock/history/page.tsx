import { Suspense } from "react";
import { getStockHistoryData } from "@/lib/stock/admin";
import { requireAppRole } from "@/lib/auth/authorization";
import { PageLoader } from "@/components/page-loader";
import { StockHistoryClient } from "./stock-history-client";

export const metadata = {
  title: "ประวัติการรับเข้าสินค้า",
};

export default async function StockHistoryPage() {
  const session = await requireAppRole("admin");
  const history = await getStockHistoryData(session.organizationId);

  return (
    <Suspense fallback={<PageLoader />}>
      <StockHistoryClient history={history} />
    </Suspense>
  );
}
