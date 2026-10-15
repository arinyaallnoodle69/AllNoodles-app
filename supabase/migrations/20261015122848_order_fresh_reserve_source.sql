-- Existing items retain their previous accounting. Only new items resolve a source.
alter table public.order_items add column supply_source text not null default 'legacy'
  check (supply_source in ('legacy','auto','factory','reserve'));
alter table public.order_items alter column supply_source set default 'auto';
alter table public.order_items add column fresh_reserve_group_id uuid references public.fresh_reserve_stock_groups(id);
alter table public.fresh_reserve_stock_movements add column order_item_id uuid;
alter table public.fresh_reserve_stock_movements drop constraint fresh_reserve_stock_movements_reason_check;
alter table public.fresh_reserve_stock_movements add constraint fresh_reserve_stock_movements_reason_check
  check (reason in ('office','remaining','adjustment','order'));

create function public.resolve_fresh_supply_source(p_order uuid,p_product uuid,p_source text)
returns text language plpgsql security invoker set search_path='' as $$
declare o record; m record;
begin
  if p_source not in ('auto','factory','reserve') or p_source is null then raise exception 'แหล่งสินค้าไม่ถูกต้อง'; end if;
  select ord.*,w.name warehouse_name into strict o from public.orders ord join public.warehouses w on w.id=ord.warehouse_id where ord.id=p_order;
  select mode.*,s.name supplier_name,s.supplier_code into m from public.product_warehouse_fulfillment_modes mode
    join public.suppliers s on s.id=mode.supplier_id and s.organization_id=mode.organization_id
    where mode.organization_id=o.organization_id and mode.warehouse_id=o.warehouse_id and mode.product_id=p_product;
  if p_source='reserve' then
    if m.mode is distinct from 'fresh' or not ((o.warehouse_name='คลังกรุงเทพ' and m.supplier_name='โรงงานมังกร')
      or (o.warehouse_name='คลังต่างจังหวัด' and m.supplier_code='TYV005')) then raise exception 'เลือกสำรองได้เฉพาะผลิตสดมังกรกรุงเทพหรือดอกบัวต่างจังหวัด'; end if;
    return 'reserve';
  end if;
  if m.mode='fresh' and o.warehouse_name='คลังต่างจังหวัด' and m.supplier_code='TYV005'
    and extract(isodow from o.order_date) not in (1,4) then return 'reserve'; end if;
  return 'factory';
end $$;
revoke all on function public.resolve_fresh_supply_source(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.resolve_fresh_supply_source(uuid,uuid,text) to service_role;

create or replace view public.fresh_reserve_stock_balances with(security_invoker=true) as
select g.organization_id,o.group_id,o.product_id,o.quantity opening_quantity,
  o.quantity+coalesce(ledger.available,0)-coalesce(demand.quantity,0) available,
  coalesce(ledger.pending,0) pending,ledger.pending_at
from public.fresh_reserve_stock_openings o join public.fresh_reserve_stock_groups g on g.id=o.group_id
left join lateral (
  select sum(m.quantity_delta) filter(where m.effective_at<=clock_timestamp()) available,
    sum(m.quantity_delta) filter(where m.effective_at>clock_timestamp()) pending,
    min(m.effective_at) filter(where m.effective_at>clock_timestamp()) pending_at
  from public.fresh_reserve_stock_movements m where m.group_id=g.id and m.product_id=o.product_id and m.reason<>'order'
) ledger on true
left join lateral (
  select sum(i.quantity_in_base_unit) quantity from public.order_items i join public.orders ord on ord.id=i.order_id and ord.organization_id=i.organization_id
  where i.fresh_reserve_group_id=g.id and i.product_id=o.product_id and i.supply_source='reserve' and ord.status in ('submitted','confirmed')
) demand on true;

create or replace view public.provincial_fresh_reserve_stock_balances with(security_invoker=true) as
select g.organization_id,g.id group_id,o.product_id,o.quantity opening_quantity,
  o.quantity+coalesce(receipts.quantity,0)-coalesce(demand.quantity,0) available,
  coalesce(demand.quantity,0) ordered_quantity,0::numeric pending,null::timestamptz pending_at
from public.fresh_reserve_stock_groups g
join public.warehouses w on w.id=g.warehouse_id and w.name='คลังต่างจังหวัด'
join public.suppliers s on s.id=g.supplier_id and s.supplier_code='TYV005'
join public.fresh_reserve_stock_openings o on o.group_id=g.id
join public.product_warehouse_fulfillment_modes mode on mode.organization_id=g.organization_id
  and mode.product_id=o.product_id and mode.warehouse_id=g.warehouse_id and mode.supplier_id=g.supplier_id and mode.mode='fresh'
left join lateral (
  select sum(m.quantity_delta) quantity from public.fresh_reserve_stock_movements m
  where m.group_id=g.id and m.product_id=o.product_id and m.reason in ('office','adjustment')
) receipts on true
left join lateral (
  select sum(i.quantity_in_base_unit) quantity from public.orders ord join public.order_items i on i.order_id=ord.id and i.organization_id=ord.organization_id
  where ord.organization_id=g.organization_id and ord.warehouse_id=g.warehouse_id and ord.order_date>=g.start_date
    and ord.status in ('submitted','confirmed') and i.product_id=o.product_id
    and (i.supply_source='legacy' or (i.supply_source='reserve' and i.fresh_reserve_group_id=g.id))
) demand on true;

create function public.guard_fresh_reserve_item() returns trigger language plpgsql security definer set search_path='' as $$
declare o record; g uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('special-orders:'||coalesce(new.organization_id,old.organization_id)::text,0));
  if TG_OP='DELETE' then return old; end if;
  if TG_OP='UPDATE' and (new.supply_source,new.product_id,new.order_id,new.organization_id,new.fresh_reserve_group_id)
    is distinct from (old.supply_source,old.product_id,old.order_id,old.organization_id,old.fresh_reserve_group_id)
    then raise exception 'เปลี่ยนแหล่งสินค้าไม่ได้ กรุณาลบรายการเดิมแล้วเพิ่มใหม่'; end if;
  if TG_OP='INSERT' then
    new.supply_source:=public.resolve_fresh_supply_source(new.order_id,new.product_id,new.supply_source);
    new.fresh_reserve_group_id:=null;
  end if;
  if new.supply_source='reserve' then
    select * into strict o from public.orders where id=new.order_id and organization_id=new.organization_id;
    if not exists(select 1 from public.products where id=new.product_id and organization_id=new.organization_id and is_active)
      then raise exception 'สินค้าไม่ถูกต้อง'; end if;
    perform public.resolve_fresh_supply_source(new.order_id,new.product_id,'reserve');
    select a.id into g from public.fresh_reserve_stock_groups a
      join public.fresh_reserve_stock_openings op on op.group_id=a.id and op.product_id=new.product_id
      join public.product_warehouse_fulfillment_modes m on m.organization_id=a.organization_id and m.warehouse_id=a.warehouse_id
        and m.supplier_id=a.supplier_id and m.product_id=new.product_id and m.mode='fresh'
      where a.organization_id=o.organization_id and a.warehouse_id=o.warehouse_id and o.order_date>=a.start_date;
    if g is null then raise exception 'สินค้านี้ยังไม่ได้ตั้งยอดสต็อคสำรองของคลังนี้'; end if;
    if exists(select 1 from public.fresh_reserve_stock_groups a join public.daily_order_special_items s
      on s.organization_id=a.organization_id and s.vehicle_id=a.vehicle_id and s.product_id=new.product_id and s.entry_date=o.order_date and s.entry_type='remaining'
      where a.id=g) then raise exception 'สินค้านี้มีรายการของเหลือแล้ว กรุณาใช้วิธีหักสำรองเพียงวิธีเดียวเพื่อไม่ให้ตัดซ้ำ'; end if;
    if TG_OP='UPDATE' and old.fresh_reserve_group_id is distinct from g then raise exception 'คลังสำรองเปลี่ยน กรุณาโหลดใหม่'; end if;
    new.fresh_reserve_group_id:=g;
    if new.quantity is null or new.sale_unit_ratio is null or new.quantity_in_base_unit is null
      or new.quantity<=0 or new.sale_unit_ratio<=0 or new.quantity_in_base_unit is distinct from new.quantity*new.sale_unit_ratio
      or new.quantity_in_base_unit>1000000000 or new.quantity_in_base_unit::text in ('NaN','Infinity','-Infinity')
      or not exists(select 1 from public.product_sale_units u where u.id=new.product_sale_unit_id and u.product_id=new.product_id
        and u.organization_id=new.organization_id and u.is_active and u.base_unit_quantity=new.sale_unit_ratio)
      then raise exception 'จำนวนหรือหน่วยขายของสำรองไม่ถูกต้อง'; end if;
  end if;
  return new;
end $$;
create trigger fresh_supply_guard_before before insert or update or delete on public.order_items for each row execute function public.guard_fresh_reserve_item();

create function public.log_fresh_reserve_order_delta(p_group uuid,p_product uuid,p_item uuid,p_delta numeric,p_user uuid)
returns void language plpgsql security definer set search_path='' as $$
declare balance numeric;
begin
  if p_group is null or p_delta=0 then return; end if;
  select b.available into balance from public.fresh_reserve_stock_balances b where b.group_id=p_group and b.product_id=p_product;
  if exists(select 1 from public.fresh_reserve_stock_groups g join public.warehouses w on w.id=g.warehouse_id where g.id=p_group and w.name='คลังต่างจังหวัด') then
    select b.available into balance from public.provincial_fresh_reserve_stock_balances b where b.group_id=p_group and b.product_id=p_product;
  end if;
  if p_delta<0 and (balance is null or balance<0) then raise exception 'สต็อคสำรองไม่พอ กรุณาโหลดข้อมูลล่าสุดและลดจำนวน'; end if;
  insert into public.fresh_reserve_stock_movements(group_id,product_id,order_item_id,quantity_delta,reason,effective_at,created_by,quantity_after,quantity_before,notes)
    values(p_group,p_product,p_item,p_delta,'order',clock_timestamp(),p_user,balance,balance-p_delta,'ใช้ / คืนสำรองจากออเดอร์');
end $$;

create function public.capture_fresh_reserve_item_source() returns trigger language plpgsql security definer set search_path='' as $$
declare o record; before_qty numeric:=0; after_qty numeric:=0; g uuid; p uuid; item uuid;
begin
  select * into o from public.orders where id=coalesce(new.order_id,old.order_id);
  if o.status not in ('submitted','confirmed') or o.id is null then return coalesce(new,old); end if;
  if TG_OP<>'INSERT' and old.supply_source='reserve' then before_qty:=old.quantity_in_base_unit; end if;
  if TG_OP<>'DELETE' and new.supply_source='reserve' then after_qty:=new.quantity_in_base_unit; end if;
  g:=coalesce(new.fresh_reserve_group_id,old.fresh_reserve_group_id); p:=coalesce(new.product_id,old.product_id); item:=coalesce(new.id,old.id);
  perform public.log_fresh_reserve_order_delta(g,p,item,before_qty-after_qty,o.placed_by_user_id);
  return coalesce(new,old);
end $$;
create trigger fresh_supply_capture_after after insert or update or delete on public.order_items for each row execute function public.capture_fresh_reserve_item_source();

create function public.guard_fresh_reserve_order() returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('special-orders:'||old.organization_id::text,0));
  if exists(select 1 from public.order_items where order_id=old.id and supply_source='reserve') and
    (TG_OP='DELETE' or (new.warehouse_id,new.order_date,new.organization_id) is distinct from (old.warehouse_id,old.order_date,old.organization_id))
    then raise exception 'ออเดอร์มีรายการสำรอง กรุณายกเลิกหรือเอารายการสำรองออกก่อนเปลี่ยนวันหรือคลัง'; end if;
  if TG_OP='DELETE' then return old; end if;
  return new;
end $$;
create trigger fresh_supply_order_before before update or delete on public.orders for each row execute function public.guard_fresh_reserve_order();
create function public.capture_fresh_reserve_order_status() returns trigger language plpgsql security definer set search_path='' as $$
declare r record; multiplier integer;
begin
  multiplier:=(case when old.status in ('submitted','confirmed') then 1 else 0 end)-(case when new.status in ('submitted','confirmed') then 1 else 0 end);
  if multiplier<>0 then
    for r in select * from public.order_items where order_id=new.id and supply_source='reserve' loop
      perform public.log_fresh_reserve_order_delta(r.fresh_reserve_group_id,r.product_id,r.id,multiplier*r.quantity_in_base_unit,new.placed_by_user_id);
    end loop;
  end if;
  return new;
end $$;
create trigger fresh_supply_status_after after update of status on public.orders for each row execute function public.capture_fresh_reserve_order_status();

create function public.guard_reserve_remaining_overlap() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.entry_type<>'remaining' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('special-orders:'||new.organization_id::text,0));
  if exists(select 1 from public.fresh_reserve_stock_groups g join public.order_items i on i.fresh_reserve_group_id=g.id
    join public.orders o on o.id=i.order_id and o.status in ('submitted','confirmed') and o.order_date=new.entry_date
    where g.organization_id=new.organization_id and g.vehicle_id=new.vehicle_id and i.product_id=new.product_id and i.supply_source='reserve')
    then raise exception 'สินค้านี้หักสำรองจากออเดอร์แล้ว ไม่สามารถกรอกของเหลือซ้ำได้'; end if;
  return new;
end $$;
create trigger reserve_remaining_overlap_before before insert or update on public.daily_order_special_items for each row execute function public.guard_reserve_remaining_overlap();
revoke all on function public.guard_reserve_remaining_overlap() from public,anon,authenticated;

create function public.guard_reserve_delivery_warehouse() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.order_items i join public.orders o on o.id=i.order_id where o.id=new.order_id and i.supply_source='reserve'
    and new.warehouse_id is distinct from o.warehouse_id) then raise exception 'ใบส่งของต้องใช้คลังเดียวกับรายการสำรองในออเดอร์'; end if;
  return new;
end $$;
create trigger reserve_delivery_warehouse_before before insert or update on public.delivery_notes for each row execute function public.guard_reserve_delivery_warehouse();
revoke all on function public.guard_reserve_delivery_warehouse() from public,anon,authenticated;

revoke all on function public.guard_fresh_reserve_item(),public.log_fresh_reserve_order_delta(uuid,uuid,uuid,numeric,uuid),public.capture_fresh_reserve_item_source(),public.guard_fresh_reserve_order(),public.capture_fresh_reserve_order_status() from public,anon,authenticated;

create table public.manual_order_save_requests (
  organization_id uuid not null references public.organizations(id),request_id uuid not null,
  payload jsonb not null,order_id uuid not null references public.orders(id),created_at timestamptz not null default now(),
  primary key(organization_id,request_id)
);
alter table public.manual_order_save_requests enable row level security;
revoke all on public.manual_order_save_requests from public,anon,authenticated;
grant select,insert on public.manual_order_save_requests to service_role;
create policy manual_save_service on public.manual_order_save_requests to service_role using(true) with check(true);

create function public.save_manual_order_with_reserve(p_org uuid,p_user uuid,p_customer uuid,p_date date,p_notes text,p_channel text,p_items jsonb,p_request uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare existing record; saved record; v_order_id uuid; number text; payload jsonb;
begin
  if p_request is null or p_date is null or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)=0 then raise exception 'ข้อมูลออเดอร์ไม่ครบ'; end if;
  if not exists(select 1 from public.app_users where id=p_user and organization_id=p_org and is_active and role in ('admin','member')) then raise exception 'ไม่มีสิทธิ์บันทึก'; end if;
  payload:=jsonb_build_object('customer',p_customer,'date',p_date,'notes',p_notes,'channel',p_channel,'items',p_items,'user',p_user);
  perform pg_advisory_xact_lock(hashtextextended('special-orders:'||p_org::text,0));
  select * into existing from public.manual_order_save_requests where organization_id=p_org and request_id=p_request;
  if found then
    if existing.payload<>payload then raise exception 'คำขอบันทึกนี้ถูกใช้กับข้อมูลอื่นแล้ว กรุณาเปิดออเดอร์ใหม่'; end if;
    return jsonb_build_object('orderId',existing.order_id,'orderNumber',(select order_number from public.orders where id=existing.order_id),'replayed',true);
  end if;
  select c.default_warehouse_id into strict v_order_id from public.customers c where c.id=p_customer and c.organization_id=p_org and c.is_active;
  if v_order_id is null then raise exception 'ร้านค้ายังไม่กำหนดคลัง'; end if;
  select * into saved from public.orders where organization_id=p_org and customer_id=p_customer and warehouse_id=v_order_id and order_date=p_date and status<>'cancelled' order by created_at limit 1 for update;
  if found then
    v_order_id:=saved.id; number:=saved.order_number;
    update public.orders set notes=case when nullif(trim(p_notes),'') is null then notes when nullif(trim(notes),'') is null then p_notes when notes=p_notes then notes else notes||E'\n'||p_notes end where id=v_order_id;
  else
    number:=public.next_order_number(p_order_date=>p_date,p_organization_id=>p_org);
    insert into public.orders(organization_id,customer_id,warehouse_id,order_date,order_number,notes,metadata,placed_by_user_id,status,fulfillment_status,subtotal_amount,total_amount)
      values(p_org,p_customer,v_order_id,p_date,number,nullif(trim(p_notes),''),jsonb_build_object('channel',p_channel,'source','manual'),p_user,'submitted','pending',0,0) returning id into v_order_id;
  end if;
  perform public.merge_order_items_atomic(p_org,v_order_id,p_items,p_user,true);
  insert into public.manual_order_save_requests(organization_id,request_id,payload,order_id) values(p_org,p_request,payload,v_order_id);
  return jsonb_build_object('orderId',v_order_id,'orderNumber',number,'replayed',false);
end $$;
revoke all on function public.save_manual_order_with_reserve(uuid,uuid,uuid,date,text,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.save_manual_order_with_reserve(uuid,uuid,uuid,date,text,text,jsonb,uuid) to service_role;

-- Extend existing RPCs in place, preserving their signatures and grants.
do $patch$
declare definition text; updated text;
begin
  definition:=pg_get_functiondef('public.merge_order_items_atomic(uuid,uuid,jsonb,uuid,boolean)'::regprocedure);
  updated:=replace(definition,'barcode boolean;','barcode boolean; supply text;');
  updated:=replace(updated,'barcode := coalesce((j->>''isBarcode'')::boolean, false);',
    'barcode := coalesce((j->>''isBarcode'')::boolean, false); supply := public.resolve_fresh_supply_source(o.id,(j->>''productId'')::uuid,case when coalesce((j->>''isReserve'')::boolean,false) then ''reserve'' else ''auto'' end);');
  updated:=replace(updated,'and is_replacement = replacement and is_barcode = barcode;',
    'and is_replacement = replacement and is_barcode = barcode and supply_source = supply;');
  updated:=replace(updated,'is_replacement, is_barcode, notes)','is_replacement, is_barcode, supply_source, notes)');
  updated:=replace(updated,'replacement, barcode, case when replacement','replacement, barcode, supply, case when replacement');
  if updated=definition or position('supply_source = supply' in updated)=0 then raise exception 'Merge RPC definition changed; review required'; end if;
  execute updated;

  definition:=pg_get_functiondef('public.save_order_items_and_delivery(uuid,uuid,uuid,timestamptz,text,uuid[],jsonb,jsonb,jsonb,jsonb)'::regprocedure);
  updated:=replace(definition,'is_replacement, is_barcode, notes)','is_replacement, is_barcode, supply_source, notes)');
  updated:=replace(updated,'coalesce(r.is_barcode, false), r.notes','coalesce(r.is_barcode, false), coalesce(r.supply_source,''auto''), r.notes');
  if updated=definition then raise exception 'Edit RPC definition changed; review required'; end if;
  execute updated;

  definition:=pg_get_functiondef('public.capture_fresh_reserve_stock_special()'::regprocedure);
  updated:=regexp_replace(definition,'(?s)select min\(b\.qty\) into balance from \(.*?\) b;',
    'select min(available) into balance from public.fresh_reserve_stock_balances where group_id=g.id;');
  if updated=definition then raise exception 'Special RPC definition changed; review required'; end if;
  execute updated;

  definition:=pg_get_functiondef('public.fresh_reserve_order_quantities(uuid,date,uuid)'::regprocedure);
  updated:=replace(definition,'and i.product_id=p_product','and i.product_id=p_product and i.supply_source<>''reserve''');
  if updated=definition then raise exception 'Factory capacity RPC definition changed; review required'; end if;
  execute updated;
end $patch$;
