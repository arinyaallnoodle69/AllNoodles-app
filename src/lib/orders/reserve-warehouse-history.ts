export type WarehouseReserveMovement = {
  id: string; productName: string; quantity_delta: number; quantity_after: number | null;
  reason: string; effective_at: string; created_at: string;
  before?: number | null; after?: number | null; waiting?: boolean; at?: string;
  event_kind?: string;
};
export type WarehouseHistoryPage = {
  items: WarehouseReserveMovement[];
  total: number;
  asOf: string;
  cursor: { at: string; id: string } | null;
};
export const reserveHistoryDay = (at: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date(at));
export function reserveHistoryWeek(today: string) {
  return new Date(Date.parse(`${today}T12:00:00Z`) - 6 * 86400000).toISOString().slice(0, 10);
}
