"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ArrowRight,
  BarChart2,
  Boxes,
  ClipboardList,
  Clock3,
  Factory,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MessageCircleMore,
  MoreHorizontal,
  Package2,
  Plus,
  Receipt,
  Settings2,
  Store,
  Truck,
  Warehouse,
  X,
} from "lucide-react";
import { signOut } from "@/app/login/actions";
import { useCreateOrder } from "@/components/orders/create-order-context";

const primaryNav = [
  { href: "/dashboard", icon: LayoutDashboard, label: "แดชบอร์ด" },
  { href: "/orders/incoming", icon: ClipboardList, label: "ออเดอร์" },
  { href: "/reports/product-sales", icon: BarChart2, label: "รายงาน", activePrefix: "/reports" },
] as const;

const moreItems = [
  { href: "/stock", icon: Boxes, label: "สต็อก" },
  { href: "/billing", icon: Receipt, label: "ใบวางบิล" },
  { href: "/settings", icon: Settings2, label: "ตั้งค่า" },
] as const;

function isActive(href: string, pathname: string, activePrefix?: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (activePrefix) return pathname.startsWith(activePrefix);
  return pathname.startsWith(href);
}

export function SettingsMobileBottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { open: openCreateOrder, isOpen: isCreateModalOpen } = useCreateOrder();

  const moreActive = moreItems.some((item) => pathname.startsWith(item.href));

  return (
    <>
      {moreOpen ? (
        <div
          className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMoreOpen(false)}
        />
      ) : null}

      {/* More menu drawer */}
      <div
        className={`fixed inset-x-0 bottom-0 z-[100] rounded-t-[2rem] border-t border-[#D4AF37]/30 bg-[#FAF7F2] shadow-[0_-12px_40px_rgba(8,42,99,0.15)] transition-transform duration-300 ease-out lg:hidden ${
          moreOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-[#D4AF37]/25 px-5 py-4">
          <span className="text-base font-bold text-[#082A63]">เมนูเพิ่มเติม</span>
          <button
            type="button"
            onClick={() => setMoreOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200/50 text-[#082A63] transition active:scale-90"
            aria-label="ปิด"
          >
            <X className="h-5 w-5" strokeWidth={2.5} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {moreItems.map(({ href, icon: Icon, label }) => {
            const active = pathname.startsWith(href);

            return href === "/settings" ? (
              <button
                key={href}
                onClick={() => {
                  setMoreOpen(false);
                  setSettingsOpen(true);
                }}
                className={`flex flex-col items-center gap-2.5 rounded-2xl border px-3 py-5 text-sm font-semibold transition active:scale-[0.98] ${
                  active
                    ? "border-[#D4AF37]/45 bg-[#082A63] text-white shadow-lg shadow-[#082A63]/25"
                    : "border-slate-200 bg-white text-[#1F2A44] shadow-sm"
                }`}
              >
                <Icon className="h-7 w-7" strokeWidth={1.8} />
                <span>{label}</span>
              </button>
            ) : (
              <Link
                key={href}
                href={href}
                onClick={() => setMoreOpen(false)}
                className={`flex flex-col items-center gap-2.5 rounded-2xl border px-3 py-5 text-sm font-semibold transition active:scale-[0.98] ${
                  active
                    ? "border-[#D4AF37]/45 bg-[#082A63] text-white shadow-lg shadow-[#082A63]/25"
                    : "border-slate-200 bg-white text-[#1F2A44] shadow-sm"
                }`}
              >
                <Icon className="h-7 w-7" strokeWidth={1.8} />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>

        <div className="border-t border-[#D4AF37]/20 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
          <form action={signOut}>
            <button
              type="submit"
              onClick={() => setMoreOpen(false)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600 transition active:bg-rose-100"
            >
              <LogOut className="h-5 w-5" strokeWidth={2.2} />
              <span>ออกจากระบบ</span>
            </button>
          </form>
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 lg:hidden">
        <div className="relative w-full">
          {/* Curved Background with Notch */}
          <div className="absolute inset-x-0 bottom-0 -z-10 h-[calc(100%+20px)]">
            <svg
              viewBox="0 0 400 80"
              preserveAspectRatio="none"
              className="h-full w-full fill-white drop-shadow-[0_-12px_28px_rgba(15,23,42,0.1)]"
            >
              <path
                d="M0 20 H130 C160 20, 160 68, 200 68 C240 68, 240 20, 270 20 H400 V80 H0 Z"
              />
            </svg>
          </div>

          <div className="relative px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-3">
            <div className="grid grid-cols-5 items-end">
              {primaryNav.slice(0, 2).map(({ href, icon: Icon, label, ...rest }) => {
                const activePrefix =
                  "activePrefix" in rest ? (rest as { activePrefix: string }).activePrefix : undefined;
                const active = isActive(href, pathname, activePrefix);

                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-medium transition ${
                      active
                        ? "text-[#082A63]"
                        : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    <Icon className={`h-5 w-5 transition-colors ${active ? "text-[#082A63]" : "text-slate-500"}`} strokeWidth={active ? 2.8 : 2.2} />
                    <span className={`whitespace-nowrap transition-all ${active ? "font-bold scale-105" : ""}`}>{label}</span>
                  </Link>
                );
              })}

              <div aria-hidden="true" />

              {primaryNav.slice(2).map(({ href, icon: Icon, label, ...rest }) => {
                const activePrefix =
                  "activePrefix" in rest ? (rest as { activePrefix: string }).activePrefix : undefined;
                const active = isActive(href, pathname, activePrefix);

                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-medium transition ${
                      active
                        ? "text-[#082A63]"
                        : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    <Icon className={`h-5 w-5 transition-colors ${active ? "text-[#082A63]" : "text-slate-500"}`} strokeWidth={active ? 2.8 : 2.2} />
                    <span className={`whitespace-nowrap transition-all ${active ? "font-bold scale-105" : ""}`}>{label}</span>
                  </Link>
                );
              })}

              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-medium transition ${
                  moreActive
                    ? "text-[#082A63]"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                <MoreHorizontal className={`h-5 w-5 transition-colors ${moreActive ? "text-[#082A63]" : "text-slate-500"}`} strokeWidth={2.4} />
                <span className={`whitespace-nowrap ${moreActive ? "font-bold" : ""}`}>เพิ่มเติม</span>
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => openCreateOrder()}
            className={`absolute -top-5 left-1/2 z-50 flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-full transition-all duration-300 before:pointer-events-none before:absolute before:inset-x-4 before:top-2 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/60 before:to-transparent active:scale-90 ${
              isCreateModalOpen
                ? "rotate-45 bg-[#082A63] text-[#D4AF37] border-2 border-[#D4AF37] shadow-[0_12px_28px_rgba(8,42,99,0.3)] ring-4 ring-[#082A63]/20"
                : "bg-gradient-to-br from-[#F5D374] via-[#D4AF37] to-[#A6801E] text-white border-2 border-white/60 shadow-[0_12px_28px_rgba(212,175,55,0.4)] ring-4 ring-[#D4AF37]/25 hover:brightness-105"
            }`}
            aria-label="สร้างออเดอร์"
          >
            <Plus className="h-9 w-9 drop-shadow-[0_1.5px_3px_rgba(163,122,26,0.5)]" strokeWidth={3.5} />
          </button>
        </div>
      </nav>

      {/* Settings Full Screen Modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-[200] bg-[#FAF7F2] animate-in fade-in duration-200 lg:hidden font-[family:var(--font-sarabun)]">
          <div className="flex h-[68px] items-center justify-between border-b border-[#D4AF37]/70 bg-[#082A63] px-4 text-white">
            <span className="text-lg font-black tracking-wide text-white">ตั้งค่า</span>
            <button
              onClick={() => setSettingsOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/12 text-white/90 hover:bg-white/20 transition active:scale-95"
            >
              <X className="h-5 w-5" strokeWidth={2.5} />
            </button>
          </div>
          <div className="overflow-y-auto p-4 pb-20" style={{ maxHeight: "calc(100vh - 68px)" }}>
            <div className="grid gap-4">
              {[
                {
                  description: "เพิ่มสินค้าใหม่ อัปเดตรหัสสินค้า รูปสินค้า และต้นทุน",
                  href: "/settings/products",
                  icon: Package2,
                  label: "จัดการสินค้า",
                },
                {
                  description: "เพิ่มร้านค้า จัดการข้อมูลหน้าร้าน ที่อยู่ และเลือกรถประจำร้าน",
                  href: "/settings/customers",
                  icon: Store,
                  label: "จัดการร้านค้า",
                },
                {
                  description: "เพิ่มรายชื่อผู้ขายหรือโรงงานที่คุณสั่งซื้อสินค้า เพื่อใช้บันทึกรับเข้าสต็อก",
                  href: "/settings/suppliers",
                  icon: Factory,
                  label: "จัดการผู้ขาย",
                },
                {
                  description: "ดูชื่อ LINE รูปโปรไฟล์ สถานะการใช้งาน และจัดการสิทธิ์ลูกค้าที่เข้ามาผ่าน LINE",
                  href: "/settings/customer-data",
                  icon: MessageCircleMore,
                  label: "ข้อมูลลูกค้า",
                },
                {
                  description: "เพิ่มรถส่งของแบบง่าย เพื่อเอาไปผูกร้านค้าและใช้ต่อยอดกับงานจัดส่ง",
                  href: "/settings/vehicles",
                  icon: Truck,
                  label: "จัดการรถ",
                },
                {
                  description: "เพิ่มคลังสินค้า ตั้งค่าคลังหลักและคลังต่างจังหวัด",
                  href: "/settings/warehouses",
                  icon: Warehouse,
                  label: "จัดการคลัง",
                },
                {
                  description: "ตั้งเวลาเปิด-ปิดรับออเดอร์ และจัดการแจ้งเตือนออเดอร์ใหม่",
                  href: "/settings/order-window",
                  icon: Clock3,
                  label: "เวลารับออเดอร์และแจ้งเตือน",
                },
                {
                  description: "เปลี่ยนรหัสเข้าใช้งานสำหรับผู้ดูแลระบบ",
                  href: "/settings/login-pin",
                  icon: KeyRound,
                  label: "ตั้งค่า PIN",
                },
              ].map((option) => (
                <Link
                  key={option.href}
                  href={option.href}
                  onClick={() => setSettingsOpen(false)}
                  className="flex items-center gap-4 rounded-[1.35rem] border border-[#D4AF37]/25 bg-white p-4 shadow-[0_12px_30px_rgba(8,42,99,0.04)] transition active:scale-[0.98] active:bg-slate-50"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#D4AF37]/25 text-[#082A63]">
                    <option.icon className="h-5.5 w-5.5" strokeWidth={2.2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-slate-950 truncate">{option.label}</h3>
                    <p className="text-[11.5px] text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">{option.description}</p>
                  </div>
                  <ArrowRight className="h-4.5 w-4.5 text-[#D4AF37] shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
