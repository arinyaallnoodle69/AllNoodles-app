export type DailyMovementEvent = {
  id: string;
  productId: string;
  warehouseId: string;
  occurredAt: string;
  type: string;
  delta: number;
  before: number;
  after: number;
  document: string | null;
  store: string | null;
  reason?: string | null;
};

export type DailyMovementRow = {
  productId: string;
  warehouseId: string;
  date: string;
  opening: number;
  received: number;
  sold: number;
  returned: number;
  adjusted: number;
  other: number;
  net: number;
  closing: number;
  sales: { store: string; document: string; quantity: number }[];
  movements: DailyMovementEvent[];
  mismatch: boolean;
};

export type MovementRangeRow = Omit<DailyMovementRow, "date"> & {
  from: string;
  to: string;
};

const bangkokDate = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Bangkok",
});

function dateInBangkok(timestamp: string) {
  const parts = bangkokDate.formatToParts(new Date(timestamp));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function datesBetween(from: string, to: string) {
  const dates: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const last = new Date(`${to}T00:00:00Z`);
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function orderSameTimestampEvents(events: DailyMovementEvent[], opening: number) {
  const ordered: DailyMovementEvent[] = [];
  let balance = opening;
  for (let start = 0; start < events.length;) {
    let end = start + 1;
    while (end < events.length && events[end].occurredAt === events[start].occurredAt) end++;
    const pending = events.slice(start, end);
    while (pending.length > 0) {
      const matchingIndex = pending.findIndex((event) => Math.abs(event.before - balance) <= 0.001);
      const [event] = pending.splice(matchingIndex < 0 ? 0 : matchingIndex, 1);
      ordered.push(event);
      balance = event.after;
    }
    start = end;
  }
  return ordered;
}

export function buildDailyMovementRows(from: string, to: string, events: DailyMovementEvent[]) {
  const byProductWarehouse = new Map<string, DailyMovementEvent[]>();
  for (const event of events) {
    const key = `${event.warehouseId}:${event.productId}`;
    const list = byProductWarehouse.get(key) ?? [];
    list.push(event);
    byProductWarehouse.set(key, list);
  }

  const rows: DailyMovementRow[] = [];
  for (const group of byProductWarehouse.values()) {
    group.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
    const eventsByDate = new Map<string, DailyMovementEvent[]>();
    for (const event of group) {
      const day = dateInBangkok(event.occurredAt);
      const list = eventsByDate.get(day) ?? [];
      list.push(event);
      eventsByDate.set(day, list);
    }

    let balance = group[0].before;
    for (const date of datesBetween(from, to)) {
      const row: DailyMovementRow = {
        productId: group[0].productId,
        warehouseId: group[0].warehouseId,
        date,
        opening: balance,
        received: 0,
        sold: 0,
        returned: 0,
        adjusted: 0,
        other: 0,
        net: 0,
        closing: balance,
        sales: [],
        movements: [],
        mismatch: false,
      };
      const sales = new Map<string, DailyMovementRow["sales"][number]>();
      for (const event of orderSameTimestampEvents(eventsByDate.get(date) ?? [], balance)) {
        row.movements.push(event);
        if (Math.abs(event.before - balance) > 0.001) {
          row.mismatch = true;
          balance = event.before;
        }
        if (Math.abs(event.after - event.before - event.delta) > 0.001) {
          row.mismatch = true;
        }
        if (event.type === "receipt" && event.delta > 0) row.received += event.delta;
        else if (event.type === "return" && event.delta > 0) row.returned += event.delta;
        else if (event.type === "issue" && event.delta < 0 && (event.store || /^DN/i.test(event.document ?? ""))) {
          const quantity = -event.delta;
          row.sold += quantity;
          const store = event.store ?? "ไม่พบชื่อร้าน";
          const document = event.document ?? "ไม่ระบุเลข";
          const key = `${store}:${document}`;
          const current = sales.get(key) ?? { store, document, quantity: 0 };
          current.quantity += quantity;
          sales.set(key, current);
        } else if (event.type === "adjustment") row.adjusted += event.delta;
        else row.other += event.delta;
        balance = event.after;
      }
      row.closing = balance;
      row.net = balance - row.opening;
      row.sales = Array.from(sales.values());
      rows.push(row);
    }
  }
  return rows;
}

export function aggregateDailyMovementRows(rows: DailyMovementRow[]): MovementRangeRow[] {
  const groups = new Map<string, DailyMovementRow[]>();
  for (const row of rows) {
    const key = `${row.warehouseId}:${row.productId}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return Array.from(groups.values()).map((group) => {
    const sorted = group.sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const sum = (field: "received" | "sold" | "returned" | "adjusted" | "other") =>
      sorted.reduce((total, row) => total + row[field], 0);

    return {
      ...first,
      from: first.date,
      to: last.date,
      received: sum("received"),
      sold: sum("sold"),
      returned: sum("returned"),
      adjusted: sum("adjusted"),
      other: sum("other"),
      closing: last.closing,
      net: last.closing - first.opening,
      sales: sorted.flatMap((row) => row.sales),
      movements: sorted.flatMap((row) => row.movements).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
      mismatch: sorted.some((row) => row.mismatch),
    };
  });
}
