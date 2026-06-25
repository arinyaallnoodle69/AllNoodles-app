import "server-only";

import writeExcelFile from "write-excel-file/node";
import type { SheetData } from "write-excel-file/node";
import { requireAppRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin();

  const [categoriesResult, suppliersResult] = await Promise.all([
    admin
      .from("product_categories")
      .select("name")
      .eq("organization_id", session.organizationId)
      .order("name", { ascending: true }),
    admin
      .from("suppliers")
      .select("supplier_code, name")
      .eq("organization_id", session.organizationId)
      .order("supplier_code", { ascending: true }),
  ]);

  const firstCategory = categoriesResult.data?.[0]?.name ?? "";
  const firstSupplier = suppliersResult.data?.[0]?.name ?? "";
  const rows: SheetData = [
    [
      { value: "SKU", fontWeight: "bold" },
      { value: "ชื่อสินค้า", fontWeight: "bold" },
      { value: "หน่วยหลัก", fontWeight: "bold" },
      { value: "ราคาทุน", fontWeight: "bold" },
      { value: "จำนวนสต็อก", fontWeight: "bold" },
      { value: "ประเภทสินค้า", fontWeight: "bold" },
      { value: "ผู้ขาย", fontWeight: "bold" },
      { value: "หมวดหมู่", fontWeight: "bold" },
      { value: "แบรนด์", fontWeight: "bold" },
      { value: "ชื่อในใบจัดของ", fontWeight: "bold" },
      { value: "คำอธิบาย", fontWeight: "bold" },
      { value: "สถานะ", fontWeight: "bold" },
      { value: "หน่วยขาย", fontWeight: "bold" },
      { value: "อัตราต่อหน่วยหลัก", fontWeight: "bold" },
      { value: "ขั้นต่ำ", fontWeight: "bold" },
      { value: "เพิ่มทีละ", fontWeight: "bold" },
      { value: "โหมดต้นทุนหน่วยขาย", fontWeight: "bold" },
      { value: "ต้นทุนหน่วยขาย", fontWeight: "bold" },
    ],
    [
      { value: "" },
      { value: "ตัวอย่างสินค้า" },
      { value: "kg" },
      { value: 50 },
      { value: 0 },
      { value: "ผลิตสด" },
      { value: firstSupplier },
      { value: firstCategory },
      { value: "" },
      { value: "" },
      { value: "" },
      { value: "พร้อมขาย" },
      { value: "kg" },
      { value: 1 },
      { value: 1 },
      { value: "" },
      { value: "derived" },
      { value: "" },
    ],
  ];

  const buffer = await writeExcelFile(rows, {
    columns: [
      { width: 14 },
      { width: 28 },
      { width: 12 },
      { width: 12 },
      { width: 14 },
      { width: 16 },
      { width: 24 },
      { width: 20 },
      { width: 18 },
      { width: 24 },
      { width: 28 },
      { width: 14 },
      { width: 12 },
      { width: 18 },
      { width: 12 },
      { width: 12 },
      { width: 20 },
      { width: 16 },
    ],
    sheet: "Products",
  }).toBuffer();
  const body = new Blob([new Uint8Array(buffer)]);

  return new Response(body, {
    headers: {
      "Content-Disposition": 'attachment; filename="all-noodles-product-import-template.xlsx"',
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}
