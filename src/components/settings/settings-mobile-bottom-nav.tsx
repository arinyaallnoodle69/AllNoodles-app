"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  BarChart2,
  Boxes,
  ClipboardList,
  Clock3,
  Factory,
  KeyRound,
  LayoutDashboard,
  LoaderCircle,
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
import { useClientRole } from "@/lib/auth/client-role";

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

function subscribeToClientMount() {
  return () => {};
}

function getClientSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

function isActive(href: string, pathname: string, activePrefix?: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (activePrefix) return pathname.startsWith(activePrefix);
  return pathname.startsWith(href);
}

function SettingsLinkStatus() {
  const { pending } = useLinkStatus();

  if (!pending) return null;

  return (
    <span
      aria-hidden="true"
      className="absolute inset-0 rounded-[1.35rem] bg-[#4A148C]/[0.03]"
    />
  );
}

export function SettingsMobileBottomNav() {
  const role = useClientRole();
  const isMember = role === "member";
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [navigatingHref, setNavigatingHref] = useState<string | null>(null);
  const mounted = useSyncExternalStore(
    subscribeToClientMount,
    getClientSnapshot,
    getServerSnapshot,
  );
  const { open: openCreateOrder, isOpen: isCreateModalOpen } = useCreateOrder();

  const moreActive = moreItems.some((item) => pathname.startsWith(item.href));
  const settingsModalOpen = settingsOpen && navigatingHref !== pathname;

  function resetNavigationState() {
    setMoreOpen(false);
    setSettingsOpen(false);
    setNavigatingHref(null);
  }

  // รีเซ็ตสถานะการนำทางและปิด Modal เมื่อมีการเปลี่ยนเส้นทาง (ป้องกันค้างเมื่อปัดย้อนกลับหรือเปลี่ยนหน้าสำเร็จ)
  useEffect(() => {
    const timer = setTimeout(() => {
      resetNavigationState();
    }, 0);
    return () => clearTimeout(timer);
  }, [pathname]);

  const nav = (
    <>
      {moreOpen ? (
        <div
          className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={resetNavigationState}
        />
      ) : null}

      {/* More menu drawer */}
      <div
        className={`fixed inset-x-0 bottom-0 z-[100] rounded-t-[2rem] border-t border-[#EA80FC]/30 bg-[#F3E5F5] shadow-[0_-12px_40px_rgba(142, 36, 170,0.15)] transition-transform duration-300 ease-out lg:hidden ${
          moreOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-[#EA80FC]/25 px-5 py-4">
          <span className="text-base font-bold text-[#4A148C]">เมนูเพิ่มเติม</span>
          <button
            type="button"
            onClick={resetNavigationState}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200/50 text-[#4A148C] transition active:scale-90"
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
                  setNavigatingHref(null);
                  setSettingsOpen(true);
                }}
                className={`flex flex-col items-center gap-2.5 rounded-2xl border px-3 py-5 text-sm font-semibold transition active:scale-[0.98] ${
                  active
                    ? "border-[#EA80FC]/45 bg-[#4A148C] text-white shadow-lg shadow-[#4A148C]/25"
                    : "border-slate-200 bg-white text-[#4A148C] shadow-sm"
                }`}
              >
                <Icon className="h-7 w-7" strokeWidth={1.8} />
                <span>{label}</span>
              </button>
            ) : (
              <Link
                key={href}
                href={href}
                onClick={resetNavigationState}
                className={`flex flex-col items-center gap-2.5 rounded-2xl border px-3 py-5 text-sm font-semibold transition active:scale-[0.98] ${
                  active
                    ? "border-[#EA80FC]/45 bg-[#4A148C] text-white shadow-lg shadow-[#4A148C]/25"
                    : "border-slate-200 bg-white text-[#4A148C] shadow-sm"
                }`}
              >
                <Icon className="h-7 w-7" strokeWidth={1.8} />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>

        <div className="border-t border-[#EA80FC]/20 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
          <form action={signOut}>
            <button
              type="submit"
              onClick={resetNavigationState}
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
              {isMember ? (
                <>
                  {/* Column 1: Orders */}
                  {(() => {
                    const active = pathname.startsWith("/orders");
                    return (
                      <Link
                        href="/orders/incoming"
                        onClick={resetNavigationState}
                        className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-medium transition ${
                          active ? "text-[#4A148C]" : "text-slate-500 hover:text-slate-900"
                        }`}
                      >
                        <ClipboardList className={`h-5 w-5 transition-colors ${active ? "text-[#4A148C]" : "text-slate-500"}`} strokeWidth={active ? 2.8 : 2.2} />
                        <span className={`whitespace-nowrap transition-all ${active ? "font-bold scale-105" : ""}`}>ออเดอร์</span>
                      </Link>
                    );
                  })()}

                  {/* Column 2: Stock */}
                  {(() => {
                    const active = pathname.startsWith("/stock");
                    return (
                      <Link
                        href="/stock"
                        onClick={resetNavigationState}
                        className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-medium transition ${
                          active ? "text-[#4A148C]" : "text-slate-500 hover:text-slate-900"
                        }`}
                      >
                        <Boxes className={`h-5 w-5 transition-colors ${active ? "text-[#4A148C]" : "text-slate-500"}`} strokeWidth={active ? 2.8 : 2.2} />
                        <span className={`whitespace-nowrap transition-all ${active ? "font-bold scale-105" : ""}`}>สต็อก</span>
                      </Link>
                    );
                  })()}

                  {/* Column 3: Spacer */}
                  <div aria-hidden="true" />

                  {/* Column 4: Billing */}
                  {(() => {
                    const active = pathname.startsWith("/billing");
                    return (
                      <Link
                        href="/billing"
                        onClick={resetNavigationState}
                        className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-medium transition ${
                          active ? "text-[#4A148C]" : "text-slate-500 hover:text-slate-900"
                        }`}
                      >
                        <Receipt className={`h-5 w-5 transition-colors ${active ? "text-[#4A148C]" : "text-slate-500"}`} strokeWidth={active ? 2.8 : 2.2} />
                        <span className={`whitespace-nowrap transition-all ${active ? "font-bold scale-105" : ""}`}>ใบวางบิล</span>
                      </Link>
                    );
                  })()}

                  {/* Column 5: Logout */}
                  <form action={signOut} className="w-full flex items-center justify-center">
                    <button
                      type="submit"
                      className="flex w-full flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-medium transition text-slate-500 hover:text-slate-900"
                    >
                      <LogOut className="h-5 w-5 text-slate-500" strokeWidth={2.2} />
                      <span className="whitespace-nowrap">ออกระบบ</span>
                    </button>
                  </form>
                </>
              ) : (
                <>
                  {primaryNav.slice(0, 2).map(({ href, icon: Icon, label, ...rest }) => {
                    const activePrefix =
                      "activePrefix" in rest ? (rest as { activePrefix: string }).activePrefix : undefined;
                    const active = isActive(href, pathname, activePrefix);

                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={resetNavigationState}
                        className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-medium transition ${
                          active
                            ? "text-[#4A148C]"
                            : "text-slate-500 hover:text-slate-900"
                        }`}
                      >
                        <Icon className={`h-5 w-5 transition-colors ${active ? "text-[#4A148C]" : "text-slate-500"}`} strokeWidth={active ? 2.8 : 2.2} />
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
                        onClick={resetNavigationState}
                        className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-medium transition ${
                          active
                            ? "text-[#4A148C]"
                            : "text-slate-500 hover:text-slate-900"
                        }`}
                      >
                        <Icon className={`h-5 w-5 transition-colors ${active ? "text-[#4A148C]" : "text-slate-500"}`} strokeWidth={active ? 2.8 : 2.2} />
                        <span className={`whitespace-nowrap transition-all ${active ? "font-bold scale-105" : ""}`}>{label}</span>
                      </Link>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => {
                      setSettingsOpen(false);
                      setNavigatingHref(null);
                      setMoreOpen(true);
                    }}
                    className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-medium transition ${
                      moreActive
                        ? "text-[#4A148C]"
                        : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    <MoreHorizontal className={`h-5 w-5 transition-colors ${moreActive ? "text-[#4A148C]" : "text-slate-500"}`} strokeWidth={2.4} />
                    <span className={`whitespace-nowrap ${moreActive ? "font-bold" : ""}`}>เพิ่มเติม</span>
                  </button>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              resetNavigationState();
              openCreateOrder();
            }}
            className={`absolute -top-3 left-1/2 z-50 flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-full border-[3px] border-[#EA80FC] bg-white shadow-[0_12px_24px_rgba(142, 36, 170,0.18),0_8px_18px_rgba(170, 0, 255,0.22)] ring-2 ring-white transition-all duration-300 active:scale-90 ${
              isCreateModalOpen
                ? "rotate-45"
                : "hover:shadow-[0_14px_28px_rgba(142, 36, 170,0.22),0_10px_22px_rgba(170, 0, 255,0.28)]"
            }`}
            aria-label="สร้างออเดอร์"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#4A148C] shadow-[inset_0_1px_2px_rgba(255,255,255,0.18),0_4px_10px_rgba(142, 36, 170,0.24)]">
              <Plus className="h-8 w-8 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.32)]" strokeWidth={3.2} />
            </span>
          </button>
        </div>
      </nav>

      {/* Settings Full Screen Modal */}
      {settingsModalOpen && (
        <div className="fixed inset-0 z-[200] bg-[#F3E5F5] animate-in fade-in duration-200 lg:hidden font-[family:var(--font-sarabun)]">
          <div className="flex h-[68px] items-center justify-between border-b border-[#EA80FC]/70 bg-[#4A148C] px-4 text-white">
            <span className="text-lg font-black tracking-wide text-white">ตั้งค่า</span>
            <button
              onClick={resetNavigationState}
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
                  onClick={(event) => {
                    if (navigatingHref) {
                      event.preventDefault();
                      return;
                    }
                    if (option.href === pathname) {
                      resetNavigationState();
                      return;
                    }
                    setNavigatingHref(option.href);
                  }}
                  aria-busy={navigatingHref === option.href}
                  className={`relative flex items-center gap-4 rounded-[1.35rem] border border-[#EA80FC]/25 bg-white p-4 shadow-[0_12px_30px_rgba(142, 36, 170,0.04)] transition active:scale-[0.98] active:bg-slate-50 ${
                    navigatingHref && navigatingHref !== option.href ? "opacity-55" : ""
                  }`}
                >
                  <SettingsLinkStatus />
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#EA80FC]/25 text-[#4A148C]">
                    <option.icon className="h-5.5 w-5.5" strokeWidth={2.2} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-slate-950 truncate">{option.label}</h3>
                    <p className="text-[11.5px] text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">{option.description}</p>
                  </div>
                  {navigatingHref === option.href ? (
                    <LoaderCircle className="h-4.5 w-4.5 shrink-0 animate-spin text-[#EA80FC]" strokeWidth={2.5} />
                  ) : (
                    <ArrowRight className="h-4.5 w-4.5 text-[#EA80FC] shrink-0" />
                  )}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (!mounted) return null;
  return createPortal(nav, document.body);
}
