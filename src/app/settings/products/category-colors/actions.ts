"use server";

import { revalidatePath } from "next/cache";
import { requireAppRole } from "@/lib/auth/authorization";
import { normalizePrintColor } from "@/lib/products/category-print-colors";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type ActionResult = {
  message: string;
  status: "success" | "error";
};

type SupabaseUpdateResult = {
  error: { message?: string } | null;
};

type SupabaseUpdateQuery = PromiseLike<SupabaseUpdateResult> & {
  eq(column: string, value: string): SupabaseUpdateQuery;
};

type ProductCategoryPrintColorTable = {
  update(values: { print_color: string | null; updated_at: string }): SupabaseUpdateQuery;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function saveProductCategoryPrintColorAction(input: {
  categoryId: string;
  color: string | null;
}): Promise<ActionResult> {
  const session = await requireAppRole("admin");
  const categoryId = input.categoryId?.trim();
  const normalizedColor = input.color === null ? null : normalizePrintColor(input.color);

  if (!UUID_PATTERN.test(categoryId)) {
    return { status: "error", message: "หมวดหมู่ไม่ถูกต้อง" };
  }

  if (input.color !== null && !normalizedColor) {
    return { status: "error", message: "รหัสสีต้องเป็นรูปแบบ #RRGGBB เท่านั้น" };
  }

  const admin = getSupabaseAdmin();
  const productCategories = admin.from("product_categories") as unknown as ProductCategoryPrintColorTable;
  const { error } = await productCategories
    .update({
      print_color: normalizedColor,
      updated_at: new Date().toISOString(),
    })
    .eq("id", categoryId)
    .eq("organization_id", session.organizationId);

  if (error) {
    console.error("[saveProductCategoryPrintColorAction]", error);
    return { status: "error", message: "บันทึกสีหมวดหมู่ไม่สำเร็จ" };
  }

  revalidatePath("/settings/products/category-colors");
  revalidatePath("/settings/products/product-colors");
  revalidatePath("/orders/packing-list");
  revalidatePath("/orders/packing-list/mockup");
  revalidatePath("/orders/factory-order-sheet");
  revalidatePath("/orders/vehicle-product-summary");

  return { status: "success", message: "บันทึกสีหมวดหมู่แล้ว" };
}
