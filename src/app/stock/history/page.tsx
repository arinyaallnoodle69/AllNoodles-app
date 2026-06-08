import { redirect } from "next/navigation";

type SearchParams = Promise<{
  warehouse?: string;
}>;

export default async function StockHistoryPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const warehouse = params.warehouse;
  const redirectUrl = warehouse ? `/stock?tab=history&warehouse=${warehouse}` : "/stock?tab=history";
  redirect(redirectUrl);
}
