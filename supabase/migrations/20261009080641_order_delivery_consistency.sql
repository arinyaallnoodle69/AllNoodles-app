-- Keep stored order totals derived from saved items, including failed/retried manual saves.
create or replace function public.enforce_order_item_totals() returns trigger
language plpgsql set search_path = public as $$
begin
  select coalesce(sum(line_total), 0) into new.total_amount
  from public.order_items where order_id = new.id;
  new.subtotal_amount := new.total_amount;
  return new;
end $$;
create trigger orders_enforce_item_totals before insert or update of total_amount, subtotal_amount
on public.orders for each row execute function public.enforce_order_item_totals();

create or replace function public.refresh_order_item_totals() returns trigger
language plpgsql set search_path = public as $$
begin
  update public.orders set total_amount = 0 where id = coalesce(new.order_id, old.order_id);
  if tg_op = 'UPDATE' and old.order_id <> new.order_id then
    update public.orders set total_amount = 0 where id = old.order_id;
  end if;
  return null;
end $$;
create trigger order_items_refresh_totals after insert or update or delete
on public.order_items for each row execute function public.refresh_order_item_totals();

create or replace function public.sync_order_delivery_current(
  p_organization_id uuid, p_order_id uuid, p_user_id uuid default null,
  p_loss_by_order_item jsonb default '{}'::jsonb
) returns text language plpgsql security definer set search_path = public as $$
declare
  o public.orders%rowtype;
  d public.delivery_notes%rowtype;
  ids uuid[];
  payload jsonb;
  merged_notes text;
  actor uuid;
  result text;
begin
  select * into strict o from public.orders where id = p_order_id and organization_id = p_organization_id;
  if o.status = 'cancelled' or o.warehouse_id is null then
    raise exception 'ออเดอร์ถูกยกเลิกหรือยังไม่ได้กำหนดคลัง';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_organization_id::text || ':' || o.customer_id::text || ':' || o.warehouse_id::text || ':' || o.order_date::text));
  perform 1 from public.orders where organization_id = p_organization_id
    and customer_id = o.customer_id and warehouse_id = o.warehouse_id
    and order_date = o.order_date and status <> 'cancelled' order by id for update;
  select array_agg(id order by created_at, id), string_agg(distinct nullif(trim(notes), ''), ' / ')
    into ids, merged_notes from public.orders where organization_id = p_organization_id
    and customer_id = o.customer_id and warehouse_id = o.warehouse_id
    and order_date = o.order_date and status <> 'cancelled';
  select jsonb_agg(jsonb_build_object('orderItemId', id, 'productId', product_id,
    'productSaleUnitId', product_sale_unit_id, 'quantityDelivered', quantity,
    'saleUnitLabel', sale_unit_label, 'saleUnitRatio', sale_unit_ratio, 'unitPrice', unit_price)
    order by product_id, id) into payload from public.order_items where order_id = any(ids);
  select * into d from public.delivery_notes where organization_id = p_organization_id
    and customer_id = o.customer_id and warehouse_id = o.warehouse_id
    and delivery_date = o.order_date and status = 'confirmed' order by created_at limit 1 for update;
  actor := p_user_id;
  if actor is null then
    select id into actor from public.app_users where organization_id = p_organization_id
      and is_active order by created_at limit 1;
  end if;
  if not exists(select 1 from public.app_users where id = actor and organization_id = p_organization_id and is_active) then
    raise exception 'ไม่พบผู้ใช้งานสำหรับบันทึกใบส่งของ';
  end if;
  result := public.create_store_delivery_note(p_organization_id, ids, o.customer_id,
    coalesce(o.assigned_vehicle_id, (select default_vehicle_id from public.customers where id = o.customer_id)),
    o.order_date, merged_notes, actor, payload, o.warehouse_id,
    d.previous_outstanding, d.installment_paid, p_loss_by_order_item);
  -- Merged prices can round to cents; the saved line amount remains authoritative.
  update public.delivery_note_items di set line_total = oi.line_total
    from public.order_items oi, public.delivery_notes n
    where di.order_item_id = oi.id and di.delivery_note_id = n.id
      and n.organization_id = p_organization_id and n.delivery_number = result;
  update public.delivery_notes n set total_amount =
    (select coalesce(sum(line_total), 0) from public.delivery_note_items where delivery_note_id = n.id)
    where n.organization_id = p_organization_id and n.delivery_number = result;
  -- Rebuild replaces the note; do not accumulate old notes on repeated saves.
  update public.delivery_notes set notes = merged_notes where organization_id = p_organization_id and delivery_number = result;
  return result;
end $$;

create or replace function public.save_order_items_and_delivery(
  p_organization_id uuid, p_order_id uuid, p_user_id uuid, p_expected_updated_at timestamptz,
  p_notes text, p_removed_ids uuid[], p_updates jsonb, p_additions jsonb,
  p_prices jsonb, p_loss_by_order_item jsonb
) returns text language plpgsql security definer set search_path = public as $$
declare
  o public.orders%rowtype;
  r public.order_items%rowtype;
  j jsonb;
  result text;
begin
  select * into strict o from public.orders where id = p_order_id and organization_id = p_organization_id;
  perform pg_advisory_xact_lock(hashtext(p_organization_id::text || ':' || o.customer_id::text || ':' || o.warehouse_id::text || ':' || o.order_date::text));
  select * into strict o from public.orders where id = p_order_id and organization_id = p_organization_id for update;
  if o.status = 'cancelled' then raise exception 'ออเดอร์ถูกยกเลิกแล้ว'; end if;
  if o.updated_at is distinct from p_expected_updated_at then
    raise exception 'ออเดอร์เปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก';
  end if;
  if exists(select 1 from unnest(coalesce(p_removed_ids, '{}'::uuid[])) i
    where not exists(select 1 from public.order_items where id = i and order_id = o.id and organization_id = p_organization_id)) then
    raise exception 'รายการสินค้าที่ลบไม่อยู่ในออเดอร์นี้';
  end if;
  for j in select value from jsonb_array_elements(p_updates) loop
    r := jsonb_populate_record(null::public.order_items, j);
    if not exists(select 1 from public.order_items where id = r.id and order_id = o.id and organization_id = p_organization_id)
      or r.order_id <> o.id or r.organization_id <> p_organization_id then
      raise exception 'รายการสินค้าที่แก้ไขไม่อยู่ในออเดอร์นี้';
    end if;
    if r.quantity <= 0 or r.unit_price < 0 or r.sale_unit_ratio <= 0 then raise exception 'จำนวนหรือราคาไม่ถูกต้อง'; end if;
    update public.order_items set quantity = r.quantity, quantity_in_base_unit = r.quantity * r.sale_unit_ratio,
      unit_price = r.unit_price, line_total = r.quantity * r.unit_price where id = r.id;
  end loop;
  delete from public.order_items where order_id = o.id and id = any(p_removed_ids);
  for j in select value from jsonb_array_elements(p_additions) loop
    r := jsonb_populate_record(null::public.order_items, j);
    if r.order_id <> o.id or r.organization_id <> p_organization_id or r.quantity <= 0 or r.unit_price < 0 or r.sale_unit_ratio <= 0
      or not exists(select 1 from public.products where id = r.product_id and organization_id = p_organization_id)
      or not exists(select 1 from public.product_sale_units where id = r.product_sale_unit_id and product_id = r.product_id and organization_id = p_organization_id) then
      raise exception 'สินค้า จำนวน หรือหน่วยขายไม่ถูกต้อง';
    end if;
    insert into public.order_items(organization_id, order_id, product_id, product_sale_unit_id, quantity,
      quantity_in_base_unit, sale_unit_label, sale_unit_ratio, unit_price, line_total, cost_price, is_replacement, notes)
    values(p_organization_id, o.id, r.product_id, r.product_sale_unit_id, r.quantity,
      r.quantity * r.sale_unit_ratio, r.sale_unit_label, r.sale_unit_ratio, r.unit_price,
      r.quantity * r.unit_price, r.cost_price, coalesce(r.is_replacement, false), r.notes);
  end loop;
  insert into public.customer_product_prices(organization_id, customer_id, product_id, product_sale_unit_id, sale_price)
    select p_organization_id, o.customer_id, x.product_id, x.product_sale_unit_id, x.sale_price
    from jsonb_to_recordset(p_prices) x(product_id uuid, product_sale_unit_id uuid, sale_price numeric)
    on conflict(organization_id, customer_id, product_sale_unit_id) do update set sale_price = excluded.sale_price;
  update public.orders set notes = nullif(trim(p_notes), ''), total_amount = 0 where id = o.id;
  if o.status in ('submitted', 'confirmed') then
    result := public.sync_order_delivery_current(p_organization_id, o.id, p_user_id, p_loss_by_order_item);
  end if;
  return result;
end $$;

create or replace function public.merge_order_items_atomic(p_organization_id uuid, p_order_id uuid, p_items jsonb, p_user_id uuid default null, p_sync_delivery boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  o public.orders%rowtype;
  j jsonb;
  primary_id uuid;
  qty numeric;
  base_qty numeric;
  amount numeric;
  replacement boolean;
begin
  select * into strict o from public.orders where id = p_order_id and organization_id = p_organization_id;
  perform pg_advisory_xact_lock(hashtext(p_organization_id::text || ':' || o.customer_id::text || ':' || o.warehouse_id::text || ':' || o.order_date::text));
  perform 1 from public.orders where id = o.id for update;
  if o.status = 'cancelled' then raise exception 'ออเดอร์ถูกยกเลิกแล้ว'; end if;
  for j in select value from jsonb_array_elements(p_items) loop
    replacement := coalesce((j->>'isReplacement')::boolean, false);
    if (j->>'quantity')::numeric <= 0 or (j->>'unitPrice')::numeric < 0
      or not exists(select 1 from public.products where id = (j->>'productId')::uuid and organization_id = p_organization_id)
      or ((j->>'productSaleUnitId') is not null and not exists(select 1 from public.product_sale_units
        where id = (j->>'productSaleUnitId')::uuid and product_id = (j->>'productId')::uuid and organization_id = p_organization_id)) then
      raise exception 'สินค้า จำนวน หรือหน่วยขายไม่ถูกต้อง';
    end if;
    select (array_agg(id order by created_at, id))[1], coalesce(sum(quantity), 0),
      coalesce(sum(quantity_in_base_unit), 0), coalesce(sum(line_total), 0)
      into primary_id, qty, base_qty, amount from public.order_items where order_id = o.id
      and product_id = (j->>'productId')::uuid and product_sale_unit_id is not distinct from (j->>'productSaleUnitId')::uuid
      and is_replacement = replacement;
    qty := qty + (j->>'quantity')::numeric;
    base_qty := base_qty + (j->>'quantityInBaseUnit')::numeric;
    amount := case when replacement then 0 else amount + (j->>'quantity')::numeric * (j->>'unitPrice')::numeric end;
    if primary_id is null then
      insert into public.order_items(organization_id, order_id, product_id, product_sale_unit_id, quantity,
        quantity_in_base_unit, sale_unit_label, sale_unit_ratio, unit_price, line_total, cost_price, is_replacement, notes)
      values(p_organization_id, o.id, (j->>'productId')::uuid, (j->>'productSaleUnitId')::uuid, qty, base_qty,
        j->>'saleUnitLabel', (j->>'saleUnitRatio')::numeric, amount / qty, amount, (j->>'costPrice')::numeric,
        replacement, case when replacement then 'ส่งชดเชย (ไม่คิดเงิน)' end);
    else
      delete from public.order_items where order_id = o.id and id <> primary_id
        and product_id = (j->>'productId')::uuid and product_sale_unit_id is not distinct from (j->>'productSaleUnitId')::uuid
        and is_replacement = replacement;
      update public.order_items set quantity = qty, quantity_in_base_unit = base_qty, line_total = amount,
        unit_price = amount / qty, sale_unit_label = j->>'saleUnitLabel', sale_unit_ratio = (j->>'saleUnitRatio')::numeric,
        cost_price = coalesce(nullif((j->>'costPrice')::numeric, 0), cost_price) where id = primary_id;
    end if;
  end loop;
  if p_sync_delivery then
    perform public.sync_order_delivery_current(p_organization_id, o.id, p_user_id);
  end if;
end $$;

revoke all on function public.sync_order_delivery_current(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.save_order_items_and_delivery(uuid, uuid, uuid, timestamptz, text, uuid[], jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.merge_order_items_atomic(uuid, uuid, jsonb, uuid, boolean) from public, anon, authenticated;
grant execute on function public.sync_order_delivery_current(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.save_order_items_and_delivery(uuid, uuid, uuid, timestamptz, text, uuid[], jsonb, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.merge_order_items_atomic(uuid, uuid, jsonb, uuid, boolean) to service_role;

-- Repair only headers whose saved items prove a different total; never infer missing products.
update public.orders o set total_amount = 0 where total_amount is distinct from
  (select coalesce(sum(line_total), 0) from public.order_items where order_id = o.id)
  or subtotal_amount is distinct from (select coalesce(sum(line_total), 0) from public.order_items where order_id = o.id);

create or replace function public.delivery_export_versions(p_organization_id uuid, p_note_ids uuid[] default null)
returns table(id uuid, delivery_number text, group_key text, version text, valid boolean)
language sql stable security definer set search_path = public as $$
  select dn.id, dn.delivery_number,
    dn.customer_id::text || ':' || dn.delivery_date::text || ':' || dn.warehouse_id::text,
    md5(jsonb_build_array(to_jsonb(dn), os.snapshot, oi.snapshot, di.snapshot,
      (select to_jsonb(c) - 'updated_at' from public.customers c where c.id = dn.customer_id))::text),
    dn.total_amount = (select coalesce(sum(line_total), 0) from public.delivery_note_items where delivery_note_id = dn.id)
    and dn.warehouse_id is not null and jsonb_array_length(oi.snapshot) > 0
    and not exists(select 1 from public.orders o where o.id = any(os.ids) and
      (o.total_amount <> (select coalesce(sum(line_total), 0) from public.order_items where order_id = o.id)
       or o.subtotal_amount <> o.total_amount))
    and not exists(
      (select i.id, i.product_id, i.product_sale_unit_id, i.sale_unit_label, i.sale_unit_ratio,
        i.quantity, i.quantity_in_base_unit, i.unit_price, i.line_total from public.order_items i where i.order_id = any(os.ids)
       except
       select i.order_item_id, i.product_id, i.product_sale_unit_id, i.sale_unit_label, i.sale_unit_ratio,
        sum(i.quantity_delivered), sum(i.quantity_in_base_unit), i.unit_price, sum(i.line_total)
       from public.delivery_note_items i join public.delivery_notes n on n.id = i.delivery_note_id
       where n.organization_id = p_organization_id and n.customer_id = dn.customer_id
         and n.delivery_date = dn.delivery_date and n.warehouse_id = dn.warehouse_id and n.status = 'confirmed'
       group by i.order_item_id, i.product_id, i.product_sale_unit_id, i.sale_unit_label, i.sale_unit_ratio, i.unit_price)
      union all
      (select i.order_item_id, i.product_id, i.product_sale_unit_id, i.sale_unit_label, i.sale_unit_ratio,
        sum(i.quantity_delivered), sum(i.quantity_in_base_unit), i.unit_price, sum(i.line_total)
       from public.delivery_note_items i join public.delivery_notes n on n.id = i.delivery_note_id
       where n.organization_id = p_organization_id and n.customer_id = dn.customer_id
         and n.delivery_date = dn.delivery_date and n.warehouse_id = dn.warehouse_id and n.status = 'confirmed'
       group by i.order_item_id, i.product_id, i.product_sale_unit_id, i.sale_unit_label, i.sale_unit_ratio, i.unit_price
       except
       select i.id, i.product_id, i.product_sale_unit_id, i.sale_unit_label, i.sale_unit_ratio,
        i.quantity, i.quantity_in_base_unit, i.unit_price, i.line_total from public.order_items i where i.order_id = any(os.ids))
    )
  from public.delivery_notes dn
  cross join lateral (
    select array_agg(o.id order by o.id) ids, coalesce(jsonb_agg(to_jsonb(o) order by o.id), '[]'::jsonb) snapshot
    from public.orders o where o.organization_id = p_organization_id and o.customer_id = dn.customer_id
      and o.order_date = dn.delivery_date and o.warehouse_id = dn.warehouse_id and o.status <> 'cancelled'
  ) os
  cross join lateral (select coalesce(jsonb_agg(to_jsonb(i) order by i.id), '[]'::jsonb) snapshot
    from public.order_items i where i.order_id = any(os.ids)) oi
  cross join lateral (select coalesce(jsonb_agg(to_jsonb(i) order by i.id), '[]'::jsonb) snapshot
    from public.delivery_note_items i where i.delivery_note_id = dn.id) di
  where dn.organization_id = p_organization_id and dn.status = 'confirmed'
    and (p_note_ids is null or dn.id = any(p_note_ids));
$$;
revoke all on function public.delivery_export_versions(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.delivery_export_versions(uuid, uuid[]) to service_role;
