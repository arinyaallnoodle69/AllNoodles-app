import { redirect } from "next/navigation";

type SearchParams = Promise<{
  date?: string;
  warehouse?: string;
}>;

export default async function StockIssuesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  query.set("tab", "issues");
  if (params.warehouse) {
    query.set("warehouse", params.warehouse);
  }
  if (params.date) {
    query.set("date", params.date);
  }
  redirect(`/stock?${query.toString()}`);
}
