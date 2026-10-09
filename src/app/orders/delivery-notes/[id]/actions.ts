"use server";

import { revalidatePath } from "next/cache";
import { requireAnyRole } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { updateOrderItemsBatchAction } from "@/app/orders/incoming/actions";

export async function adjustDeliveryNoteItemsAction(
  deliveryNoteId: string,
  updates: { itemId: string; quantity: number }[],
): Promise<{ error?: string }> {
  const session = await requireAnyRole(["admin", "member"]);
  if (!updates.length || updates.some((item) => !Number.isFinite(item.quantity) || item.quantity <= 0)) return { error: "จำนวนสินค้าไม่ถูกต้อง" };
  const admin = getSupabaseAdmin();
  const { data: items, error } = await admin.from("delivery_note_items")
    .select("id, quantity_delivered, order_items!inner(id, order_id), delivery_notes!inner(status)")
    .eq("organization_id", session.organizationId).eq("delivery_note_id", deliveryNoteId)
    .eq("delivery_notes.status", "confirmed").in("id", updates.map((item) => item.itemId));
  if (error || items?.length !== updates.length) return { error: "บิลเปลี่ยนแล้ว กรุณาโหลดข้อมูลใหม่" };
  const grouped = new Map<string, { itemId: string; quantity: number; reductionMode: "lost" }[]>();
  for (const item of items) {
    const update = updates.find((row) => row.itemId === item.id)!;
    if (update.quantity > Number(item.quantity_delivered)) return { error: "ไม่สามารถเพิ่มจำนวนในหน้าปรับยอดส่งจริงได้" };
    const orderItem = item.order_items;
    const group = grouped.get(orderItem.order_id) ?? [];
    group.push({ itemId: orderItem.id, quantity: update.quantity, reductionMode: "lost" });
    grouped.set(orderItem.order_id, group);
  }
  for (const [orderId, changes] of grouped) {
    const { data: order, error: orderError } = await admin.from("orders").select("notes, updated_at")
      .eq("organization_id", session.organizationId).eq("id", orderId).single();
    if (orderError || !order) return { error: "ไม่พบออเดอร์ของบิลนี้" };
    const result = await updateOrderItemsBatchAction({ orderId, expectedUpdatedAt: order.updated_at,
      notes: order.notes, removedIds: [], additions: [], updates: changes });
    if ("error" in result) return { error: result.error };
    if (result.receiptWarning) return { error: result.receiptWarning };
  }
  revalidatePath(`/orders/delivery-notes/${deliveryNoteId}`);
  return {};
}
