import { bangkokDate, buildReserveHistory, type ReserveHistorySnapshot } from "./reserve-product-history";

export type RecentReserveMovement = {
  id: string; product_id: string; productName: string; quantity_delta: number;
  reason: string; created_at: string; effective_at: string;
  movement_id?: string; event_kind?: string; event_at?: string;
};
export type RecentReserveActivity = RecentReserveMovement & {
  waiting: boolean; at: string; before: number | null; after: number | null;
};

export function buildRecentReserveActivities(movements: RecentReserveMovement[], snapshots: Map<string, ReserveHistorySnapshot>, now: string): RecentReserveActivity[] {
  const balances = new Map<string, number>();
  for (const snapshot of snapshots.values()) {
    const ledger = buildReserveHistory(snapshot, snapshot.startDate, bangkokDate(snapshot.now));
    for (const day of ledger.days) for (const row of day.rows) balances.set(row.id, row.remaining);
  }
  return movements.map(item => {
    const waiting = item.event_kind === "scheduled" || (item.event_kind !== "received" && Date.parse(item.effective_at) > Date.parse(now));
    const snapshot = snapshots.get(item.product_id);
    const historicalBalance = snapshot ? Math.round((snapshot.available - snapshot.events.filter(event => Date.parse(event.at) > Date.parse(item.created_at) && Date.parse(event.at) <= Date.parse(snapshot.now)).reduce((sum, event) => sum + Number(event.delta), 0)) * 1000) / 1000 : null;
    const after = waiting ? item.event_kind === "scheduled" ? historicalBalance : snapshot?.available ?? null : balances.get(item.movement_id ?? item.id) ?? null;
    return { ...item, quantity_delta: Number(item.quantity_delta), waiting, at: item.event_at ?? (waiting ? item.created_at : item.effective_at),
      before: after === null ? null : waiting ? after : Math.round((after - Number(item.quantity_delta)) * 1000) / 1000,
      after: after === null ? null : waiting ? Math.round((after + Math.max(0, Number(item.quantity_delta))) * 1000) / 1000 : after };
  });
}
