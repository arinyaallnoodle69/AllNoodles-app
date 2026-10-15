export type ReserveHistoryEvent = {
  id: string; delta: number; reason: string; at: string;
  notes: string | null; customerName: string | null; orderNumber: string | null;
};
export type ReserveHistorySnapshot = {
  available: number; startDate: string; now: string; futureLegacy: number; events: ReserveHistoryEvent[];
};
export type ReserveHistoryDay = { date: string; opening: number; rows: (ReserveHistoryEvent & { remaining: number })[] };

export function bangkokDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date(value));
}

export function buildReserveHistory(snapshot: ReserveHistorySnapshot, from: string, to: string) {
  const now = Date.parse(snapshot.now);
  const effective = snapshot.events.filter(event => Date.parse(event.at) <= now)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id));
  // Legacy future-dated demand is already reserved by the existing balance view.
  let balance = snapshot.available;
  const initial = balance - effective.reduce((sum, event) => sum + Number(event.delta), 0);
  balance = initial;
  const days: ReserveHistoryDay[] = [];
  for (const event of effective) {
    const date = bangkokDate(event.at);
    if (date < from) continue;
    if (date > to) break;
    let day = days.at(-1);
    if (!day || day.date !== date) { day = { date, opening: balance, rows: [] }; days.push(day); }
    balance = Math.round((balance + Number(event.delta)) * 1000) / 1000;
    day.rows.push({ ...event, delta: Number(event.delta), remaining: balance });
  }
  if (!days.length && to >= snapshot.startDate) days.push({ date: from < snapshot.startDate ? snapshot.startDate : from, opening: initial, rows: [] });
  return { days, pending: snapshot.events.filter(event => Date.parse(event.at) > now), futureLegacy: snapshot.futureLegacy };
}

export function reserveHistoryLabel(event: ReserveHistoryEvent) {
  if (event.reason === "office") return event.delta > 0 ? "รับเข้าออฟฟิศ" : "ลด / ยกเลิกยอดรับเข้า";
  if (event.reason === "remaining") return event.delta < 0 ? "จ่ายของเหลือ" : "คืนจากของเหลือ";
  if (event.reason === "adjustment") return "ปรับยอดตรวจนับ";
  return event.delta < 0 ? event.customerName ?? "จ่ายตามออเดอร์" : `คืนจาก${event.customerName ? ` ${event.customerName}` : "ออเดอร์"}`;
}
