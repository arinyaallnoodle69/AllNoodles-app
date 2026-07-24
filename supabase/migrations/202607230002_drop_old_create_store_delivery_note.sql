-- Migration: drop_old_create_store_delivery_note
-- Drop the old 9-parameter overload of create_store_delivery_note to prevent ambiguity.

drop function if exists public.create_store_delivery_note(
  p_organization_id uuid,
  p_order_ids       uuid[],
  p_customer_id     uuid,
  p_vehicle_id      uuid,
  p_delivery_date   date,
  p_notes           text,
  p_created_by      uuid,
  p_items           jsonb,
  p_warehouse_id    uuid
);
