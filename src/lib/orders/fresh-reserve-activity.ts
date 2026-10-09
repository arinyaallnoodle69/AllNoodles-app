type Activity = {
  beforeQuantity: number | null;
  afterQuantity: number;
  demandChange: number | null;
  reserveChange: number | null;
  remaining: number | null;
  reason: string;
};

export function describeFreshReserveActivity(activity: Activity): string[] {
  if (activity.reason === "legacy") return ["ไม่มีข้อมูลก่อนแก้"];
  const quantity = (value: number) => value.toLocaleString("th-TH", { maximumFractionDigits: 3 });
  const demand = activity.demandChange ?? 0;
  const reserve = activity.reserveChange ?? 0;
  const action = activity.reason === "cancel" ? "ยกเลิกออเดอร์" : ["transfer", "customer"].includes(activity.reason) ? "ปรับการจัดส่ง" : activity.reason === "special" ? "ปรับรายการพิเศษ" : demand > 0 ? "เพิ่มออเดอร์" : "ลดออเดอร์";
  const lines = [
    `${action} ${quantity(Math.abs(demand))} กก.`,
    `${quantity(activity.beforeQuantity ?? 0)} → ${quantity(activity.afterQuantity)} กก.`,
    `${reserve < 0 ? "คืนสำรอง" : "ใช้สำรอง"} ${quantity(Math.abs(reserve))} กก. → เหลือ ${quantity(activity.remaining ?? 0)} กก.`,
  ];
  if (demand > 0 && demand > reserve) lines.push(`เกินสำรอง ${quantity(demand - reserve)} กก.`);
  return lines;
}
