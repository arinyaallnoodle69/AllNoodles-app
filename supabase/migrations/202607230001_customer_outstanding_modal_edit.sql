-- Migration: customer_outstanding_modal_edit
-- Drop the old 9-argument function to prevent overloading resolution issues
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

-- Redefine create_store_delivery_note to support entering outstanding balance and installment payment directly from the order page.

create or replace function public.create_store_delivery_note(
  p_organization_id uuid,
  p_order_ids       uuid[],
  p_customer_id     uuid,
  p_vehicle_id      uuid,
  p_delivery_date   date,
  p_notes           text,
  p_created_by      uuid,
  p_items           jsonb,
  p_warehouse_id    uuid,
  p_previous_outstanding numeric default null,
  p_installment_paid numeric default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_date          date := coalesce(p_delivery_date, current_date);
  v_primary_order_id     uuid;
  v_dn_id                uuid;
  v_dn_number            text;
  v_item                 jsonb;
  v_order_item_id        uuid;
  v_product_id           uuid;
  v_product_sale_unit_id uuid;
  v_sale_unit_label      text;
  v_sale_unit_ratio      numeric;
  v_qty_delivered        numeric;
  v_qty_base             numeric;
  v_unit_price           numeric;
  v_line_total           numeric;
  v_stock_before         numeric;
  v_reserved_before      numeric;
  v_stock_after          numeric;
  v_reserved_after       numeric;
  v_total_amount         numeric := 0;
  v_items_processed      integer := 0;
  v_order_id             uuid;
  v_all_delivered        boolean;
  v_any_delivered        boolean;
  v_new_fulfillment      text;
  v_clean_notes          text;
  v_old_item             record;

  -- Finance variables
  v_cust_outstanding     numeric(12, 2) := 0;
  v_cust_installment     numeric(12, 2) := null;
  v_prev_outstanding     numeric(12, 2) := 0;
  v_installment_paid     numeric(12, 2) := 0;
  v_remaining_outstanding numeric(12, 2) := 0;
  v_is_installment       boolean := false;
begin
  if p_warehouse_id is null then
    raise exception 'ร้านค้านี้ยังไม่ได้ตั้งคลังประจำ กรุณาตั้งค่าคลังก่อนสร้างใบส่งของ';
  end if;

  if not exists (
    select 1
    from public.warehouses w
    where w.id = p_warehouse_id
      and w.organization_id = p_organization_id
      and w.is_active = true
  ) then
    raise exception 'ไม่พบคลังที่เปิดใช้งานอยู่';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'ต้องมีสินค้าอย่างน้อย 1 รายการ';
  end if;

  if p_order_ids is null or array_length(p_order_ids, 1) = 0 then
    raise exception 'ต้องระบุออเดอร์อย่างน้อย 1 รายการ';
  end if;

  if exists (
    select 1
    from public.orders o
    where o.id = any(p_order_ids)
      and o.organization_id = p_organization_id
      and o.warehouse_id is not null
      and o.warehouse_id <> p_warehouse_id
  ) then
    raise exception 'ออเดอร์บางรายการผูกคนละคลัง ไม่สามารถรวมใบส่งของได้';
  end if;

  v_clean_notes := nullif(trim(p_notes), '');
  v_primary_order_id := p_order_ids[1];

  perform pg_advisory_xact_lock(
    hashtext(p_organization_id::text || ':' || p_customer_id::text || ':' || p_warehouse_id::text || ':' || v_target_date::text)
  );

  update public.orders
  set status = 'confirmed',
      warehouse_id = coalesce(warehouse_id, p_warehouse_id)
  where id = any(p_order_ids)
    and organization_id = p_organization_id
    and status = 'submitted';

  update public.orders
  set warehouse_id = p_warehouse_id
  where id = any(p_order_ids)
    and organization_id = p_organization_id
    and warehouse_id is null;

  select dn.id, dn.delivery_number
    into v_dn_id, v_dn_number
  from public.delivery_notes dn
  where dn.organization_id = p_organization_id
    and dn.customer_id = p_customer_id
    and dn.delivery_date = v_target_date
    and dn.status = 'confirmed'
    and dn.warehouse_id = p_warehouse_id
  order by dn.created_at asc
  limit 1
  for update;

  -- Lock customer profile to fetch and update balance info safely
  select outstanding_balance, installment_limit
    into v_cust_outstanding, v_cust_installment
  from public.customers
  where id = p_customer_id and organization_id = p_organization_id
  for update;

  if v_dn_id is null then
    v_dn_number := public.next_delivery_note_number(p_organization_id, v_target_date);
    
    -- If p_previous_outstanding is passed, use it; otherwise fallback to customer profile's balance
    v_prev_outstanding := coalesce(p_previous_outstanding, v_cust_outstanding, 0);

    -- If p_installment_paid is passed, use it directly (allow 0 or more)
    if p_installment_paid is not null then
      v_installment_paid := p_installment_paid;
      v_is_installment := true;
    else
      -- If not passed, default to paying in full (installment_paid = previous_outstanding)
      v_installment_paid := v_prev_outstanding;
      v_is_installment := false;
    end if;

    v_remaining_outstanding := v_prev_outstanding - v_installment_paid;

    insert into public.delivery_notes (
      organization_id,
      order_id,
      customer_id,
      vehicle_id,
      warehouse_id,
      delivery_number,
      delivery_date,
      status,
      notes,
      created_by,
      previous_outstanding,
      installment_paid,
      remaining_outstanding,
      is_installment_plan
    ) values (
      p_organization_id,
      v_primary_order_id,
      p_customer_id,
      p_vehicle_id,
      p_warehouse_id,
      v_dn_number,
      v_target_date,
      'confirmed',
      v_clean_notes,
      p_created_by,
      v_prev_outstanding,
      v_installment_paid,
      v_remaining_outstanding,
      v_is_installment
    ) returning id into v_dn_id;
  else
    -- If p_previous_outstanding is passed, use it; otherwise fallback to existing note or customer profile
    select dn.previous_outstanding into v_prev_outstanding from public.delivery_notes dn where dn.id = v_dn_id;
    v_prev_outstanding := coalesce(p_previous_outstanding, v_prev_outstanding, v_cust_outstanding, 0);

    -- If p_installment_paid is passed, use it directly (allow 0 or more)
    if p_installment_paid is not null then
      v_installment_paid := p_installment_paid;
      v_is_installment := true;
    else
      v_installment_paid := v_prev_outstanding;
      v_is_installment := false;
    end if;

    v_remaining_outstanding := v_prev_outstanding - v_installment_paid;

    update public.delivery_notes
    set
      vehicle_id = coalesce(p_vehicle_id, vehicle_id),
      warehouse_id = p_warehouse_id,
      previous_outstanding = v_prev_outstanding,
      installment_paid = v_installment_paid,
      remaining_outstanding = v_remaining_outstanding,
      is_installment_plan = v_is_installment,
      notes = case
        when v_clean_notes is null then notes
        when notes is null or trim(notes) = '' then v_clean_notes
        else notes || ' / ' || v_clean_notes
      end
    where id = v_dn_id;
  end if;

  -- reverse stock changes for existing items if updating to prevent duplicate quantities
  if v_dn_id is not null and exists (select 1 from public.delivery_note_items where delivery_note_id = v_dn_id) then
    for v_old_item in (
      select product_id, quantity_delivered, sale_unit_ratio
      from public.delivery_note_items
      where delivery_note_id = v_dn_id
    ) loop
      v_qty_base := v_old_item.quantity_delivered * v_old_item.sale_unit_ratio;
      
      update public.product_warehouse_stocks
      set stock_quantity = stock_quantity + v_qty_base
      where organization_id = p_organization_id
        and product_id = v_old_item.product_id
        and warehouse_id = p_warehouse_id;
        
      perform public.recalculate_product_stock_totals(p_organization_id, v_old_item.product_id);
    end loop;

    -- Delete old items from delivery_note_items to prepare for fresh insert of new quantities
    delete from public.delivery_note_items where delivery_note_id = v_dn_id;
    
    -- Delete old inventory movements for this delivery note to prevent history pollution
    delete from public.inventory_movements 
    where organization_id = p_organization_id
      and reference_number = v_dn_number
      and (metadata->>'delivery_note_id')::uuid = v_dn_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty_delivered := (v_item->>'quantityDelivered')::numeric;

    if v_qty_delivered is null or v_qty_delivered <= 0 then
      continue;
    end if;

    v_order_item_id        := (v_item->>'orderItemId')::uuid;
    v_product_id           := (v_item->>'productId')::uuid;
    v_product_sale_unit_id := nullif(v_item->>'productSaleUnitId', '')::uuid;
    v_sale_unit_label      := v_item->>'saleUnitLabel';
    v_sale_unit_ratio      := coalesce((v_item->>'saleUnitRatio')::numeric, 1);
    v_unit_price           := coalesce((v_item->>'unitPrice')::numeric, 0);

    v_qty_base   := v_qty_delivered * v_sale_unit_ratio;
    v_line_total := v_qty_delivered * v_unit_price;

    perform public.ensure_product_warehouse_stock(p_organization_id, v_product_id, p_warehouse_id);

    select stock_quantity, reserved_quantity
      into v_stock_before, v_reserved_before
    from public.product_warehouse_stocks
    where organization_id = p_organization_id
      and product_id = v_product_id
      and warehouse_id = p_warehouse_id
    for update;

    if v_stock_before is null then
      raise exception 'ไม่พบสต็อคสินค้าในคลังนี้';
    end if;

    v_stock_after    := v_stock_before - v_qty_base;
    v_reserved_after := greatest(0, v_reserved_before - v_qty_base);

    update public.product_warehouse_stocks
    set stock_quantity = v_stock_after,
        reserved_quantity = v_reserved_after
    where organization_id = p_organization_id
      and product_id = v_product_id
      and warehouse_id = p_warehouse_id;

    perform public.recalculate_product_stock_totals(p_organization_id, v_product_id);

    insert into public.inventory_movements (
      organization_id,
      product_id,
      warehouse_id,
      movement_type,
      quantity_delta,
      stock_before,
      stock_after,
      reference_number,
      notes,
      created_by,
      metadata
    ) values (
      p_organization_id,
      v_product_id,
      p_warehouse_id,
      'issue',
      -v_qty_base,
      v_stock_before,
      v_stock_after,
      v_dn_number,
      v_clean_notes,
      p_created_by,
      jsonb_build_object('delivery_note_id', v_dn_id, 'order_id', v_primary_order_id, 'warehouse_id', p_warehouse_id)
    );

    insert into public.delivery_note_items (
      organization_id,
      delivery_note_id,
      order_item_id,
      product_id,
      product_sale_unit_id,
      sale_unit_label,
      sale_unit_ratio,
      quantity_delivered,
      quantity_in_base_unit,
      unit_price,
      line_total
    ) values (
      p_organization_id,
      v_dn_id,
      v_order_item_id,
      v_product_id,
      v_product_sale_unit_id,
      v_sale_unit_label,
      v_sale_unit_ratio,
      v_qty_delivered,
      v_qty_base,
      v_unit_price,
      v_line_total
    );

    v_total_amount    := v_total_amount + v_line_total;
    v_items_processed := v_items_processed + 1;
  end loop;

  if v_items_processed = 0 then
    raise exception 'ต้องใส่จำนวนส่งอย่างน้อย 1 รายการ';
  end if;

  update public.delivery_notes
  set total_amount = v_total_amount
  where id = v_dn_id;

  -- Set customer outstanding balance directly to remaining outstanding
  -- (If first DN of the day, update customer balance to the remaining balance)
  if v_prev_outstanding is not null then
    update public.customers
    set outstanding_balance = v_remaining_outstanding
    where id = p_customer_id;
  end if;

  foreach v_order_id in array p_order_ids loop
    select
      bool_and(coalesce(d.delivered_qty, 0) >= oi.quantity_in_base_unit),
      bool_or(coalesce(d.delivered_qty, 0) > 0)
    into v_all_delivered, v_any_delivered
    from public.order_items oi
    left join (
      select
        dni.order_item_id,
        sum(dni.quantity_in_base_unit) as delivered_qty
      from public.delivery_note_items dni
      join public.delivery_notes dn on dn.id = dni.delivery_note_id
      where dn.status = 'confirmed'
        and dni.order_item_id in (
          select id from public.order_items where order_id = v_order_id
        )
      group by dni.order_item_id
    ) d on d.order_item_id = oi.id
    where oi.order_id = v_order_id;

    v_new_fulfillment := case
      when v_all_delivered then 'complete'
      when v_any_delivered then 'partial'
      else 'pending'
    end;

    update public.orders
    set fulfillment_status = v_new_fulfillment
    where id = v_order_id;
  end loop;

  return v_dn_number;
end;
$$;
