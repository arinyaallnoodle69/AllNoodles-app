"use server";

import { revalidatePath } from "next/cache";
import { readSheet } from "read-excel-file/node";
import { requireAppRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type WarehouseField = "name" | "slug" | "address";
type ProductWarehouseFulfillmentMode = "disabled" | "fresh" | "stock";

export type WarehouseActionState = {
  fieldErrors: Partial<Record<WarehouseField, string>>;
  message: string;
  status: "error" | "idle" | "success";
};

export type WarehouseProductModeImportState = {
  errors?: string[];
  message: string;
  status: "error" | "idle" | "success";
};

type AddressPayload = {
  addressDetails: string;
  addressLine: string;
  addressSummary: string;
  districtCode: string;
  districtName: string;
  postalCode: string;
  provinceCode: string;
  provinceName: string;
  subdistrictCode: string;
  subdistrictName: string;
};

function getTrimmedText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeImportKey(value: unknown) {
  return getTrimmedText(value).replace(/\s+/g, "").toLocaleLowerCase("th");
}

function excelRowsToRecords(sheetRows: unknown[][]) {
  const headers = (sheetRows[0] ?? []).map((header) => getTrimmedText(header));
  const records: Record<string, unknown>[] = [];

  for (const row of sheetRows.slice(1)) {
    const record: Record<string, unknown> = {};
    let hasValue = false;

    headers.forEach((header, index) => {
      if (!header) return;
      const value = getTrimmedText(row[index]);
      record[header] = value;
      if (value) hasValue = true;
    });

    if (hasValue) {
      records.push(record);
    }
  }

  return { headers, records };
}

function parseWarehouseProductMode(value: unknown): ProductWarehouseFulfillmentMode | null {
  const normalized = normalizeImportKey(value);
  if (!normalized) return null;

  if (["fresh", "produce", "made_to_order", "ผลิตสด", "สั่งผลิต", "ผลิต"].includes(normalized)) {
    return "fresh";
  }

  if (["disabled", "disable", "none", "no", "ไม่ใช้", "ไม่ใช้ในคลังนี้", "ปิด", "-"].includes(normalized)) {
    return "disabled";
  }

  if (["stock", "สต็อก", "สต๊อก", "ใช้สต็อก", "ใช้สต๊อก", "ใช้stock"].includes(normalized)) {
    return "stock";
  }

  return null;
}

function getWarehouseModeHeaderAliases(warehouse: { name: string; slug: string }) {
  const base = `${warehouse.name} (${warehouse.slug.toUpperCase()})`;
  return [
    warehouse.name,
    warehouse.slug,
    base,
    `${base} - โหมด`,
    `${base} โหมด`,
    `${warehouse.name} - โหมด`,
    `${warehouse.name} โหมด`,
    `โหมด ${warehouse.name}`,
  ].map(normalizeImportKey);
}

function getWarehouseSupplierHeaderAliases(warehouse: { name: string; slug: string }) {
  const base = `${warehouse.name} (${warehouse.slug.toUpperCase()})`;
  return [
    `${base} - โรงงาน`,
    `${base} โรงงาน`,
    `${warehouse.name} - โรงงาน`,
    `${warehouse.name} โรงงาน`,
    `โรงงาน ${warehouse.name}`,
    `${base} - ผู้ขาย`,
    `${warehouse.name} - ผู้ขาย`,
  ].map(normalizeImportKey);
}

function getAddressPayload(value: FormDataEntryValue | null): AddressPayload | null {
  const raw = getTrimmedText(value);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const record = parsed as Record<string, unknown>;

    return {
      addressDetails: getTrimmedText(record.addressDetails ?? ""),
      addressLine: getTrimmedText(record.addressLine ?? ""),
      addressSummary: getTrimmedText(record.addressSummary ?? ""),
      districtCode: getTrimmedText(record.districtCode ?? ""),
      districtName: getTrimmedText(record.districtName ?? ""),
      postalCode: getTrimmedText(record.postalCode ?? ""),
      provinceCode: getTrimmedText(record.provinceCode ?? ""),
      provinceName: getTrimmedText(record.provinceName ?? ""),
      subdistrictCode: getTrimmedText(record.subdistrictCode ?? ""),
      subdistrictName: getTrimmedText(record.subdistrictName ?? ""),
    };
  } catch {
    return null;
  }
}

function buildAddressMetadata(address: AddressPayload) {
  return {
    districtCode: address.districtCode,
    districtName: address.districtName,
    line1: address.addressLine,
    postalCode: address.postalCode,
    provinceCode: address.provinceCode,
    provinceName: address.provinceName,
    street: {
      details: address.addressDetails,
    },
    subdistrictCode: address.subdistrictCode,
    subdistrictName: address.subdistrictName,
  };
}

function getWarehousePayload(formData: FormData) {
  return {
    name: getTrimmedText(formData.get("name")),
    sortOrder: Number(formData.get("sortOrder") ?? 0),
    address: getAddressPayload(formData.get("addressPayload")),
  };
}

function validateWarehousePayload(payload: ReturnType<typeof getWarehousePayload>) {
  const fieldErrors: Partial<Record<WarehouseField, string>> = {};

  if (!payload.name) {
    fieldErrors.name = "กรอกชื่อคลังก่อนบันทึก";
  } else if (payload.name.length > 120) {
    fieldErrors.name = "ชื่อคลังต้องไม่เกิน 120 ตัวอักษร";
  }

  if (payload.address) {
    if (payload.address.postalCode && !/^\d{5}$/.test(payload.address.postalCode)) {
      fieldErrors.address = "รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก";
    }
  }

  return {
    fieldErrors,
    success: Object.keys(fieldErrors).length === 0,
  };
}

function getValidationErrorState(fieldErrors: Partial<Record<WarehouseField, string>>) {
  return {
    fieldErrors,
    message: "ยังบันทึกคลังไม่ได้ กรุณาตรวจสอบข้อมูลที่กรอก",
    status: "error" as const,
  };
}

function revalidateWarehousePaths() {
  revalidatePath("/settings");
  revalidatePath("/settings/warehouses");
  revalidatePath("/settings/customers");
  revalidatePath("/orders/incoming");
  revalidatePath("/orders/factory-order-sheet");
}

type WarehouseClient = {
  from(table: string): {
    delete(): { eq(col: string, val: string): { eq(col: string, val: string): Promise<{ error: { message?: string } | null }> } };
    insert(row: Record<string, unknown>): Promise<{ error: { code?: string; message?: string } | null }>;
    select(cols: string): {
      eq(col: string, val: string | boolean): WarehouseSelectChain;
    };
    update(row: Record<string, unknown>): {
      eq(col: string, val: string): { eq(col: string, val: string): Promise<{ error: { code?: string; message?: string } | null }> };
    };
  };
};

type WarehouseSelectChain = {
  eq(col: string, val: string | boolean): WarehouseSelectChain;
  maybeSingle(): Promise<{ data: { id: string; metadata?: unknown } | null; error: { message?: string } | null }>;
};

async function generateWarehouseSlug(organizationId: string): Promise<string | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("warehouses")
    .select("slug")
    .eq("organization_id", organizationId);

  if (error || !data) {
    return null;
  }

  const slugs = (data as { slug: string }[]).map((w) => w.slug);
  let maxNum = 0;
  for (const slug of slugs) {
    const match = /^wh(\d+)$/i.exec(slug.trim());
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }

  const nextNum = maxNum + 1;
  return `wh${String(nextNum).padStart(2, "0")}`;
}

export async function createWarehouseAction(
  _prevState: WarehouseActionState,
  formData: FormData,
 ): Promise<WarehouseActionState> {
  const session = await requireAppRole("admin");
  const payload = getWarehousePayload(formData);
  const validation = validateWarehousePayload(payload);

  if (!validation.success) {
    return getValidationErrorState(validation.fieldErrors);
  }

  const slug = await generateWarehouseSlug(session.organizationId);
  if (!slug) {
    return {
      fieldErrors: {},
      message: "ระบบไม่สามารถสร้างรหัสคลังสินค้าอัตโนมัติได้ กรุณาลองอีกครั้ง",
      status: "error",
    };
  }

  const admin = getSupabaseAdmin() as unknown as WarehouseClient;
  const { address } = payload;

  const { error } = await admin.from("warehouses").insert({
    name: payload.name,
    organization_id: session.organizationId,
    slug: slug,
    sort_order: payload.sortOrder,
    address: address ? address.addressSummary : null,
    subdistrict: address ? address.subdistrictName : null,
    district: address ? address.districtName : null,
    province: address ? address.provinceName : null,
    postal_code: address ? address.postalCode : null,
    metadata: address ? { address: buildAddressMetadata(address) } : {},
  });

  if (error) {
    console.error("Create warehouse DB error:", error);
    if (error.code === "23505") {
      return {
        fieldErrors: {
          slug: "รหัสคลังนี้ถูกใช้งานแล้ว กรุณาเปลี่ยนรหัส",
        },
        message: "บันทึกไม่สำเร็จ เพราะมีรหัสคลังนี้อยู่แล้ว",
        status: "error",
      };
    }

    return {
      fieldErrors: {},
      message: `ระบบบันทึกคลังไม่สำเร็จ: ${error.message || "กรุณาลองอีกครั้ง"}`,
      status: "error",
    };
  }

  revalidateWarehousePaths();

  return {
    fieldErrors: {},
    message: `บันทึกคลัง ${payload.name} (รหัส ${slug.toUpperCase()}) เรียบร้อยแล้ว`,
    status: "success",
  };
}

export async function updateWarehouseAction(
  warehouseId: string,
  _prevState: WarehouseActionState,
  formData: FormData,
): Promise<WarehouseActionState> {
  const session = await requireAppRole("admin");
  const payload = getWarehousePayload(formData);
  const validation = validateWarehousePayload(payload);

  if (!validation.success) {
    return getValidationErrorState(validation.fieldErrors);
  }

  const admin = getSupabaseAdmin() as unknown as WarehouseClient;
  const { data: warehouse, error: warehouseLookupError } = await admin
    .from("warehouses")
    .select("id, metadata")
    .eq("id", warehouseId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();

  if (warehouseLookupError || !warehouse) {
    return {
      fieldErrors: {},
      message: "ไม่พบคลังที่ต้องการแก้ไข",
      status: "error",
    };
  }

  const { address } = payload;
  const currentMetadata = warehouse.metadata && typeof warehouse.metadata === "object" ? warehouse.metadata : {};

  const { error } = await admin
    .from("warehouses")
    .update({
      name: payload.name,
      sort_order: payload.sortOrder,
      address: address ? address.addressSummary : null,
      subdistrict: address ? address.subdistrictName : null,
      district: address ? address.districtName : null,
      province: address ? address.provinceName : null,
      postal_code: address ? address.postalCode : null,
      metadata: {
        ...currentMetadata,
        ...(address ? { address: buildAddressMetadata(address) } : { address: null }),
      },
    })
    .eq("id", warehouseId)
    .eq("organization_id", session.organizationId);

  if (error) {
    console.error("Update warehouse DB error:", error);
    return {
      fieldErrors: {},
      message: `ระบบแก้ไขข้อมูลคลังไม่สำเร็จ: ${error.message || "กรุณาลองอีกครั้ง"}`,
      status: "error",
    };
  }

  revalidateWarehousePaths();

  return {
    fieldErrors: {},
    message: `อัปเดตคลัง ${payload.name} เรียบร้อยแล้ว`,
    status: "success",
  };
}

export async function toggleWarehouseAction(
  warehouseId: string,
  isActive: boolean,
): Promise<void | { error?: string }> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin() as unknown as WarehouseClient;

  const { error } = await admin
    .from("warehouses")
    .update({
      is_active: isActive,
    })
    .eq("id", warehouseId)
    .eq("organization_id", session.organizationId);

  if (error) {
    return { error: "เปลี่ยนสถานะคลังไม่สำเร็จ กรุณาลองอีกครั้ง" };
  }

  revalidateWarehousePaths();
}

export async function deleteWarehouseAction(warehouseId: string): Promise<{ error?: string } | void> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin();

  const { data: warehouse, error: lookupError } = await admin
    .from("warehouses")
    .select("slug, name")
    .eq("id", warehouseId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();

  if (lookupError || !warehouse) {
    return { error: "ไม่พบคลังที่ต้องการลบ" };
  }

  if (warehouse.slug === "main") {
    return { error: "ไม่สามารถลบคลังหลักของระบบได้" };
  }

  const { data: stocks, error: stockError } = await admin
    .from("product_warehouse_stocks")
    .select("stock_quantity, reserved_quantity")
    .eq("warehouse_id", warehouseId);

  if (!stockError && stocks) {
    const hasActiveStock = stocks.some(
      (s: { stock_quantity: number | string | null; reserved_quantity: number | string | null }) => Number(s.stock_quantity) !== 0 || Number(s.reserved_quantity) !== 0
    );
    if (hasActiveStock) {
      return { error: "ไม่สามารถลบคลังนี้ได้ เนื่องจากยังมีสินค้าคงเหลือในคลังนี้ (กรุณาปรับสต็อกเป็น 0 ก่อนลบ)" };
    }
  }

  await admin.from("product_warehouse_stocks").delete().eq("warehouse_id", warehouseId);

  const { error } = await admin
    .from("warehouses")
    .delete()
    .eq("id", warehouseId)
    .eq("organization_id", session.organizationId);

  if (error) {
    console.error("Delete warehouse failed:", error);
    if (error.code === "23503") {
      return { error: "ไม่สามารถลบคลังนี้ได้ เนื่องจากถูกอ้างอิงอยู่ในประวัติสต็อก, รายการซื้อขาย หรือข้อมูลร้านค้า (แนะนำให้ใช้การ 'ปิดใช้งาน' แทน)" };
    }
    return { error: "เกิดข้อผิดพลาดในการลบคลังสินค้า กรุณาลองใหม่อีกครั้ง" };
  }

  revalidateWarehousePaths();
}

export async function updateWarehouseProductFulfillmentModesAction(
  warehouseId: string,
  formData: FormData,
): Promise<void> {
  const session = await requireAppRole("admin");
  const productIds = formData.getAll("productId").map((value) => getTrimmedText(value));
  const modes = formData.getAll("mode").map((value) => getTrimmedText(value));
  const supplierIds = formData.getAll("supplierId").map((value) => getTrimmedText(value));
  const admin = getSupabaseAdmin();

  const { data: warehouse, error: warehouseError } = await admin
    .from("warehouses")
    .select("id")
    .eq("id", warehouseId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();

  if (warehouseError || !warehouse) {
    console.error("Update warehouse product fulfillment modes failed: warehouse not found", warehouseError);
    return;
  }

  const rows = productIds
    .map((productId, index) => {
      const mode = modes[index] as ProductWarehouseFulfillmentMode;
      if (!productId || !["disabled", "fresh", "stock"].includes(mode)) {
        return null;
      }
      const supplierId = supplierIds[index] || null;

      return {
        mode,
        organization_id: session.organizationId,
        product_id: productId,
        supplier_id: mode === "fresh" ? supplierId : null,
        warehouse_id: warehouseId,
      };
    })
    .filter(Boolean) as Array<{
      mode: ProductWarehouseFulfillmentMode;
      organization_id: string;
      product_id: string;
      supplier_id: string | null;
      warehouse_id: string;
    }>;

  if (rows.length === 0) {
    return;
  }

  const warehouseProductModesTable = (admin as unknown as {
    from(table: "product_warehouse_fulfillment_modes"): {
      upsert(
        rows: Array<{
          mode: ProductWarehouseFulfillmentMode;
          organization_id: string;
          product_id: string;
          supplier_id: string | null;
          warehouse_id: string;
        }>,
        options: { onConflict: string },
      ): Promise<{ error: { message?: string } | null }>;
    };
  }).from("product_warehouse_fulfillment_modes");

  const { error } = await warehouseProductModesTable
    .upsert(rows, {
      onConflict: "organization_id,product_id,warehouse_id",
    });

  if (error) {
    console.error("Update warehouse product fulfillment modes failed:", error);
    return;
  }

  revalidateWarehousePaths();
}

export async function importWarehouseProductModesAction(
  _prevState: WarehouseProductModeImportState,
  formData: FormData,
): Promise<WarehouseProductModeImportState> {
  const session = await requireAppRole("admin");
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return {
      errors: ["เลือกไฟล์ Excel ก่อนนำเข้า"],
      message: "ยังนำเข้าข้อมูลไม่ได้",
      status: "error",
    };
  }

  let rows: ReturnType<typeof excelRowsToRecords>;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const sheetRows = await readSheet(buffer);
    rows = excelRowsToRecords(sheetRows as unknown[][]);
  } catch (error) {
    console.error("[importWarehouseProductModesAction:read]", error);
    return {
      errors: ["อ่านไฟล์ Excel ไม่สำเร็จ กรุณาใช้ไฟล์ template ของระบบ"],
      message: "นำเข้าไฟล์ไม่สำเร็จ",
      status: "error",
    };
  }

  if (rows.records.length === 0) {
    return {
      errors: ["ไม่พบข้อมูลสินค้าในไฟล์"],
      message: "ไฟล์ไม่มีข้อมูลสำหรับนำเข้า",
      status: "error",
    };
  }

  const admin = getSupabaseAdmin();
  const [productsResult, warehousesResult, suppliersResult] = await Promise.all([
    admin
      .from("products")
      .select("id, sku, name, metadata")
      .eq("organization_id", session.organizationId)
      .eq("is_active", true),
    admin
      .from("warehouses")
      .select("id, name, slug")
      .eq("organization_id", session.organizationId)
      .eq("is_active", true),
    admin
      .from("suppliers")
      .select("id, supplier_code, name")
      .eq("organization_id", session.organizationId)
      .order("supplier_code", { ascending: true }),
  ]);

  if (productsResult.error || warehousesResult.error || suppliersResult.error) {
    return {
      errors: ["โหลดข้อมูลสินค้า/คลัง/โรงงานไม่สำเร็จ"],
      message: "นำเข้าไฟล์ไม่สำเร็จ",
      status: "error",
    };
  }

  const productsBySku = new Map<string, { id: string; sku: string }>();
  for (const product of (productsResult.data ?? []) as Array<{ id: string; sku: string; metadata: Record<string, unknown> | null }>) {
    if (product.metadata?.deleted) continue;
    productsBySku.set(normalizeImportKey(product.sku), { id: product.id, sku: product.sku });
  }

  const warehouses = (warehousesResult.data ?? []) as Array<{ id: string; name: string; slug: string }>;
  const suppliersByKey = new Map<string, { id: string; name: string; supplier_code: string }>();
  for (const supplier of (suppliersResult.data ?? []) as Array<{ id: string; name: string; supplier_code: string }>) {
    suppliersByKey.set(normalizeImportKey(supplier.name), supplier);
    suppliersByKey.set(normalizeImportKey(supplier.supplier_code), supplier);
    suppliersByKey.set(normalizeImportKey(`${supplier.name} (${supplier.supplier_code})`), supplier);
  }

  const skuHeaders = ["SKU", "รหัสสินค้า", "sku"].map(normalizeImportKey);
  const skuHeader = rows.headers.find((header) => skuHeaders.includes(normalizeImportKey(header)));
  if (!skuHeader) {
    return {
      errors: ["ไม่พบคอลัมน์ SKU หรือ รหัสสินค้า"],
      message: "รูปแบบไฟล์ไม่ถูกต้อง",
      status: "error",
    };
  }

  const warehouseHeaders = warehouses
    .map((warehouse) => {
      const modeHeader = rows.headers.find((header) => getWarehouseModeHeaderAliases(warehouse).includes(normalizeImportKey(header))) ?? null;
      const supplierHeader = rows.headers.find((header) => getWarehouseSupplierHeaderAliases(warehouse).includes(normalizeImportKey(header))) ?? null;
      return { modeHeader, supplierHeader, warehouse };
    })
    .filter((item): item is { modeHeader: string; supplierHeader: string | null; warehouse: { id: string; name: string; slug: string } } => item.modeHeader !== null);

  if (warehouseHeaders.length === 0) {
    return {
      errors: ["ไม่พบคอลัมน์คลังในไฟล์ template"],
      message: "รูปแบบไฟล์ไม่ถูกต้อง",
      status: "error",
    };
  }

  const errors: string[] = [];
  const upsertRows: Array<{
    mode: ProductWarehouseFulfillmentMode;
    organization_id: string;
    product_id: string;
    supplier_id: string | null;
    warehouse_id: string;
  }> = [];

  rows.records.forEach((row, index) => {
    const rowNumber = index + 2;
    const sku = getTrimmedText(row[skuHeader]);
    const product = productsBySku.get(normalizeImportKey(sku));

    if (!product) {
      errors.push(`แถว ${rowNumber}: ไม่พบสินค้า SKU "${sku}"`);
      return;
    }

    for (const { modeHeader, supplierHeader, warehouse } of warehouseHeaders) {
      const rawMode = getTrimmedText(row[modeHeader]);
      if (!rawMode) continue;

      const mode = parseWarehouseProductMode(rawMode);
      if (!mode) {
        errors.push(`แถว ${rowNumber}: ค่า "${rawMode}" ในคอลัมน์ ${modeHeader} ไม่ถูกต้อง`);
        continue;
      }
      const rawSupplier = supplierHeader ? getTrimmedText(row[supplierHeader]) : "";
      const supplier = rawSupplier ? suppliersByKey.get(normalizeImportKey(rawSupplier)) ?? null : null;

      if (mode === "fresh" && !supplier) {
        errors.push(`แถว ${rowNumber}: ${warehouse.name} ตั้งเป็นผลิตสด ต้องระบุโรงงานให้ถูกต้อง`);
        continue;
      }

      if (mode !== "fresh" && rawSupplier && !supplier) {
        errors.push(`แถว ${rowNumber}: ไม่พบโรงงาน "${rawSupplier}" ในคอลัมน์ ${supplierHeader}`);
        continue;
      }

      upsertRows.push({
        mode,
        organization_id: session.organizationId,
        product_id: product.id,
        supplier_id: mode === "fresh" ? supplier?.id ?? null : null,
        warehouse_id: warehouse.id,
      });
    }
  });

  if (errors.length > 0) {
    return {
      errors: errors.slice(0, 30),
      message: `พบข้อผิดพลาด ${errors.length.toLocaleString("th-TH")} รายการ กรุณาแก้ไฟล์แล้วนำเข้าใหม่`,
      status: "error",
    };
  }

  if (upsertRows.length === 0) {
    return {
      errors: ["ไม่พบช่องโหมดสินค้าที่ต้องบันทึก"],
      message: "ไม่มีข้อมูลสำหรับบันทึก",
      status: "error",
    };
  }

  const warehouseProductModesTable = (admin as unknown as {
    from(table: "product_warehouse_fulfillment_modes"): {
      upsert(
        rows: Array<{
          mode: ProductWarehouseFulfillmentMode;
          organization_id: string;
          product_id: string;
          supplier_id: string | null;
          warehouse_id: string;
        }>,
        options: { onConflict: string },
      ): Promise<{ error: { message?: string } | null }>;
    };
  }).from("product_warehouse_fulfillment_modes");

  const { error } = await warehouseProductModesTable.upsert(upsertRows, {
    onConflict: "organization_id,product_id,warehouse_id",
  });

  if (error) {
    console.error("[importWarehouseProductModesAction:upsert]", error);
    return {
      errors: ["บันทึกข้อมูลลงฐานข้อมูลไม่สำเร็จ"],
      message: "นำเข้าไฟล์ไม่สำเร็จ",
      status: "error",
    };
  }

  revalidateWarehousePaths();

  return {
    message: `นำเข้าโหมดสินค้าในคลังสำเร็จ ${upsertRows.length.toLocaleString("th-TH")} รายการ`,
    status: "success",
  };
}
