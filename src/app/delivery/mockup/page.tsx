import { DeliveryNoteLayout } from "@/components/print/delivery-note-layout";
import type { DeliveryNotePrintData } from "@/lib/delivery/print";

export const metadata = {
  title: "ตัวอย่างบิลส่งของ A4",
};

const mockProducts = [
  ["ANP001", "ผัดไท มหาชัย (ยาว) (แดง)", "kg", 5, 50],
  ["ANP002", "จิ๊บญวนสด ช้างคู่", "kg", 5, 50],
  ["ANP003", "วุ้นเส้น กิเลนใหญ่ 450กรัม", "kg", 5, 49],
  ["ANP004", "ผัดไท พระอาทิตย์ (แดง)", "kg", 5, 100],
  ["ANP005", "ผัดไท มิตรภาพ", "kg", 5, 100],
  ["ANP006", "เส้นเล็ก สด", "kg", 8, 38],
  ["ANP007", "เส้นหมี่ขาว สด", "kg", 8, 42],
  ["ANP008", "บะหมี่เหลือง สด", "kg", 6, 55],
  ["ANP009", "เส้นใหญ่ สด", "kg", 10, 35],
  ["ANP010", "เกี๊ยวแผ่น", "ห่อ", 12, 28],
  ["ANP011", "เส้นจันท์แห้ง", "ห่อ", 10, 45],
  ["ANP012", "วุ้นเส้นเล็ก", "ห่อ", 10, 32],
  ["ANP013", "หมี่กรอบ", "ห่อ", 7, 68],
  ["ANP014", "บะหมี่ไข่", "kg", 5, 60],
  ["ANP015", "เส้นเล็กแห้ง", "ห่อ", 10, 40],
  ["ANP016", "เส้นใหญ่แห้ง", "ห่อ", 9, 46],
  ["ANP017", "เส้นเล็ก รังนก", "kg", 5, 50],
  ["ANP018", "ขนมจีนสด", "kg", 12, 24],
  ["ANP019", "แผ่นเกี๊ยวทอด", "ห่อ", 6, 75],
  ["ANP020", "เส้นหมี่โคราช", "ห่อ", 8, 52],
  ["ANP021", "เส้นบะหมี่หยก", "kg", 4, 70],
  ["ANP022", "ก๋วยจั๊บญวน", "kg", 4, 65],
] satisfies Array<[string, string, string, number, number]>;

const mockItems: DeliveryNotePrintData["items"] = mockProducts.map(
  ([productSku, productName, saleUnitLabel, quantityDelivered, unitPrice], index) => ({
    id: `mock-item-${index + 1}`,
    lineNumber: index + 1,
    productSku,
    productName,
    quantityDelivered,
    saleUnitLabel,
    unitPrice,
    lineTotal: quantityDelivered * unitPrice,
    display_order: index + 1,
  }),
);

const mockDeliveryNote: DeliveryNotePrintData = {
  deliveryNumber: "DN2026060005",
  deliveryDate: "2026-06-10",
  orderNumber: "ON2026060009",
  warehouseName: "คลังหลัก",
  totalAmount: mockItems.reduce((sum, item) => sum + item.lineTotal, 0),
  notes: "-",
  organization: {
    name: "AllNoodles",
    logoUrl: "/brand/512x512.png",
    address: "-",
    phone: "099-356-4653",
  },
  customer: {
    code: "ANS001",
    name: "ร้านวันดี",
    address:
      "123/45 หมู่บ้านตัวอย่าง ถนนก๋วยเตี๋ยว แขวงตลาดใหม่ เขตเมือง กรุงเทพมหานคร 10200 จุดรับสินค้าอยู่หน้าร้านด้านซ้ายติดป้ายสีน้ำเงิน",
    vehicleId: "vehicle-bkk-1",
    vehicleName: "รถกรุงเทพ1",
  },
  items: mockItems,
};

export default function DeliveryMockupPage() {
  return (
    <main className="min-h-screen bg-neutral-200 py-6 print:bg-white print:py-0">
      <section className="mx-auto mb-6 w-[210mm] max-w-[calc(100vw-24px)] rounded border border-neutral-300 bg-white px-5 py-4 shadow-sm print:hidden">
        <p className="text-sm font-black text-neutral-600">ตัวอย่างระบบ</p>
        <h1 className="mt-1 text-2xl font-black text-neutral-950">ตัวอย่างบิลส่งของ A4 แนวตั้ง</h1>
        <p className="mt-2 text-base font-bold text-neutral-800">
          หน้านี้เป็น static mockup สำหรับตรวจ layout บนเว็บ รายการที่ 21 เป็นต้นไปจะขึ้นหน้า A4 ใหม่พร้อม header และ footer เหมือนหน้าแรก
        </p>
      </section>

      <DeliveryNoteLayout dns={[mockDeliveryNote]} />
    </main>
  );
}
