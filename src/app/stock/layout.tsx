"use client";

import { usePathname } from "next/navigation";
import { SettingsShell } from "@/components/settings/settings-shell";
import { StockTabs } from "@/components/settings/stock-tabs";
import { PackageCheck } from "lucide-react";

export default function StockLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // Determine current tab from pathname
  let current: "movements" | "stock" | "history" | "issues" = "stock";
  if (pathname.includes("/stock/movements")) current = "movements";
  else if (pathname.includes("/stock/history")) current = "history";
  else if (pathname.includes("/stock/issues")) current = "issues";
  else if (pathname === "/stock") current = "stock";

  // Dynamic description based on tab
  const descriptions = {
    stock: "ดูของคงเหลือ จองแล้ว และจัดการสต็อกพื้นฐาน",
    movements: "ติดตามการเคลื่อนไหวเข้า-ออกของสินค้าทั้งหมด",
    history: "ดูประวัติการรับเข้าสินค้าจากผู้ขาย",
    issues: "ดูประวัติการเบิกสินค้าออกจากคลัง"
  };

  return (
    <SettingsShell
      title="จัดการสต็อก"
      description={descriptions[current]}
      floatingSubmit={false}
      titleIcon={PackageCheck}
    >
      <StockTabs current={current} />
      <div className="mt-8">
        {children}
      </div>
    </SettingsShell>
  );
}
