export function isProvincialLotusReserve(mode: string | undefined, warehouseName: string | undefined, supplierCode: string | null | undefined, orderDate: string, source: string | undefined) {
  if (mode !== "fresh" || warehouseName !== "คลังต่างจังหวัด" || supplierCode !== "TYV005") return false;
  if (source === "reserve") return true;
  if (source !== "legacy") return false;
  const weekday = new Date(`${orderDate}T12:00:00Z`).getUTCDay();
  return Number.isFinite(weekday) && weekday !== 1 && weekday !== 4;
}
