"use server";

import { revalidatePath } from "next/cache";
import { requireAppRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type WarehouseField = "name" | "slug" | "address";

export type WarehouseActionState = {
  fieldErrors: Partial<Record<WarehouseField, string>>;
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
