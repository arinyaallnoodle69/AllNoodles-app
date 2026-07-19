"use server";

import { revalidatePath } from "next/cache";
import { requireAppRole } from "@/lib/auth/authorization";
import { normalizePrintColor } from "@/lib/products/category-print-colors";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type ActionResult = {
  message: string;
  status: "success" | "error";
};

type ProductColorUpdateResult = {
  error: { message?: string } | null;
};

type ProductColorUpdateQuery = PromiseLike<ProductColorUpdateResult> & {
  eq(column: string, value: string): ProductColorUpdateQuery;
};

type ProductColorUpdateTable = {
  update(values: { print_background_color: string | null; updated_at: string }): ProductColorUpdateQuery;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function saveProductPrintBackgroundColorsAction(input: {
  updates: Array<{
    color: string | null;
    productId: string;
  }>;
}): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const updates = input.updates
    .map((update) => ({
      color: update.color === null ? null : normalizePrintColor(update.color),
      originalColor: update.color,
      productId: update.productId.trim(),
    }))
    .filter((update, index, all) => update.productId && all.findIndex((item) => item.productId === update.productId) === index);

  if (updates.length === 0) {
    return { status: "error", message: "กรุณาเลือกสินค้าอย่างน้อย 1 รายการ" };
  }

  if (updates.some((update) => !UUID_PATTERN.test(update.productId))) {
    return { status: "error", message: "รหัสสินค้าไม่ถูกต้อง" };
  }

  if (updates.some((update) => update.originalColor !== null && !update.color)) {
    return { status: "error", message: "รหัสสีต้องเป็นรูปแบบ #RRGGBB เท่านั้น" };
  }

  const admin = getSupabaseAdmin();
  const products = admin.from("products") as unknown as ProductColorUpdateTable;
  const updatedAt = new Date().toISOString();

  const results = await Promise.all(
    updates.map((update) =>
      products
        .update({
          print_background_color: update.color,
          updated_at: updatedAt,
        })
        .eq("id", update.productId)
        .eq("organization_id", session.organizationId),
    ),
  );

  const failed = results.find((result) => result.error);
  if (failed?.error) {
    console.error("[saveProductPrintBackgroundColorsAction]", failed.error);
    return { status: "error", message: "บันทึกสีพื้นหลังสินค้าไม่สำเร็จ" };
  }

  revalidatePath("/settings/products/product-colors");
  revalidatePath("/orders/packing-list");
  revalidatePath("/orders/packing-list/mockup");

  return { status: "success", message: `บันทึกสีสินค้า ${updates.length.toLocaleString("th-TH")} รายการแล้ว` };
}
