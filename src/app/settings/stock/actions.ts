"use server";

import { revalidatePath } from "next/cache";
import { requireAppRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getStockReceiptDetail, type StockReceiptDetail } from "@/lib/stock/admin";

import { createActionClient } from "@/lib/supabase/action";

const STOCK_RECEIPT_IMAGES_BUCKET = "stock-receipts";

type ReceiveStockField = "productId" | "totalQuantity";
type ReceiveStockItemInput = {
  productId: string;
  quantityReceived: number;
  unit: string;
  unitCost: number;
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

function getText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getNumber(formData: FormData, key: string) {
  const value = Number(String(formData.get(key) ?? "").replace(/,/g, "").trim());
  return Number.isFinite(value) ? value : Number.NaN;
}

export async function getStockReceiptDetailAction(receiptId: string): Promise<StockReceiptDetail | null> {
  const session = await requireAppRole("admin");
  return getStockReceiptDetail(session.organizationId, receiptId);
}

export async function receiveStockAction(
  _prevState: ReceiveStockActionState,
  formData: FormData,
): Promise<ReceiveStockActionState> {
  const session = await requireAppRole("admin");
  
  // Support for multiple items via JSON string
  const itemsJson = getText(formData, "itemsJson");
  let items: ReceiveStockItemInput[] = [];
  
  if (itemsJson) {
    try {
      items = JSON.parse(itemsJson) as ReceiveStockItemInput[];
    } catch (e) {
      console.error("[receiveStockAction] JSON parse error:", e);
    }
  } else {
    // Fallback to single product fields for backward compatibility
    const productId = getText(formData, "productId");
    const totalQuantity = getNumber(formData, "totalQuantity");
    const baseUnit = getText(formData, "baseUnit");
    const avgUnitCost = getNumber(formData, "avgUnitCost");
    
    if (productId && totalQuantity > 0) {
      items = [{
        productId,
        quantityReceived: totalQuantity,
        unit: baseUnit,
        unitCost: Number.isFinite(avgUnitCost) && avgUnitCost >= 0 ? avgUnitCost : 0,
      }];
    }
  }

  const receiptNumberInput = getText(formData, "receiptNumber");
  let receiptNumber = receiptNumberInput;
  
  // Handle Images and DB init
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = getSupabaseAdmin() as any;

  if (!receiptNumber) {
    const { data: generatedNumber, error: generateError } = await admin.rpc("generate_receipt_number", { 
      p_organization_id: session.organizationId 
    });
    
    if (!generateError && generatedNumber) {
      receiptNumber = generatedNumber;
    } else {
      receiptNumber = `RCV-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    }
  }
  const supplierId = getText(formData, "supplierId") || null;
  const supplierName = getText(formData, "supplierName") || "ผู้ขาย";
  const receivedAt = getText(formData, "receivedAt");
  const notes = getText(formData, "notes");
  const imageFile = formData.get("receiptImage") as File | null;

  if (items.length === 0) {
    return {
      fieldErrors: {},
      message: "กรุณาเลือกรายการสินค้าและระบุจำนวนก่อนบันทึก",
      status: "error",
    };
  }

  let receiptUrl: string | null = null;

  // Handle Image Upload if present
  if (imageFile && imageFile.size > 0) {
    try {
      const supabase = await createActionClient();
      const fileExt = imageFile.name.split(".").pop() || "jpg";
      const fileName = `${session.organizationId}/${receiptNumber}.${fileExt}`;
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

      const { data: { publicUrl } } = supabase.storage
        .from(STOCK_RECEIPT_IMAGES_BUCKET)
        .getPublicUrl(fileName);
      
      receiptUrl = publicUrl;
    } catch (e) {
      console.error("[receiveStockAction:upload_catch]", e);
      return {
        fieldErrors: {},
        message: "เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ",
        status: "error",
      };
    }
  }

  const { error } = await admin.rpc("create_inventory_receipt", {
    p_created_by: session.userId,
    p_items: items,
    p_notes: notes,
    p_organization_id: session.organizationId,
    p_receipt_number: receiptNumber,
    p_received_at: receivedAt ? new Date(receivedAt).toISOString() : new Date().toISOString(),
    p_supplier_name: supplierName,
    p_receipt_url: receiptUrl,
    p_supplier_id: supplierId,
  });

  if (error) {
    return {
      fieldErrors: {},
      message: error.message ?? "ระบบบันทึกรับเข้าไม่สำเร็จ",
      status: "error",
    };
  }

  revalidatePath("/stock");
  revalidatePath("/stock/history");
  revalidatePath("/settings/stock");
  revalidatePath("/settings/products");

  return {
    fieldErrors: {},
    message: "บันทึกรับสินค้าเข้าเรียบร้อยแล้ว",
    status: "success",
  };
}

export type BulkReceiveItem = {
  productId: string;
  quantityReceived: number;
  unit: string;
  unitRatio: number;
};

export async function bulkReceiveStockAction(items: BulkReceiveItem[], notes: string = "รับเข้าจากการตั้งเตือนสต็อกไม่พอ") {
  const session = await requireAppRole("admin");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = getSupabaseAdmin() as any;
  
  let receiptNumber = `RCV-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const { data: generatedNumber, error: generateError } = await admin.rpc("generate_receipt_number", { 
    p_organization_id: session.organizationId 
  });
  if (!generateError && generatedNumber) {
    receiptNumber = generatedNumber;
  }
  const { error } = await admin.rpc("create_inventory_receipt", {
    p_created_by: session.userId,
    p_items: items.map(i => ({
      productId: i.productId,
      quantityReceived: i.quantityReceived,
      unit: i.unit,
      unitRatio: i.unitRatio,
      unitCost: 0
    })),
    p_notes: notes,
    p_organization_id: session.organizationId,
    p_receipt_number: receiptNumber,
    p_received_at: new Date().toISOString(),
    p_supplier_name: "ดึงข้อมูลสต็อกฉุกเฉิน",
    p_supplier_id: null,
  });

  if (error) {
    return { success: false, message: error.message ?? "ระบบบันทึกรับเข้าไม่สำเร็จ" };
  }

  revalidatePath("/stock");
  revalidatePath("/stock/history");
  revalidatePath("/settings/stock");
  revalidatePath("/settings/products");
  revalidatePath("/orders");
  
  return { success: true, message: "บันทึกรับสินค้าเข้าเรียบร้อยแล้ว" };
}

export async function adjustStockAction(
  _prevState: AdjustStockActionState,
  formData: FormData,
): Promise<AdjustStockActionState> {
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin();

  const productId = getText(formData, "productId");
  const newQuantity = getNumber(formData, "newQuantity");
  const notes = getText(formData, "notes");

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
  });

  if (error) {
    console.error("[adjustStockAction] Error:", error);
    return { status: "error", message: error.message || "ไม่สามารถปรับปรุงสต็อกได้" };
  }

  revalidatePath("/stock");
  revalidatePath("/stock/movements");
  revalidatePath("/settings/stock");

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
  const session = await requireAppRole("admin");
  const admin = getSupabaseAdmin();

  const receiptId = getText(formData, "receiptId");
  const receivedAt = getText(formData, "receivedAt");
  const supplierId = getText(formData, "supplierId");
  const supplierName = getText(formData, "supplierName");
  const notes = getText(formData, "notes");

  // Extract items from form data
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
        message: "กรุณาระบุข้อมูลสินค้าให้ถูกต้อง (จำนวนต้องมากกว่า 0 และราคาต้องไม่ติดลบ)", 
        fieldErrors: { items: "ข้อมูลสินค้าไม่ถูกต้อง" } 
      };
    }
    
    items.push({ productId, quantityReceived, unit, unitCost });
    itemIndex++;
  }

  if (!receiptId) {
    return { status: "error", message: "ไม่พบรหัสใบรับสินค้า", fieldErrors: {} };
  }

  if (!receivedAt) {
    return { fieldErrors: { receivedAt: "กรุณาระบุวันที่รับสินค้า" }, status: "error", message: "กรุณาระบุวันที่รับสินค้า" };
  }

  if (items.length === 0) {
    return { status: "error", message: "ต้องมีรายการสินค้าอย่างน้อย 1 รายการ", fieldErrors: { items: "ไม่พบรายการสินค้า" } };
  }

  try {
    const parsedDate = new Date(receivedAt + "T00:00:00");
    if (isNaN(parsedDate.getTime())) {
      return { fieldErrors: { receivedAt: "รูปแบบวันที่ไม่ถูกต้อง" }, status: "error", message: "รูปแบบวันที่ไม่ถูกต้อง" };
    }

    // Start a transaction-like operation
    // 1. Update receipt header
    const { error: receiptError } = await admin
      .from("inventory_receipts")
      .update({
        received_at: parsedDate.toISOString(),
        supplier_id: supplierId || null,
        supplier_name: supplierName || undefined,
        notes: notes || undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", receiptId)
      .eq("organization_id", session.organizationId);

    if (receiptError) {
      console.error("[updateStockReceiptAction] Receipt update error:", receiptError);
      return { status: "error", message: receiptError.message || "ไม่สามารถอัปเดตข้อมูลใบรับสินค้าได้", fieldErrors: {} };
    }

    // 2. Delete existing items
    const { error: deleteError } = await admin
      .from("inventory_receipt_items")
      .delete()
      .eq("receipt_id", receiptId);

    if (deleteError) {
      console.error("[updateStockReceiptAction] Items delete error:", deleteError);
      return { status: "error", message: "ไม่สามารถอัปเดตรายการสินค้าได้", fieldErrors: {} };
    }

    // 3. Insert new items
    const itemsToInsert = items.map(item => ({
      receipt_id: receiptId,
      product_id: item.productId,
      quantity_received: item.quantityReceived,
      unit: item.unit,
      unit_cost: item.unitCost,
      organization_id: session.organizationId,
      created_at: new Date().toISOString(),
      stock_before: 0, // Will be calculated by trigger
      stock_after: 0,  // Will be calculated by trigger
    }));

    const { error: insertError } = await admin
      .from("inventory_receipt_items")
      .insert(itemsToInsert);

    if (insertError) {
      console.error("[updateStockReceiptAction] Items insert error:", insertError);
      return { status: "error", message: "ไม่สามารถบันทึกรายการสินค้าใหม่ได้", fieldErrors: {} };
    }

    revalidatePath("/stock/history");
    revalidatePath("/stock");
    revalidatePath("/settings/stock");

    return { status: "success", message: "อัปเดตข้อมูลใบรับสินค้าเรียบร้อยแล้ว", fieldErrors: {} };
  } catch (error) {
    console.error("[updateStockReceiptAction] Unexpected error:", error);
    return { status: "error", message: "เกิดข้อผิดพลาดที่ไม่คาดคิด", fieldErrors: {} };
  }
}
