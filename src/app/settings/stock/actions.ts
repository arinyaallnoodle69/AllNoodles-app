"use server";

import { revalidatePath, revalidateTag, updateTag } from "next/cache";
import { requireAnyRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getStockReceiptDetail, type StockReceiptDetail } from "@/lib/stock/admin";
import { createActionClient } from "@/lib/supabase/action";
import type { Json } from "@/types/database";

const STOCK_RECEIPT_IMAGES_BUCKET = "stock-receipts";
const MISSING_WAREHOUSE_MESSAGE = "กรุณาเลือกคลังก่อนทำรายการสต็อก";
const DEFAULT_RECEIPT_SUPPLIER_NAME = "ไม่ระบุโรงงาน";

type ReceiveStockField = "productId" | "totalQuantity";
type ReceiveStockItemInput = {
  productId: string;
  quantityReceived: number;
  unit: string;
  unitCost: number;
  unitRatio?: number;
};

type WarehouseProductFactoryRow = {
  product_id: string;
  mode: string | null;
  supplier_id: string | null;
  suppliers: { name: string | null } | Array<{ name: string | null }> | null;
};

type ReceiveStockReceiptGroup = {
  items: ReceiveStockItemInput[];
  supplierId: string | null;
  supplierName: string;
};

type WarehouseProductModeSelectQuery = {
  eq(column: string, value: string): WarehouseProductModeSelectQuery;
  in(column: string, values: string[]): Promise<{ data: unknown[] | null; error: { message?: string } | null }>;
};

export type ReceiveStockActionState = {
  fieldErrors: Partial<Record<ReceiveStockField, string>>;
  message: string;
  status: "error" | "idle" | "success";
};

export type AdjustStockActionState = {
  message: string;
  status: "error" | "idle" | "success";
};

function revalidateStockSurfaces(organizationId: string) {
  revalidateTag(`stock-${organizationId}`, "max");
  revalidateTag(`orders-${organizationId}`, "max");
  revalidateTag(`settings-${organizationId}`, "max");

  updateTag(`stock-${organizationId}`);
  updateTag(`orders-${organizationId}`);
  updateTag(`settings-${organizationId}`);

  revalidatePath("/stock");
  revalidatePath("/stock/movements");
  revalidatePath("/settings/stock");
  revalidatePath("/orders/incoming");
  revalidatePath("/orders");
  revalidatePath("/dashboard");
}

function getText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getNumber(formData: FormData, key: string) {
  const value = Number(String(formData.get(key) ?? "").replace(/,/g, "").trim());
  return Number.isFinite(value) ? value : Number.NaN;
}

function getSupplierName(row: WarehouseProductFactoryRow) {
  const suppliers = row.suppliers;
  const supplier = Array.isArray(suppliers) ? suppliers[0] : suppliers;
  return supplier?.name?.trim() || DEFAULT_RECEIPT_SUPPLIER_NAME;
}

async function generateReceiptNumber(admin: ReturnType<typeof getSupabaseAdmin>, organizationId: string) {
  const { data: generatedNumber, error: generateError } = await admin.rpc("generate_receipt_number", {
    p_organization_id: organizationId,
  });

  if (!generateError && generatedNumber) {
    return String(generatedNumber);
  }

  return `RCV-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

async function buildReceiveStockReceiptGroups(
  admin: ReturnType<typeof getSupabaseAdmin>,
  organizationId: string,
  warehouseId: string,
  items: ReceiveStockItemInput[],
): Promise<{ groups: ReceiveStockReceiptGroup[]; error?: string }> {
  const productIds = Array.from(new Set(items.map((item) => item.productId).filter(Boolean)));

  const productWarehouseModesTable = (admin as unknown as {
    from(table: "product_warehouse_fulfillment_modes"): {
      select(columns: string): WarehouseProductModeSelectQuery;
    };
  }).from("product_warehouse_fulfillment_modes");

  const { data, error } = await productWarehouseModesTable
    .select("product_id, mode, supplier_id, suppliers(name)")
    .eq("organization_id", organizationId)
    .eq("warehouse_id", warehouseId)
    .in("product_id", productIds);

  if (error) {
    return { groups: [], error: error.message ?? "ไม่สามารถตรวจสอบการตั้งค่าโรงงานของสินค้าได้" };
  }

  const rows = (data ?? []) as WarehouseProductFactoryRow[];
  const modeByProductId = new Map(rows.map((row) => [row.product_id, row]));
  const groupsBySupplier = new Map<string, ReceiveStockReceiptGroup>();

  for (const item of items) {
    const row = modeByProductId.get(item.productId);

    if (row?.mode && row.mode !== "stock") {
      return {
        groups: [],
        error: "มีสินค้าที่ไม่ได้ตั้งเป็นใช้สต็อกในคลังนี้ กรุณาตรวจสอบหน้าจัดการคลัง",
      };
    }

    const supplierId = row?.supplier_id ?? null;
    const supplierName = row ? getSupplierName(row) : DEFAULT_RECEIPT_SUPPLIER_NAME;
    const groupKey = supplierId ?? "__no_supplier__";
    const group = groupsBySupplier.get(groupKey);

    if (group) {
      group.items.push(item);
    } else {
      groupsBySupplier.set(groupKey, {
        items: [item],
        supplierId,
        supplierName,
      });
    }
  }

  return { groups: Array.from(groupsBySupplier.values()) };
}

export async function getStockReceiptDetailAction(receiptId: string): Promise<StockReceiptDetail | null> {
  const session = await requireAnyRole(["admin", "member"]);
  return getStockReceiptDetail(session.organizationId, receiptId);
}

export async function receiveStockAction(
  _prevState: ReceiveStockActionState,
  formData: FormData,
): Promise<ReceiveStockActionState> {
  const session = await requireAnyRole(["admin", "member"]);

  const itemsJson = getText(formData, "itemsJson");
  let items: ReceiveStockItemInput[] = [];

  if (itemsJson) {
    try {
      items = JSON.parse(itemsJson) as ReceiveStockItemInput[];
    } catch (error) {
      console.error("[receiveStockAction] JSON parse error:", error);
    }
  } else {
    const productId = getText(formData, "productId");
    const totalQuantity = getNumber(formData, "totalQuantity");
    const baseUnit = getText(formData, "baseUnit");
    const avgUnitCost = getNumber(formData, "avgUnitCost");

    if (productId && totalQuantity > 0) {
      items = [
        {
          productId,
          quantityReceived: totalQuantity,
          unit: baseUnit,
          unitCost: Number.isFinite(avgUnitCost) && avgUnitCost >= 0 ? avgUnitCost : 0,
        },
      ];
    }
  }

  const receiptNumberInput = getText(formData, "receiptNumber");
  const warehouseId = getText(formData, "warehouseId");
  const receivedAt = getText(formData, "receivedAt");
  const notes = getText(formData, "notes");
  const imageFile = formData.get("receiptImage") as File | null;
  const admin = getSupabaseAdmin();

  if (!warehouseId) {
    return {
      fieldErrors: {},
      message: MISSING_WAREHOUSE_MESSAGE,
      status: "error",
    };
  }

  if (items.length === 0) {
    return {
      fieldErrors: {},
      message: "กรุณาเลือกรายการสินค้าและระบุจำนวนก่อนบันทึก",
      status: "error",
    };
  }

  if (items.some((item) => !item.productId || item.quantityReceived <= 0 || !item.unit)) {
    return {
      fieldErrors: {},
      message: "ข้อมูลสินค้ารับเข้าไม่ถูกต้อง กรุณาตรวจสอบสินค้า จำนวน และหน่วย",
      status: "error",
    };
  }

  const { groups, error: groupError } = await buildReceiveStockReceiptGroups(
    admin,
    session.organizationId,
    warehouseId,
    items,
  );

  if (groupError) {
    return {
      fieldErrors: {},
      message: groupError,
      status: "error",
    };
  }

  if (groups.length === 0) {
    return {
      fieldErrors: {},
      message: "ไม่พบรายการสินค้าที่สามารถรับเข้าคลังได้",
      status: "error",
    };
  }

  const receiptNumbers = await Promise.all(
    groups.map((_, index) => {
      if (receiptNumberInput) {
        return groups.length === 1 ? receiptNumberInput : `${receiptNumberInput}-${index + 1}`;
      }

      return generateReceiptNumber(admin, session.organizationId);
    }),
  );

  let receiptUrl: string | null = null;

  if (imageFile && imageFile.size > 0) {
    try {
      const supabase = await createActionClient();
      const fileExt = imageFile.name.split(".").pop() || "jpg";
      const fileName = `${session.organizationId}/${receiptNumbers[0]}.${fileExt}`;
      const buffer = Buffer.from(await imageFile.arrayBuffer());

      const { error: uploadError } = await supabase.storage
        .from(STOCK_RECEIPT_IMAGES_BUCKET)
        .upload(fileName, buffer, {
          contentType: imageFile.type,
          upsert: true,
        });

      if (uploadError) {
        console.error("[receiveStockAction:upload]", uploadError);
        return {
          fieldErrors: {},
          message: `อัปโหลดรูปบิลไม่สำเร็จ: ${uploadError.message}`,
          status: "error",
        };
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from(STOCK_RECEIPT_IMAGES_BUCKET).getPublicUrl(fileName);

      receiptUrl = publicUrl;
    } catch (error) {
      console.error("[receiveStockAction:upload_catch]", error);
      return {
        fieldErrors: {},
        message: "เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ",
        status: "error",
      };
    }
  }

  const receivedAtIso = receivedAt ? new Date(receivedAt).toISOString() : new Date().toISOString();

  for (const [index, group] of groups.entries()) {
    const { error } = await admin.rpc("create_inventory_receipt", {
      p_created_by: session.userId,
      p_items: group.items,
      p_notes: notes,
      p_organization_id: session.organizationId,
      p_receipt_number: receiptNumbers[index],
      p_received_at: receivedAtIso,
      p_supplier_name: group.supplierName,
      p_warehouse_id: warehouseId,
      p_receipt_url: receiptUrl,
      p_supplier_id: group.supplierId,
    });

    if (error) {
      return {
        fieldErrors: {},
        message: error.message ?? "ระบบบันทึกรับเข้าไม่สำเร็จ",
        status: "error",
      };
    }
  }

  revalidatePath("/stock");
  revalidatePath("/stock/history");
  revalidatePath("/settings/stock");
  revalidatePath("/settings/products");

  return {
    fieldErrors: {},
    message:
      groups.length > 1
        ? `บันทึกรับสินค้าเข้าเรียบร้อยแล้ว (${groups.length} โรงงาน)`
        : "บันทึกรับสินค้าเข้าเรียบร้อยแล้ว",
    status: "success",
  };
}

export type BulkReceiveItem = {
  productId: string;
  quantityReceived: number;
  unit: string;
  unitRatio: number;
};

export async function bulkReceiveStockAction(
  items: BulkReceiveItem[],
  notes: string = "รับเข้าจากการตั้งเตือนสต็อกไม่พอ",
  warehouseId?: string,
) {
  const session = await requireAnyRole(["admin", "member"]);
  const admin = getSupabaseAdmin();

  if (!warehouseId) {
    return { success: false, message: MISSING_WAREHOUSE_MESSAGE };
  }

  const receiptItems: ReceiveStockItemInput[] = items.map((item) => ({
    productId: item.productId,
    quantityReceived: item.quantityReceived,
    unit: item.unit,
    unitRatio: item.unitRatio,
    unitCost: 0,
  }));

  if (
    receiptItems.length === 0 ||
    receiptItems.some((item) => !item.productId || item.quantityReceived <= 0 || !item.unit)
  ) {
    return { success: false, message: "ข้อมูลสินค้ารับเข้าไม่ถูกต้อง กรุณาตรวจสอบสินค้า จำนวน และหน่วย" };
  }

  const { groups, error: groupError } = await buildReceiveStockReceiptGroups(
    admin,
    session.organizationId,
    warehouseId,
    receiptItems,
  );

  if (groupError) {
    return { success: false, message: groupError };
  }

  if (groups.length === 0) {
    return { success: false, message: "ไม่พบรายการสินค้าที่สามารถรับเข้าคลังได้" };
  }

  const receiptNumbers = await Promise.all(groups.map(() => generateReceiptNumber(admin, session.organizationId)));
  const receivedAtIso = new Date().toISOString();

  for (const [index, group] of groups.entries()) {
    const { error } = await admin.rpc("create_inventory_receipt", {
      p_created_by: session.userId,
      p_items: group.items,
      p_notes: notes,
      p_organization_id: session.organizationId,
      p_receipt_number: receiptNumbers[index],
      p_received_at: receivedAtIso,
      p_supplier_name: group.supplierName,
      p_warehouse_id: warehouseId,
      p_supplier_id: group.supplierId,
    });

    if (error) {
      return { success: false, message: error.message ?? "ระบบบันทึกรับเข้าไม่สำเร็จ" };
    }
  }

  revalidatePath("/stock");
  revalidatePath("/stock/history");
  revalidatePath("/settings/stock");
  revalidatePath("/settings/products");
  revalidatePath("/orders");

  return {
    success: true,
    message:
      groups.length > 1
        ? `บันทึกรับสินค้าเข้าเรียบร้อยแล้ว (${groups.length} โรงงาน)`
        : "บันทึกรับสินค้าเข้าเรียบร้อยแล้ว",
  };
}

export async function adjustStockAction(
  _prevState: AdjustStockActionState,
  formData: FormData,
): Promise<AdjustStockActionState> {
  const session = await requireAnyRole(["admin", "member"]);
  const admin = getSupabaseAdmin();

  const productId = getText(formData, "productId");
  const warehouseId = getText(formData, "warehouseId");
  const newQuantity = getNumber(formData, "newQuantity");
  const notes = getText(formData, "notes");

  if (!warehouseId) {
    return { status: "error", message: MISSING_WAREHOUSE_MESSAGE };
  }

  if (!productId) {
    return { status: "error", message: "ไม่พบรหัสสินค้า" };
  }

  if (!Number.isFinite(newQuantity)) {
    return { status: "error", message: "กรุณาระบุจำนวนสินค้าให้ถูกต้อง" };
  }

  const { error } = await admin.rpc("adjust_inventory", {
    p_organization_id: session.organizationId,
    p_product_id: productId,
    p_new_stock_quantity: newQuantity,
    p_adjusted_by: session.userId,
    p_notes: notes || "ปรับปรุงสต็อกด้วยตนเอง",
    p_warehouse_id: warehouseId,
  });

  if (error) {
    console.error("[adjustStockAction] Error:", error);
    return { status: "error", message: error.message || "ไม่สามารถปรับปรุงสต็อกได้" };
  }

  revalidateStockSurfaces(session.organizationId);

  return { status: "success", message: "ปรับปรุงยอดสต็อกเรียบร้อยแล้ว" };
}

export type UpdateStockReceiptActionState = {
  fieldErrors: Partial<Record<"receivedAt" | "supplierId" | "supplierName" | "notes" | "items", string>>;
  message: string;
  status: "error" | "idle" | "success";
};

export async function updateStockReceiptAction(
  _prevState: UpdateStockReceiptActionState,
  formData: FormData,
): Promise<UpdateStockReceiptActionState> {
  const session = await requireAnyRole(["admin", "member"]);
  const admin = getSupabaseAdmin();

  const receiptId = getText(formData, "receiptId");
  const receivedAt = getText(formData, "receivedAt");
  const originalReceivedAt = getText(formData, "originalReceivedAt");
  const supplierId = getText(formData, "supplierId");
  const supplierName = getText(formData, "supplierName");
  const notes = getText(formData, "notes");

  const items: Array<{
    productId: string;
    quantityReceived: number;
    unit: string;
    unitCost: number;
  }> = [];

  let itemIndex = 0;
  while (true) {
    const productId = getText(formData, `items[${itemIndex}].productId`);
    const quantityReceived = getNumber(formData, `items[${itemIndex}].quantityReceived`);
    const unit = getText(formData, `items[${itemIndex}].unit`);
    const unitCost = getNumber(formData, `items[${itemIndex}].unitCost`);

    if (!productId) break;

    if (quantityReceived <= 0 || !unit || unitCost < 0) {
      return {
        status: "error",
        message: "Please enter valid item values. Quantity must be greater than 0 and cost cannot be negative.",
        fieldErrors: { items: "Invalid item data." },
      };
    }

    items.push({ productId, quantityReceived, unit, unitCost });
    itemIndex++;
  }

  if (!receiptId) {
    return { status: "error", message: "Receipt ID is missing.", fieldErrors: {} };
  }

  if (!receivedAt) {
    return {
      fieldErrors: { receivedAt: "Please choose the receipt date." },
      status: "error",
      message: "Please choose the receipt date.",
    };
  }

  if (items.length === 0) {
    return {
      status: "error",
      message: "At least one item is required.",
      fieldErrors: { items: "No items found." },
    };
  }

  try {
    const parsedDate = new Date(receivedAt + "T00:00:00");
    const originalDate = originalReceivedAt ? new Date(originalReceivedAt) : null;
    if (isNaN(parsedDate.getTime()) || (originalDate && isNaN(originalDate.getTime()))) {
      return {
        fieldErrors: { receivedAt: "Invalid date format." },
        status: "error",
        message: "Invalid date format.",
      };
    }

    const originalDateKey = originalReceivedAt ? originalReceivedAt.split("T")[0] : "";
    const nextReceivedAt =
      originalDate && originalDateKey
        ? originalDateKey === receivedAt
          ? originalDate.toISOString()
          : new Date(
              Date.UTC(
                parsedDate.getUTCFullYear(),
                parsedDate.getUTCMonth(),
                parsedDate.getUTCDate(),
                originalDate.getUTCHours(),
                originalDate.getUTCMinutes(),
                originalDate.getUTCSeconds(),
                originalDate.getUTCMilliseconds(),
              ),
            ).toISOString()
        : parsedDate.toISOString();

    const { error: receiptError } = await admin.rpc("update_inventory_receipt", {
      p_organization_id: session.organizationId,
      p_receipt_id: receiptId,
      p_received_at: nextReceivedAt,
      p_supplier_id: (supplierId || null) as unknown as string,
      p_supplier_name: (supplierName || null) as unknown as string,
      p_notes: (notes || null) as unknown as string,
      p_items: items as unknown as Json,
      p_updated_by: session.userId,
    });

    if (receiptError) {
      console.error("[updateStockReceiptAction] Receipt update error:", receiptError);
      return {
        status: "error",
        message: receiptError.message || "Failed to update the stock receipt.",
        fieldErrors: {},
      };
    }

    revalidatePath("/stock/history");
    revalidatePath("/stock");
    revalidatePath("/settings/stock");
    revalidatePath("/orders");
    revalidatePath("/orders/incoming");

    return {
      status: "success",
      message: "Stock receipt updated successfully.",
      fieldErrors: {},
    };
  } catch (error) {
    console.error("[updateStockReceiptAction] Unexpected error:", error);
    return {
      status: "error",
      message: "Unexpected error while updating the stock receipt.",
      fieldErrors: {},
    };
  }
}
