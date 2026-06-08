import { Clock, Lock } from "lucide-react";

type OrderStatusBannerProps = {
  allowOrderAfterCutoff?: boolean;
  closeTime: string;
  isOpen: boolean;
  openTime: string;
};

export function OrderStatusBanner({
  allowOrderAfterCutoff = false,
  closeTime,
  isOpen,
  openTime,
}: OrderStatusBannerProps) {
  if (isOpen) {
    return (
      <div
        className="flex items-center gap-3 border-b px-4 py-3"
        style={{ background: "#FAF7F2", borderColor: "#F2E3AE", borderLeft: "4px solid #082A63" }}
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{ background: "#082A63" }}
        >
          <Clock className="h-5 w-5 text-white" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold leading-snug" style={{ color: "#082A63" }}>
            {allowOrderAfterCutoff ? "เปิดรับออเดอร์รอบพิเศษ" : "เปิดรับออเดอร์อยู่"}
          </p>
          <p className="text-sm font-medium" style={{ color: "#103B82" }}>
            {allowOrderAfterCutoff
              ? `เวลาปกติ ${openTime} - ${closeTime} น.`
              : `รับออเดอร์ถึง ${closeTime} น. วันนี้`}
          </p>
        </div>
        <span
          className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold"
          style={{
            background: allowOrderAfterCutoff ? "#F2E3AE" : "#dcfce7",
            color: allowOrderAfterCutoff ? "#1d4ed8" : "#15803d",
          }}
        >
          <span
            className={`h-2.5 w-2.5 rounded-full ${allowOrderAfterCutoff ? "bg-[#FAF7F2]0" : "bg-emerald-500"}`}
            style={{
              boxShadow: allowOrderAfterCutoff ? "0 0 6px #3b82f6" : "0 0 6px #22c55e",
              willChange: "transform",
            }}
          />
          {allowOrderAfterCutoff ? "พิเศษ" : "เปิด"}
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-3 border-b px-4 py-3"
      style={{ background: "#fff7f0", borderColor: "#fdd9b5", borderLeft: "4px solid #c2410c" }}
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{ background: "#c2410c" }}
      >
        <Lock className="h-5 w-5 text-white" strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold leading-snug" style={{ color: "#9a3412" }}>
          ปิดรับออเดอร์แล้ว
        </p>
        <p className="text-sm font-medium leading-snug" style={{ color: "#b45309" }}>
          เปิดรับอีกครั้งเวลา {openTime === "00:00" ? "เที่ยงคืน" : `${openTime} น.`}
        </p>
      </div>
      <span
        className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold"
        style={{ background: "#fee2e2", color: "#b91c1c" }}
      >
        <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
        ปิด
      </span>
    </div>
  );
}
