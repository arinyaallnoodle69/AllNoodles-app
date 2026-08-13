export type StockTab = "stock" | "history" | "issues";

export function invalidateSelectedStockTabCache<THistory, TIssues>(
  tab: StockTab,
  data: {
    historyData: THistory | null;
    issuesData: TIssues | null;
  },
) {
  return {
    historyData: tab === "history" ? null : data.historyData,
    issuesData: tab === "issues" ? null : data.issuesData,
  };
}
