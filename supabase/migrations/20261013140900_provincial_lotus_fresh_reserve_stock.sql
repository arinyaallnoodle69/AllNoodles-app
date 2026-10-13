-- Provincial reserve belongs to the warehouse, across all its vehicles.
alter table public.fresh_reserve_stock_groups alter column vehicle_id drop not null;

create view public.provincial_fresh_reserve_stock_balances with (security_invoker=true) as
select g.organization_id,g.id group_id,o.product_id,o.quantity opening_quantity,
  o.quantity+coalesce(receipts.quantity,0)-coalesce(demand.quantity,0) available,
  coalesce(demand.quantity,0) ordered_quantity,
  0::numeric pending,null::timestamptz pending_at
from public.fresh_reserve_stock_groups g
join public.warehouses w on w.id=g.warehouse_id and w.name='คลังต่างจังหวัด'
join public.suppliers s on s.id=g.supplier_id and s.supplier_code='TYV005'
join public.fresh_reserve_stock_openings o on o.group_id=g.id
join public.product_warehouse_fulfillment_modes mode on mode.organization_id=g.organization_id
  and mode.product_id=o.product_id and mode.warehouse_id=g.warehouse_id
  and mode.supplier_id=g.supplier_id and mode.mode='fresh'
left join lateral (
  select sum(m.quantity_delta) quantity from public.fresh_reserve_stock_movements m
  where m.group_id=g.id and m.product_id=o.product_id and m.reason='office'
) receipts on true
left join lateral (
  select sum(i.quantity_in_base_unit) quantity from public.orders ord
  join public.order_items i on i.order_id=ord.id and i.organization_id=ord.organization_id
  where ord.organization_id=g.organization_id and ord.warehouse_id=g.warehouse_id
    and ord.order_date>=g.start_date and ord.status in ('submitted','confirmed') and i.product_id=o.product_id
) demand on true;
revoke all on public.provincial_fresh_reserve_stock_balances from public,anon,authenticated;
grant select on public.provincial_fresh_reserve_stock_balances to service_role;

create function public.initialize_provincial_fresh_reserve_stock(p_org uuid,p_user uuid,p_date date,p_rows jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare wh uuid; supplier uuid; g uuid; expected integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('special-orders:'||p_org::text,0));
  if p_date<>(clock_timestamp() at time zone 'Asia/Bangkok')::date then raise exception 'ตั้งยอดเริ่มต้นได้เฉพาะวันนี้'; end if;
  if not exists(select 1 from public.app_users where id=p_user and organization_id=p_org and is_active and role in ('admin','member')) then raise exception 'ไม่มีสิทธิ์ตั้งยอด'; end if;
  select id into strict wh from public.warehouses where organization_id=p_org and name='คลังต่างจังหวัด';
  select id into strict supplier from public.suppliers where organization_id=p_org and supplier_code='TYV005';
  if exists(select 1 from public.fresh_reserve_stock_groups where organization_id=p_org and warehouse_id=wh and supplier_id=supplier) then raise exception 'ตั้งยอดเริ่มต้นแล้ว กรุณาโหลดหน้าใหม่'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)=0 then raise exception 'กรุณากรอกยอดสินค้า'; end if;
  if exists(select 1 from jsonb_array_elements(p_rows) r where jsonb_typeof(r->'quantity') is distinct from 'number' or (r->>'quantity')::numeric<0 or (r->>'quantity')::numeric>1000000000
    or (r->>'quantity')::numeric<>round((r->>'quantity')::numeric,3) or r->>'productId' is null) then raise exception 'จำนวนสินค้าไม่ถูกต้อง'; end if;
  select count(*) into expected from public.product_warehouse_fulfillment_modes m join public.products p on p.id=m.product_id
    where m.organization_id=p_org and m.warehouse_id=wh and m.supplier_id=supplier and m.mode='fresh'
      and p.is_active and coalesce(p.metadata->>'deleted','false')<>'true';
  if expected=0 then raise exception 'ยังไม่มีสินค้าผลิตสดของโรงงานดอกบัวในคลังต่างจังหวัด'; end if;
  if jsonb_array_length(p_rows)<>expected or (select count(distinct r->>'productId') from jsonb_array_elements(p_rows) r)<>expected
    or exists(select 1 from jsonb_array_elements(p_rows) r where not exists(select 1 from public.product_warehouse_fulfillment_modes m join public.products p on p.id=m.product_id
      where m.organization_id=p_org and m.product_id=(r->>'productId')::uuid and m.warehouse_id=wh and m.supplier_id=supplier and m.mode='fresh'
      and p.is_active and coalesce(p.metadata->>'deleted','false')<>'true')) then raise exception 'เลือกได้เฉพาะสินค้าผลิตสดโรงงานดอกบัวของคลังต่างจังหวัด'; end if;
  insert into public.fresh_reserve_stock_groups(organization_id,warehouse_id,supplier_id,vehicle_id,start_date,initialized_by)
    values(p_org,wh,supplier,null,p_date,p_user) returning id into g;
  insert into public.fresh_reserve_stock_openings select g,(r->>'productId')::uuid,(r->>'quantity')::numeric from jsonb_array_elements(p_rows) r;
  -- Opening is the physical supply before reserving today's orders; old receipts are already included.
  return g;
end $$;
revoke all on function public.initialize_provincial_fresh_reserve_stock(uuid,uuid,date,jsonb) from public,anon,authenticated;
grant execute on function public.initialize_provincial_fresh_reserve_stock(uuid,uuid,date,jsonb) to service_role;

create function public.capture_provincial_fresh_reserve_office()
returns trigger language plpgsql security definer set search_path='' as $$
declare r record; g record;
begin
  if TG_OP='UPDATE' and (old.entry_date,old.entry_type,old.vehicle_id,old.product_id,old.quantity) is not distinct from
    (new.entry_date,new.entry_type,new.vehicle_id,new.product_id,new.quantity) then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('special-orders:'||coalesce(new.organization_id,old.organization_id)::text,0));
  for r in select org,entry_day,vehicle,product,source,actor,sum(qty) qty from (
    select old.organization_id org,old.entry_date entry_day,old.vehicle_id vehicle,old.product_id product,old.id source,old.created_by actor,-old.quantity qty
      where TG_OP<>'INSERT' and old.entry_type='office'
    union all
    select new.organization_id,new.entry_date,new.vehicle_id,new.product_id,new.id,new.created_by,new.quantity
      where TG_OP<>'DELETE' and new.entry_type='office'
  ) changes group by org,entry_day,vehicle,product,source,actor having sum(qty)<>0 loop
    for g in select a.id from public.fresh_reserve_stock_groups a
      join public.warehouses w on w.id=a.warehouse_id and w.name='คลังต่างจังหวัด'
      join public.suppliers s on s.id=a.supplier_id and s.supplier_code='TYV005'
      join public.product_warehouse_fulfillment_modes m on m.organization_id=a.organization_id and m.warehouse_id=a.warehouse_id
        and m.supplier_id=a.supplier_id and m.product_id=r.product and m.mode='fresh'
      join public.vehicles v on v.id=r.vehicle and v.organization_id=a.organization_id and trim(v.name) not like 'รถกรุงเทพ%'
      where a.organization_id=r.org and r.entry_day>=a.start_date loop
      if not exists(select 1 from public.fresh_reserve_stock_openings where group_id=g.id and product_id=r.product) then raise exception 'สินค้านี้ยังไม่ได้ตั้งยอดสำรอง'; end if;
      insert into public.fresh_reserve_stock_movements(group_id,product_id,special_item_id,quantity_delta,reason,effective_at,created_by)
        values(g.id,r.product,r.source,r.qty,'office',clock_timestamp(),r.actor);
    end loop;
  end loop;
  if TG_OP='DELETE' then return old; end if; return new;
end $$;
revoke all on function public.capture_provincial_fresh_reserve_office() from public,anon,authenticated;
create trigger provincial_reserve_office_after after insert or update or delete on public.daily_order_special_items
  for each row execute function public.capture_provincial_fresh_reserve_office();
