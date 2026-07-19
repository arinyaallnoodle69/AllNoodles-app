import Link from "next/link";
import { ArrowRight, Clock3, KeyRound, MessageCircleMore, Package2, Palette, Store, Truck, Factory, Gauge, Warehouse, Image as ImageIcon } from "lucide-react";
import { SettingsShell } from "@/components/settings/settings-shell";
import { requireAppRole } from "@/lib/auth/authorization";

const options = [
  {
    description: "เพิ่มสินค้าใหม่ อัปเดตรหัสสินค้า รูปสินค้า และต้นทุน",
    href: "/settings/products",
    icon: Package2,
    label: "จัดการสินค้า",
  },
  {
    description: "กำหนดสีหมวดหมู่ที่ใช้แยกคอลัมน์ในใบออเดอร์และตัวอย่างก่อนพิมพ์",
    href: "/settings/products/category-colors",
    icon: Palette,
    label: "สีหมวดหมู่ในใบออเดอร์",
  },
  {
    description: "เพิ่มร้านค้า จัดการข้อมูลหน้าร้าน ที่อยู่ และเลือกรถประจำร้าน",
    href: "/settings/customers",
    icon: Store,
    label: "จัดการร้านค้า",
  },
  {
    description: "อัปโหลดและเปลี่ยนรูปโลโก้ร้านค้า สำหรับพิมพ์หัวบิล หน้าจอหลัก และระบบ",
    href: "/settings/logo",
    icon: ImageIcon,
    label: "ตั้งค่าโลโก้ร้านค้า",
  },
  {
    description: "เพิ่มรายชื่อผู้ขายหรือโรงงานที่คุณสั่งซื้อสินค้า เพื่อใช้บันทึกรับเข้าสต็อก",
    href: "/settings/suppliers",
    icon: Factory,
    label: "จัดการผู้ขาย",
  },
  {
    description: "เพิ่มคลังสินค้า ตั้งค่าคลังหลักและคลังต่างจังหวัด สำหรับแยกสต็อคตามพื้นที่",
    href: "/settings/warehouses",
    icon: Warehouse,
    label: "จัดการคลัง",
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
    description: "ตั้งเวลาเปิด-ปิดรับออเดอร์ และจัดการแจ้งเตือนออเดอร์ใหม่ของอุปกรณ์นี้ได้ในหน้าเดียว",
    href: "/settings/order-window",
    icon: Clock3,
    label: "เวลารับออเดอร์และแจ้งเตือน",
  },
  {
    description: "เปลี่ยนรหัสเข้าใช้งานและดูประวัติการเข้าใช้งานล่าสุด",
    href: "/settings/login-pin",
    icon: KeyRound,
    label: "ตั้งค่า PIN",
  },
  {
    description: "ตรวจสอบสุขภาพระบบ ความเร็วในการตอบสนอง และสถิติการใช้งานตารางฐานข้อมูล",
    href: "/settings/performance",
    icon: Gauge,
    label: "ประสิทธิภาพระบบ",
  },
] as const;

export default async function SettingsIndexPage() {
  await requireAppRole("admin");

  return (
    <SettingsShell
      title="ตั้งค่า"
      description="เลือกหมวดการตั้งค่าที่ต้องการจัดการต่อได้จากหน้านี้"
      floatingSubmit={false}
    >
      <div
        className="grid w-full min-w-0 max-w-full touch-pan-y grid-cols-[minmax(0,1fr)] gap-4 overflow-x-hidden overscroll-x-none md:grid-cols-2 lg:gap-5 xl:grid-cols-5"
        style={{ touchAction: "pan-y", overscrollBehaviorX: "none" }}
      >
        {options.map((option) => {
          const Icon = option.icon;

          return (
            <Link
              key={option.href}
              href={option.href}
              draggable={false}
              className="group min-w-0 max-w-full touch-pan-y select-none overflow-hidden overscroll-x-none rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_55px_rgba(15,23,42,0.04)] transition lg:hover:-translate-y-0.5 lg:hover:border-[#4A148C]/30 lg:hover:shadow-[0_24px_60px_rgba(4,53,106,0.08)] sm:p-6"
              style={{ touchAction: "pan-y", overscrollBehaviorX: "none" }}
            >
              <div className="flex items-center gap-4 sm:flex-col sm:items-start sm:gap-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#EA80FC]/30 text-[#4A148C]">
                  <Icon className="h-6 w-6" strokeWidth={2.2} />
                </div>
                <h2 className="min-w-0 break-words text-lg font-bold text-slate-950 sm:text-xl">{option.label}</h2>
              </div>

              <p className="mt-3 max-w-full break-words text-sm leading-7 text-slate-500 [overflow-wrap:anywhere] sm:mt-2">{option.description}</p>

              <span className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#4A148C] sm:mt-5">
                ไปยังหน้านี้
                <ArrowRight
                  className="h-4 w-4 transition lg:group-hover:translate-x-1"
                  strokeWidth={2.2}
                />
              </span>
            </Link>
          );
        })}
      </div>
    </SettingsShell>
  );
}
