import { StockReceiveForm } from "@/components/settings/stock-receive-form";
import { StockList, StockMobileReceiveButton } from "@/components/settings/stock-list";
import { StockSummaryCards } from "@/components/settings/stock-summary-cards";
import { requireAppRole } from "@/lib/auth/authorization";
import { getStockDashboardData } from "@/lib/stock/admin";

export const metadata = {
  title: "จัดการสต็อก",
};

type StockPageProps = {
  searchParams: Promise<{
    receive?: string;
    product?: string;
  }>;
};

export default async function StockPage({ searchParams }: StockPageProps) {
  const session = await requireAppRole("admin");
  const data = await getStockDashboardData(session.organizationId);
  const params = await searchParams;

  return (
    <>
      {data.setupHint ? (
        <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          {data.setupHint} กรุณารัน migration `202603161100_inventory_stock_receipts_and_movements.sql`
          ก่อนใช้งานหน้าสต็อก
        </div>
      ) : null}

      <StockSummaryCards data={data} />

      <div className="mt-8">
        <div className="-mx-3 md:mx-0">
          <StockList products={data.products} baseHref="/stock" />
        </div>
      </div>

      <StockMobileReceiveButton baseHref="/stock" />
      <div className="h-20 sm:hidden" />

      {params.receive === "1" ? (
        <StockReceiveForm
          products={data.products}
          suppliers={data.suppliers}
          returnHref="/stock"
          defaultProductId={params.product ?? ""}
        />
      ) : null}
    </>
  );
}
