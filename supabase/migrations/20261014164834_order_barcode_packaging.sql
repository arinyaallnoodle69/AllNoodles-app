alter table public.order_items add column is_barcode boolean not null default false;
comment on column public.order_items.is_barcode is 'บรรจุภัณฑ์บาร์โค้ด แยกจากสินค้าปกติของร้าน ANS109';

create function public.guard_order_barcode_packaging()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.is_barcode then
    if new.is_replacement or not exists(
      select 1 from public.orders o join public.customers c on c.id=o.customer_id and c.organization_id=o.organization_id
      join public.products p on p.id=new.product_id and p.organization_id=o.organization_id
      where o.id=new.order_id and o.organization_id=new.organization_id and c.customer_code='ANS109'
        and p.sku in ('ANP137','ANP138','ANP139','ANP140','ANP146','ANP115','ANP229','ANP119','ANP136','ANP088','ANP087','ANP052','ANP054','ANP109')
    ) then raise exception 'บาร์โค้ดใช้ได้เฉพาะร้าน ANS109 และสินค้าที่กำหนด ไม่ใช่ส่งชดเชย'; end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_order_barcode_packaging() from public,anon,authenticated;
create trigger order_barcode_packaging_before before insert or update on public.order_items
for each row execute function public.guard_order_barcode_packaging();

CREATE OR REPLACE FUNCTION public.merge_order_items_atomic(p_organization_id uuid, p_order_id uuid, p_items jsonb, p_user_id uuid DEFAULT NULL::uuid, p_sync_delivery boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  o public.orders%rowtype;
  j jsonb;
  primary_id uuid;
  qty numeric;
  base_qty numeric;
  amount numeric;
  replacement boolean;
  barcode boolean;
begin
  select * into strict o from public.orders where id = p_order_id and organization_id = p_organization_id;
  perform pg_advisory_xact_lock(hashtext(p_organization_id::text || ':' || o.customer_id::text || ':' || o.warehouse_id::text || ':' || o.order_date::text));
  perform 1 from public.orders where id = o.id for update;
  if o.status = 'cancelled' then raise exception 'ออเดอร์ถูกยกเลิกแล้ว'; end if;
  for j in select value from jsonb_array_elements(p_items) loop
    replacement := coalesce((j->>'isReplacement')::boolean, false);
    barcode := coalesce((j->>'isBarcode')::boolean, false);
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
      and is_replacement = replacement and is_barcode = barcode;
    qty := qty + (j->>'quantity')::numeric;
    base_qty := base_qty + (j->>'quantityInBaseUnit')::numeric;
    amount := case when replacement then 0 else amount + (j->>'quantity')::numeric * (j->>'unitPrice')::numeric end;
    if primary_id is null then
      insert into public.order_items(organization_id, order_id, product_id, product_sale_unit_id, quantity,
        quantity_in_base_unit, sale_unit_label, sale_unit_ratio, unit_price, line_total, cost_price, is_replacement, is_barcode, notes)
      values(p_organization_id, o.id, (j->>'productId')::uuid, (j->>'productSaleUnitId')::uuid, qty, base_qty,
        j->>'saleUnitLabel', (j->>'saleUnitRatio')::numeric, amount / qty, amount, (j->>'costPrice')::numeric,
        replacement, barcode, case when replacement then 'ส่งชดเชย (ไม่คิดเงิน)' end);
    else
      delete from public.order_items where order_id = o.id and id <> primary_id
        and product_id = (j->>'productId')::uuid and product_sale_unit_id is not distinct from (j->>'productSaleUnitId')::uuid
        and is_replacement = replacement and is_barcode = barcode;
      update public.order_items set quantity = qty, quantity_in_base_unit = base_qty, line_total = amount,
        unit_price = amount / qty, sale_unit_label = j->>'saleUnitLabel', sale_unit_ratio = (j->>'saleUnitRatio')::numeric,
        cost_price = coalesce(nullif((j->>'costPrice')::numeric, 0), cost_price) where id = primary_id;
    end if;
  end loop;
  if p_sync_delivery then
    perform public.sync_order_delivery_current(p_organization_id, o.id, p_user_id);
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.save_order_items_and_delivery(p_organization_id uuid, p_order_id uuid, p_user_id uuid, p_expected_updated_at timestamp with time zone, p_notes text, p_removed_ids uuid[], p_updates jsonb, p_additions jsonb, p_prices jsonb, p_loss_by_order_item jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      quantity_in_base_unit, sale_unit_label, sale_unit_ratio, unit_price, line_total, cost_price, is_replacement, is_barcode, notes)
    values(p_organization_id, o.id, r.product_id, r.product_sale_unit_id, r.quantity,
      r.quantity * r.sale_unit_ratio, r.sale_unit_label, r.sale_unit_ratio, r.unit_price,
      r.quantity * r.unit_price, r.cost_price, coalesce(r.is_replacement, false), coalesce(r.is_barcode, false), r.notes);
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
end $function$
;

