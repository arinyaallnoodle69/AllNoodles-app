"use server";

import { revalidatePath, revalidateTag, updateTag } from "next/cache";
import { requireAppRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveGeography } from "@/lib/settings/geography-resolver";

type CreateCustomerField = "address" | "customerCode" | "defaultVehicleId" | "defaultWarehouseId" | "name";

export type CreateCustomerActionState = {
  fieldErrors: Partial<Record<CreateCustomerField, string>>;
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

type ImportCustomersActionState = {
  errors?: string[];
  message: string;
  status: "idle" | "success" | "error";
} | null;

type CustomerImportInsert = {
  address: string;
  customer_code: string;
  default_warehouse_id: string;
  default_vehicle_id: string | null;
  district: string | null;
  metadata: {
    address: ReturnType<typeof buildAddressMetadata>;
  };
  name: string;
  organization_id: string;
  postal_code: string | null;
  province: string | null;
  sort_order?: number;
  subdistrict: string | null;
};

function getTrimmedText(value: unknown) {
  return String(value ?? "").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function revalidateCustomerSettings(organizationId: string) {
  updateTag(`settings-${organizationId}`);
  revalidatePath("/settings");
  revalidatePath("/settings/customers");
  revalidatePath("/settings/customers/pricing");
  revalidatePath("/settings/customer-data");
  revalidatePath("/delivery");
  revalidatePath("/orders");
  revalidateTag(`settings-${organizationId}`, "max");
}

function getNextCustomerCode(codes: string[]) {
  const maxSequence = codes.reduce((max, code) => {
    const match = /^ANS(\d+)$/i.exec(code.trim());

    if (!match) {
      return max;
    }

    const sequence = Number.parseInt(match[1], 10);
    return Number.isFinite(sequence) ? Math.max(max, sequence) : max;
  }, 0);

  return `ANS${String(maxSequence + 1).padStart(3, "0")}`;
}

async function generateCustomerCode(organizationId: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("customers")
    .select("customer_code")
    .eq("organization_id", organizationId);

  if (error) {
    return null;
  }

  return getNextCustomerCode((data ?? []).map((customer) => customer.customer_code ?? ""));
}

async function getNextCustomerSortOrder(organizationId: string) {
  const admin = getSupabaseAdmin();
  const { data } = await (admin as unknown as {
    from(table: "customers"): {
      select(columns: string): {
        eq(column: string, value: string): {
          order(column: string, options: { ascending: boolean }): {
            limit(count: number): Promise<{ data: Array<{ sort_order: number | null }> | null }>;
          };
        };
      };
    };
  })
    .from("customers")
    .select("sort_order")
    .eq("organization_id", organizationId)
    .order("sort_order", { ascending: false })
    .limit(1);

  return Number(data?.[0]?.sort_order ?? -1) + 1;
}

function getAddressPayload(value: FormDataEntryValue | null): AddressPayload | null {
  const raw = getTrimmedText(value);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!isRecord(parsed)) {
      return null;
    }

    return {
      addressDetails: getTrimmedText(parsed.addressDetails ?? ""),
      addressLine: getTrimmedText(parsed.addressLine ?? ""),
      addressSummary: getTrimmedText(parsed.addressSummary ?? ""),
      districtCode: getTrimmedText(parsed.districtCode ?? ""),
      districtName: getTrimmedText(parsed.districtName ?? ""),
      postalCode: getTrimmedText(parsed.postalCode ?? ""),
      provinceCode: getTrimmedText(parsed.provinceCode ?? ""),
      provinceName: getTrimmedText(parsed.provinceName ?? ""),
      subdistrictCode: getTrimmedText(parsed.subdistrictCode ?? ""),
      subdistrictName: getTrimmedText(parsed.subdistrictName ?? ""),
    };
  } catch {
    return null;
  }
}

function validateCustomerForm(formData: FormData) {
  const defaultVehicleId = getTrimmedText(formData.get("defaultVehicleId"));
  const defaultWarehouseId = getTrimmedText(formData.get("defaultWarehouseId"));
  const name = getTrimmedText(formData.get("name"));
  const address = getAddressPayload(formData.get("addressPayload"));
  const fieldErrors: Partial<Record<CreateCustomerField, string>> = {};

  if (!name) {
    fieldErrors.name = "กรอกชื่อร้านค้าก่อนบันทึก";
  } else if (name.length > 120) {
    fieldErrors.name = "ชื่อร้านค้าต้องไม่เกิน 120 ตัวอักษร";
  }

  if (!defaultWarehouseId) {
    fieldErrors.defaultWarehouseId = "กรุณาเลือกคลังประจำร้านก่อนบันทึก";
  }

  if (!address) {
    fieldErrors.address = "ข้อมูลที่อยู่ไม่สมบูรณ์ ลองกรอกใหม่อีกครั้ง";
  } else {
    if (address.addressLine && address.addressLine.length < 1) {
      fieldErrors.address = "กรอกรายละเอียดที่อยู่ร้านค้า";
    }

    if (address.postalCode && !/^\d{5}$/.test(address.postalCode)) {
      fieldErrors.address = "รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก";
    }
  }

  return {
    address,
    defaultVehicleId: defaultVehicleId || null,
    defaultWarehouseId: defaultWarehouseId || null,
    fieldErrors,
    name,
    success: Object.keys(fieldErrors).length === 0,
  };
}

export async function createCustomerAction(
  _prevState: CreateCustomerActionState,
  formData: FormData,
): Promise<CreateCustomerActionState> {
  const session = await requireAppRole("admin");
  const validation = validateCustomerForm(formData);

  if (!validation.success || !validation.address) {
    return {
      fieldErrors: validation.fieldErrors,
      message: "ยังบันทึกร้านค้าไม่ได้ กรุณาตรวจสอบข้อมูลที่กรอก",
      status: "error",
    };
  }

  const admin = getSupabaseAdmin();
  const { address, defaultVehicleId, defaultWarehouseId, name } = validation;
  const customerCode = await generateCustomerCode(session.organizationId);
  const nextSortOrder = await getNextCustomerSortOrder(session.organizationId);

  if (!customerCode) {
    return {
      fieldErrors: {},
      message: "ระบบยังสร้างรหัสร้านค้าอัตโนมัติไม่สำเร็จ กรุณาลองอีกครั้ง",
      status: "error",
    };
  }

  if (defaultVehicleId) {
    const { data: vehicle, error: vehicleError } = await admin
      .from("vehicles")
      .select("id")
      .eq("organization_id", session.organizationId)
      .eq("id", defaultVehicleId)
      .eq("is_active", true)
      .maybeSingle();

    if (vehicleError || !vehicle) {
      return {
        fieldErrors: {
          defaultVehicleId: "เลือกรถประจำร้านใหม่อีกครั้ง",
        },
        message: "ยังบันทึกร้านค้าไม่ได้ เพราะไม่พบรถที่เลือกไว้",
        status: "error",
      };
    }
  }

  if (defaultWarehouseId) {
    const { data: warehouse, error: warehouseError } = await (admin as unknown as {
      from(table: "warehouses"): {
        select(columns: string): {
          eq(column: string, value: boolean | string): {
            eq(column: string, value: boolean | string): {
              eq(column: string, value: boolean | string): {
                maybeSingle(): Promise<{ data: { id: string } | null; error: { message?: string } | null }>;
              };
            };
          };
        };
      };
    })
      .from("warehouses")
      .select("id")
      .eq("organization_id", session.organizationId)
      .eq("id", defaultWarehouseId)
      .eq("is_active", true)
      .maybeSingle();

    if (warehouseError || !warehouse) {
      return {
        fieldErrors: {
          defaultWarehouseId: "เลือกคลังประจำร้านใหม่อีกครั้ง",
        },
        message: "ยังบันทึกร้านค้าไม่ได้ เพราะไม่พบคลังที่เลือกไว้",
        status: "error",
      };
    }
  }

  const { error } = await (admin as unknown as {
    from(table: "customers"): {
      insert(values: Record<string, unknown>): Promise<{ error: { code?: string; message?: string } | null }>;
    };
  }).from("customers").insert({
    address: address.addressSummary,
    customer_code: customerCode,
    default_warehouse_id: defaultWarehouseId,
    default_vehicle_id: defaultVehicleId,
    district: address.districtName || null,
    metadata: {
      address: buildAddressMetadata(address),
    },
    name,
    organization_id: session.organizationId,
    postal_code: address.postalCode || null,
    province: address.provinceName || null,
    sort_order: nextSortOrder,
    subdistrict: address.subdistrictName || null,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        fieldErrors: {
          customerCode: "รหัสร้านค้านี้ถูกใช้งานแล้ว",
        },
        message: "บันทึกไม่สำเร็จ เพราะมีรหัสร้านค้านี้อยู่แล้ว",
        status: "error",
      };
    }

    return {
      fieldErrors: {},
      message: "ระบบบันทึกร้านค้าไม่สำเร็จ กรุณาลองอีกครั้ง",
      status: "error",
    };
  }

  revalidateCustomerSettings(session.organizationId);
  revalidatePath("/settings/vehicles");

  return {
    fieldErrors: {},
    message: `บันทึกร้านค้า ${name} เรียบร้อยแล้ว`,
    status: "success",
  };
}

export async function updateCustomerAction(
  customerId: string,
  _prevState: CreateCustomerActionState,
  formData: FormData,
): Promise<CreateCustomerActionState> {
  const session = await requireAppRole("admin");
  const validation = validateCustomerForm(formData);

  if (!validation.success || !validation.address) {
    return {
      fieldErrors: validation.fieldErrors,
      message: "ยังบันทึกการแก้ไขร้านค้าไม่ได้ กรุณาตรวจสอบข้อมูลที่กรอก",
      status: "error",
    };
  }

  const admin = getSupabaseAdmin();
  const { address, defaultVehicleId, defaultWarehouseId, name } = validation;

  const { data: customer, error: customerLookupError } = await admin
    .from("customers")
    .select("id, metadata")
    .eq("id", customerId)
    .eq("organization_id", session.organizationId)
    .eq("is_active", true)
    .maybeSingle();

  if (customerLookupError || !customer) {
    return {
      fieldErrors: {},
      message: "ไม่พบร้านค้าที่ต้องการแก้ไข",
      status: "error",
    };
  }

  if (defaultVehicleId) {
    const { data: vehicle, error: vehicleError } = await admin
      .from("vehicles")
      .select("id")
      .eq("organization_id", session.organizationId)
      .eq("id", defaultVehicleId)
      .eq("is_active", true)
      .maybeSingle();

    if (vehicleError || !vehicle) {
      return {
        fieldErrors: {
          defaultVehicleId: "เลือกรถประจำร้านใหม่อีกครั้ง",
        },
        message: "ยังบันทึกการแก้ไขร้านค้าไม่ได้ เพราะไม่พบรถที่เลือกไว้",
        status: "error",
      };
    }
  }

  if (defaultWarehouseId) {
    const { data: warehouse, error: warehouseError } = await (admin as unknown as {
      from(table: "warehouses"): {
        select(columns: string): {
          eq(column: string, value: boolean | string): {
            eq(column: string, value: boolean | string): {
              eq(column: string, value: boolean | string): {
                maybeSingle(): Promise<{ data: { id: string } | null; error: { message?: string } | null }>;
              };
            };
          };
        };
      };
    })
      .from("warehouses")
      .select("id")
      .eq("organization_id", session.organizationId)
      .eq("id", defaultWarehouseId)
      .eq("is_active", true)
      .maybeSingle();

    if (warehouseError || !warehouse) {
      return {
        fieldErrors: {
          defaultWarehouseId: "เลือกคลังประจำร้านใหม่อีกครั้ง",
        },
        message: "ยังบันทึกการแก้ไขร้านค้าไม่ได้ เพราะไม่พบคลังที่เลือกไว้",
        status: "error",
      };
    }
  }

  const currentMetadata = isRecord(customer.metadata) ? customer.metadata : {};
  const { error } = await admin
    .from("customers")
    .update({
      address: address.addressSummary,
      default_warehouse_id: defaultWarehouseId,
      default_vehicle_id: defaultVehicleId,
      district: address.districtName || null,
      metadata: {
        ...currentMetadata,
        address: buildAddressMetadata(address),
      },
      name,
      postal_code: address.postalCode || null,
      province: address.provinceName || null,
      subdistrict: address.subdistrictName || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", customerId)
    .eq("organization_id", session.organizationId);

  if (error) {
    return {
      fieldErrors: {},
      message: "ระบบบันทึกการแก้ไขร้านค้าไม่สำเร็จ กรุณาลองอีกครั้ง",
      status: "error",
    };
  }

  revalidateCustomerSettings(session.organizationId);

  return {
    fieldErrors: {},
    message: `บันทึกการแก้ไข ${name} เรียบร้อยแล้ว`,
    status: "success",
  };
}

export async function updateCustomerDefaultVehicleAction(
  customerId: string,
  defaultVehicleId: string | null,
): Promise<{ error?: string }> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin();

  const { data: customer, error: customerLookupError } = await admin
    .from("customers")
    .select("id")
    .eq("id", customerId)
    .eq("organization_id", session.organizationId)
    .eq("is_active", true)
    .maybeSingle();

  if (customerLookupError || !customer) {
    return { error: "ไม่พบร้านค้าที่ต้องการอัปเดต" };
  }

  if (defaultVehicleId) {
    const { data: vehicle, error: vehicleLookupError } = await admin
      .from("vehicles")
      .select("id")
      .eq("id", defaultVehicleId)
      .eq("organization_id", session.organizationId)
      .eq("is_active", true)
      .maybeSingle();

    if (vehicleLookupError || !vehicle) {
      return { error: "ไม่พบรถที่เลือก กรุณาลองเลือกใหม่อีกครั้ง" };
    }
  }

  const { error: updateError } = await admin
    .from("customers")
    .update({
      default_vehicle_id: defaultVehicleId,
    })
    .eq("id", customerId)
    .eq("organization_id", session.organizationId);

  if (updateError) {
    return { error: "อัปเดตรถประจำร้านไม่สำเร็จ กรุณาลองอีกครั้ง" };
  }

  revalidateCustomerSettings(session.organizationId);
  revalidatePath("/settings/vehicles");

  return {};
}

export async function updateCustomerOrderAction(customerIds: string[]): Promise<{ error?: string }> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin();
  const uniqueCustomerIds = [...new Set(customerIds.map((id) => id.trim()).filter(Boolean))];

  if (uniqueCustomerIds.length === 0) {
    return { error: "ไม่พบรายการร้านค้าที่ต้องการจัดเรียง" };
  }

  const { data: customers, error: lookupError } = await admin
    .from("customers")
    .select("id")
    .eq("organization_id", session.organizationId)
    .eq("is_active", true)
    .in("id", uniqueCustomerIds);

  if (lookupError || (customers ?? []).length !== uniqueCustomerIds.length) {
    return { error: "รายการร้านค้าไม่ถูกต้อง กรุณารีเฟรชหน้าแล้วลองใหม่" };
  }

  const customersTable = admin.from("customers") as unknown as {
    update(values: { sort_order: number }): {
      eq(column: string, value: string): {
        eq(column: string, value: string): Promise<{ error: { message?: string } | null }>;
      };
    };
  };

  const updates = uniqueCustomerIds.map((id, index) =>
    customersTable
      .update({ sort_order: index })
      .eq("organization_id", session.organizationId)
      .eq("id", id),
  );

  const results = await Promise.all(updates);
  if (results.some((result) => result.error)) {
    return { error: "บันทึกลำดับร้านค้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
  }

  revalidateCustomerSettings(session.organizationId);
  return {};
}

export async function deleteCustomerAction(customerId: string): Promise<{ error?: string }> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin();

  // Verify the customer belongs to this org before deleting
  const { data: customer, error: fetchError } = await admin
    .from("customers")
    .select("id, name")
    .eq("id", customerId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();

  if (fetchError || !customer) {
    return { error: "ไม่พบร้านค้าที่ต้องการลบ" };
  }

  const { error } = await admin
    .from("customers")
    .update({ is_active: false })
    .eq("id", customerId)
    .eq("organization_id", session.organizationId);

  if (error) {
    return { error: "ลบร้านค้าไม่สำเร็จ กรุณาลองอีกครั้ง" };
  }

  revalidateCustomerSettings(session.organizationId);

  return {};
}

export async function updateCustomerDefaultWarehouseAction(
  customerId: string,
  defaultWarehouseId: string | null,
): Promise<{ error?: string }> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin();

  const { data: customer, error: customerLookupError } = await admin
    .from("customers")
    .select("id")
    .eq("id", customerId)
    .eq("organization_id", session.organizationId)
    .eq("is_active", true)
    .maybeSingle();

  if (customerLookupError || !customer) {
    return { error: "ไม่พบร้านค้าที่ต้องการอัปเดต" };
  }

  if (defaultWarehouseId) {
    const { data: warehouse, error: warehouseLookupError } = await admin
      .from("warehouses")
      .select("id")
      .eq("id", defaultWarehouseId)
      .eq("organization_id", session.organizationId)
      .eq("is_active", true)
      .maybeSingle();

    if (warehouseLookupError || !warehouse) {
      return { error: "ไม่พบคลังสินค้าที่เลือก กรุณาลองเลือกใหม่อีกครั้ง" };
    }
  }

  const { error: updateError } = await admin
    .from("customers")
    .update({
      default_warehouse_id: defaultWarehouseId,
    })
    .eq("id", customerId)
    .eq("organization_id", session.organizationId);

  if (updateError) {
    return { error: "อัปเดตคลังประจำร้านไม่สำเร็จ กรุณาลองอีกครั้ง" };
  }

  revalidateCustomerSettings(session.organizationId);
  revalidatePath("/settings/warehouses");

  return {};
}

export async function importCustomersAction(
  _prevState: ImportCustomersActionState,
  formData: FormData
): Promise<{ status: "success" | "error"; message: string; errors?: string[] }> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin();

  const file = formData.get("file") as File;
  if (!file || file.size === 0) {
    return {
      status: "error",
      message: "ไม่พบไฟล์ที่เลือก หรือไฟล์มีขนาดว่างเปล่า",
    };
  }

  const text = await file.text();
  const rows = parseCSV(text);

  if (rows.length <= 1) {
    return {
      status: "error",
      message: "ไม่พบข้อมูลในไฟล์นำเข้า (กรุณากรอกข้อมูลตามเทมเพลต)",
    };
  }

  // Fetch active warehouses and vehicles for name lookup
  const [warehousesResult, vehiclesResult] = await Promise.all([
    admin
      .from("warehouses")
      .select("id, name, slug")
      .eq("organization_id", session.organizationId)
      .eq("is_active", true),
    admin
      .from("vehicles")
      .select("id, name, license_plate")
      .eq("organization_id", session.organizationId)
      .eq("is_active", true),
  ]);

  if (warehousesResult.error || vehiclesResult.error) {
    return {
      status: "error",
      message: "ไม่สามารถดึงข้อมูลคลังสินค้าหรือรถส่งสินค้าในระบบเพื่อตรวจสอบความถูกต้องได้",
    };
  }

  const activeWarehouses = (warehousesResult.data || []) as { id: string; name: string; slug: string }[];
  const activeVehicles = (vehiclesResult.data || []) as { id: string; name: string; license_plate: string | null }[];

  // Get sequential customer code generator ready
  const { data: customerCodesData } = await admin
    .from("customers")
    .select("customer_code")
    .eq("organization_id", session.organizationId);

  const existingCodes = (customerCodesData ?? []).map((c) => c.customer_code ?? "");
  let maxSequence = existingCodes.reduce((max, code) => {
    const match = /^ANS(\d+)$/i.exec(code.trim());
    if (!match) return max;
    const seq = Number.parseInt(match[1], 10);
    return Number.isFinite(seq) ? Math.max(max, seq) : max;
  }, 0);

  function getNextSequentialCode() {
    maxSequence++;
    return `ANS${String(maxSequence).padStart(3, "0")}`;
  }

  const importErrors: string[] = [];
  const customersToInsert: CustomerImportInsert[] = [];
  const firstImportedSortOrder = await getNextCustomerSortOrder(session.organizationId);

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 0 || (row.length === 1 && !row[0])) {
      continue; // skip empty rows
    }

    const name = row[0]?.trim();
    const warehouseInput = row[1]?.trim();
    const vehicleInput = row[2]?.trim();
    const addressDetails = row[3]?.trim();
    const subdistrict = row[4]?.trim() || "";
    const district = row[5]?.trim() || "";
    const province = row[6]?.trim() || "";
    const postalCodeInput = row[7]?.trim() || "";

    const rowNum = i + 1;

    // Check if it's just a completely blank row (Excel sometimes outputs extra empty commas)
    if (!name && !warehouseInput && !addressDetails && !subdistrict && !district && !province) {
      continue;
    }

    if (!name) {
      importErrors.push(`แถวที่ ${rowNum}: ไม่มีชื่อร้านค้า`);
      continue;
    }

    if (!warehouseInput) {
      importErrors.push(`แถวที่ ${rowNum}: ไม่มีระบุคลังสินค้าหลัก`);
      continue;
    }



    // Lookup warehouse
    const warehouse = activeWarehouses.find(
      (w) =>
        w.name.toLowerCase() === warehouseInput.toLowerCase() ||
        w.slug.toLowerCase() === warehouseInput.toLowerCase() ||
        w.id === warehouseInput
    );

    if (!warehouse) {
      importErrors.push(`แถวที่ ${rowNum}: คลังสินค้า "${warehouseInput}" ไม่มีอยู่ในระบบ หรือปิดใช้งานอยู่`);
      continue;
    }

    // Lookup vehicle
    let defaultVehicleId: string | null = null;
    if (vehicleInput) {
      const vehicle = activeVehicles.find(
        (v) =>
          v.name.toLowerCase() === vehicleInput.toLowerCase() ||
          v.license_plate?.toLowerCase() === vehicleInput.toLowerCase() ||
          v.id === vehicleInput
      );
      if (vehicle) {
        defaultVehicleId = vehicle.id;
      } else {
        importErrors.push(`แถวที่ ${rowNum}: รถส่งสินค้า "${vehicleInput}" ไม่มีอยู่ในระบบ หรือปิดใช้งานอยู่`);
        continue;
      }
    }

    // Resolve geography codes from text
    const geo = resolveGeography(subdistrict, district, province);
    
    const resolvedSubdistrict = geo?.subdistrictName || subdistrict || null;
    const resolvedDistrict = geo?.districtName || district || null;
    const resolvedProvince = geo?.provinceName || province || null;
    const resolvedPostalCode = geo?.postalCode || postalCodeInput || null;

    // Join full address
    const fullAddress = [
      addressDetails || "",
      resolvedSubdistrict ? `ตำบล/แขวง ${resolvedSubdistrict}` : "",
      resolvedDistrict ? `อำเภอ/เขต ${resolvedDistrict}` : "",
      resolvedProvince ? `จังหวัด ${resolvedProvince}` : "",
      resolvedPostalCode || "",
    ]
      .map((part) => part?.trim() || "")
      .filter(Boolean)
      .join(" ");

    const customerCode = getNextSequentialCode();

    const addressMetadata = {
      districtCode: geo?.districtCode || "",
      districtName: resolvedDistrict || "",
      line1: addressDetails || "",
      postalCode: resolvedPostalCode || "",
      provinceCode: geo?.provinceCode || "",
      provinceName: resolvedProvince || "",
      street: {
        details: addressDetails || "",
      },
      subdistrictCode: geo?.subdistrictCode || "",
      subdistrictName: resolvedSubdistrict || "",
    };

    customersToInsert.push({
      address: fullAddress,
      customer_code: customerCode,
      default_warehouse_id: warehouse.id,
      default_vehicle_id: defaultVehicleId,
      district: resolvedDistrict,
      metadata: {
        address: addressMetadata,
      },
      name,
      organization_id: session.organizationId,
      postal_code: resolvedPostalCode,
      province: resolvedProvince,
      sort_order: firstImportedSortOrder + customersToInsert.length,
      subdistrict: resolvedSubdistrict,
    });
  }

  if (importErrors.length > 0) {
    return {
      status: "error",
      message: `ไม่สามารถนำเข้าร้านค้าได้ เนื่องจากพบข้อมูลไม่ถูกต้อง ${importErrors.length} รายการ`,
      errors: importErrors.slice(0, 50), // Show up to 50 errors in client UI
    };
  }

  if (customersToInsert.length === 0) {
    return {
      status: "error",
      message: "ไม่พบร้านค้าที่ถูกต้องเพื่อทำการบันทึกนำเข้า",
    };
  }

  // Insert customers
  const { error: insertError } = await admin
    .from("customers")
    .insert(customersToInsert);

  if (insertError) {
    console.error("Bulk Insert Error:", insertError);
    return {
      status: "error",
      message: "ระบบบันทึกนำเข้าร้านค้าลงฐานข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
    };
  }

  revalidateCustomerSettings(session.organizationId);
  revalidatePath("/settings/vehicles");

  return {
    status: "success",
    message: `นำเข้าร้านค้าเรียบร้อยทั้งหมด ${customersToInsert.length} ร้านค้า`,
  };
}

function parseCSV(text: string): string[][] {
  const lines: string[][] = [];
  let row: string[] = [];
  let inQuotes = false;
  let currentValue = "";

  // Normalize line endings and strip BOM if exists
  const cleanText = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentValue += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(currentValue.trim());
      currentValue = "";
    } else if (char === "\n" && !inQuotes) {
      row.push(currentValue.trim());
      lines.push(row);
      row = [];
      currentValue = "";
    } else {
      currentValue += char;
    }
  }

  if (currentValue || row.length > 0) {
    row.push(currentValue.trim());
    lines.push(row);
  }

  return lines;
}
