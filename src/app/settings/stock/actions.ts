"use server";

import { revalidatePath } from "next/cache";
import { requireAppRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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

type SupabaseReceiptAdmin = ReturnType<typeof getSupabaseAdmin> & {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

function getText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getNumber(formData: FormData, key: string) {
  const value = Number(String(formData.get(key) ?? "").replace(/,/g, "").trim());
  return Number.isFinite(value) ? value : Number.NaN;
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
  // Generate unique receipt number if not provided — avoids clash when submitting within the same second
  const receiptNumber = receiptNumberInput || `RCV-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const supplierName = getText(formData, "supplierName") || "โรงงานหลัก";
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
  const admin = getSupabaseAdmin() as SupabaseReceiptAdmin;

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
        // We continue even if upload fails, or should we stop? Let's stop for data integrity if user intended to upload
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
  });

  if (error) {
    return {
      fieldErrors: {},
      message: error.message ?? "ระบบบันทึกรับเข้าไม่สำเร็จ",
      status: "error",
    };
  }

  revalidatePath("/stock");
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
  const admin = getSupabaseAdmin() as SupabaseReceiptAdmin;
  
  const receiptNumber = `RCV-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  
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
  });

  if (error) {
    return { success: false, message: error.message ?? "ระบบบันทึกรับเข้าไม่สำเร็จ" };
  }

  revalidatePath("/stock");
  revalidatePath("/settings/stock");
  revalidatePath("/settings/products");
  revalidatePath("/orders");
  
  return { success: true, message: "บันทึกรับสินค้าเข้าเรียบร้อยแล้ว" };
}
