create table public.fresh_reserve_stock_groups (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 warehouse_id uuid not null references public.warehouses(id), supplier_id uuid not null references public.suppliers(id),
 vehicle_id uuid not null references public.vehicles(id), start_date date not null,
 initialized_at timestamptz not null default clock_timestamp(), initialized_by uuid references public.app_users(id),
 unique(organization_id,warehouse_id,supplier_id)
);
create table public.fresh_reserve_stock_openings (
 group_id uuid not null references public.fresh_reserve_stock_groups(id), product_id uuid not null references public.products(id),
 quantity numeric(15,3) not null check(quantity>=0), primary key(group_id,product_id)
);
create table public.fresh_reserve_stock_movements (
 id uuid primary key default gen_random_uuid(),group_id uuid not null references public.fresh_reserve_stock_groups(id),
 product_id uuid not null references public.products(id),special_item_id uuid,
 quantity_delta numeric(15,3) not null check(quantity_delta<>0),reason text not null check(reason in ('office','remaining')),
 effective_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),
 created_by uuid references public.app_users(id)
);
create index fresh_reserve_stock_balance on public.fresh_reserve_stock_movements(group_id,product_id,effective_at);
create index fresh_reserve_stock_history on public.fresh_reserve_stock_movements(group_id,created_at desc);
alter table public.fresh_reserve_stock_groups enable row level security;
alter table public.fresh_reserve_stock_openings enable row level security;
alter table public.fresh_reserve_stock_movements enable row level security;
revoke all on public.fresh_reserve_stock_groups,public.fresh_reserve_stock_openings,public.fresh_reserve_stock_movements from public,anon,authenticated;
grant select,insert,update,delete on public.fresh_reserve_stock_groups,public.fresh_reserve_stock_openings,public.fresh_reserve_stock_movements to service_role;
create policy reserve_groups_service on public.fresh_reserve_stock_groups to service_role using(true) with check(true);
create policy reserve_openings_service on public.fresh_reserve_stock_openings to service_role using(true) with check(true);
create policy reserve_movements_service on public.fresh_reserve_stock_movements to service_role using(true) with check(true);

create function public.initialize_fresh_reserve_stock(p_org uuid,p_user uuid,p_date date,p_rows jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare wh uuid; supplier uuid; vehicle uuid; g uuid; expected integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('special-orders:'||p_org::text,0));
 if p_date<>(clock_timestamp() at time zone 'Asia/Bangkok')::date then raise exception 'ตั้งยอดเริ่มต้นได้เฉพาะวันนี้ เพื่อไม่ให้นับรายการเก่าซ้ำ'; end if;
 if not exists(select 1 from public.app_users where id=p_user and organization_id=p_org and is_active and role in ('admin','member')) then raise exception 'ไม่มีสิทธิ์ตั้งยอด'; end if;
 select id into strict wh from public.warehouses where organization_id=p_org and trim(name)='คลังกรุงเทพ';
 select id into strict supplier from public.suppliers where organization_id=p_org and trim(name)='โรงงานมังกร';
 select id into strict vehicle from public.vehicles where organization_id=p_org and trim(name)='รถกรุงเทพ';
 if exists(select 1 from public.fresh_reserve_stock_groups where organization_id=p_org and warehouse_id=wh and supplier_id=supplier) then raise exception 'ตั้งยอดเริ่มต้นแล้ว กรุณาโหลดหน้าใหม่'; end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)=0 then raise exception 'กรุณากรอกยอดสินค้า'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r where jsonb_typeof(r->'quantity')<>'number' or r->'quantity' is null or (r->>'quantity')::numeric<0 or (r->>'quantity')::numeric>1000000000 or (r->>'productId') is null) then raise exception 'จำนวนสินค้าไม่ถูกต้อง'; end if;
 select count(*) into expected from public.product_warehouse_fulfillment_modes m join public.products p on p.id=m.product_id
 where m.organization_id=p_org and m.warehouse_id=wh and m.supplier_id=supplier and m.mode='fresh' and p.is_active and coalesce(p.metadata->>'deleted','false')<>'true';
 if jsonb_array_length(p_rows)<>expected or (select count(distinct r->>'productId') from jsonb_array_elements(p_rows) r)<>expected
 or exists(select 1 from jsonb_array_elements(p_rows) r where not exists(select 1 from public.product_warehouse_fulfillment_modes m join public.products p on p.id=m.product_id where m.organization_id=p_org and m.product_id=(r->>'productId')::uuid and m.warehouse_id=wh and m.supplier_id=supplier and m.mode='fresh' and p.is_active and coalesce(p.metadata->>'deleted','false')<>'true')) then raise exception 'กรุณากรอกยอดสินค้าทุกตัว รวมตัวที่ไม่มีของให้ใส่ 0'; end if;
 insert into public.fresh_reserve_stock_groups(organization_id,warehouse_id,supplier_id,vehicle_id,start_date,initialized_by) values(p_org,wh,supplier,vehicle,p_date,p_user) returning id into g;
 insert into public.fresh_reserve_stock_openings select g,(r->>'productId')::uuid,(r->>'quantity')::numeric from jsonb_array_elements(p_rows) r;
 -- Opening quantities already include past movements; only outstanding office receipts are carried forward.
 insert into public.fresh_reserve_stock_movements(group_id,product_id,special_item_id,quantity_delta,reason,effective_at,created_by)
 select g,s.product_id,s.id,s.quantity,'office',(s.entry_date+1)::timestamp at time zone 'Asia/Bangkok',s.created_by
 from public.daily_order_special_items s join public.fresh_reserve_stock_openings o on o.group_id=g and o.product_id=s.product_id
 where s.organization_id=p_org and s.vehicle_id=vehicle and s.entry_type='office' and s.entry_date>=p_date;
 return g;
end $$;

create function public.capture_fresh_reserve_stock_special()
returns trigger language plpgsql security definer set search_path='' as $$
declare g record; r record; d numeric; balance numeric; effective timestamptz;
begin
 if TG_OP='UPDATE' and (old.entry_date,old.entry_type,old.vehicle_id,old.product_id,old.quantity) is not distinct from
 (new.entry_date,new.entry_type,new.vehicle_id,new.product_id,new.quantity) then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended('special-orders:'||coalesce(new.organization_id,old.organization_id)::text,0));
 for r in select org,entry_day,kind,vehicle,product,source,actor,sum(qty*multiplier) qty from (
 select old.organization_id org,old.entry_date entry_day,old.entry_type kind,old.vehicle_id vehicle,old.product_id product,old.quantity qty,old.id source,old.created_by actor,-1 multiplier where TG_OP<>'INSERT'
 union all
 select new.organization_id,new.entry_date,new.entry_type,new.vehicle_id,new.product_id,new.quantity,new.id,new.created_by,1 where TG_OP<>'DELETE') changes group by org,entry_day,kind,vehicle,product,source,actor having sum(qty*multiplier)<>0 loop
 for g in select a.* from public.fresh_reserve_stock_groups a join public.fresh_reserve_stock_openings o on o.group_id=a.id and o.product_id=r.product
 where a.organization_id=r.org and a.vehicle_id=r.vehicle and r.entry_day>=a.start_date and r.kind in ('remaining','office') loop
 d:=r.qty*case when r.kind='remaining' then -1 else 1 end;
 effective:=case when r.kind='office' then greatest(clock_timestamp(),(r.entry_day+1)::timestamp at time zone 'Asia/Bangkok') else clock_timestamp() end;
 insert into public.fresh_reserve_stock_movements(group_id,product_id,special_item_id,quantity_delta,reason,effective_at,created_by)
 values(g.id,r.product,r.source,d,r.kind,effective,r.actor);
 end loop;
 end loop;
 -- Check the final row change, not the transient undo/reapply amounts during edits.
 for g in select a.id from public.fresh_reserve_stock_groups a where a.organization_id=coalesce(new.organization_id,old.organization_id) loop
 select min(b.qty) into balance from (
 select o.quantity+coalesce(sum(m.quantity_delta) filter(where m.effective_at<=clock_timestamp()),0) qty
 from public.fresh_reserve_stock_openings o left join public.fresh_reserve_stock_movements m on m.group_id=o.group_id and m.product_id=o.product_id
 where o.group_id=g.id group by o.product_id,o.quantity) b;
 if balance<0 then raise exception 'ของสำรองไม่พอ หรือรายการรับเข้าที่แก้ถูกใช้ไปแล้ว กรุณาตรวจยอดคงเหลือ'; end if;
 end loop;
 if TG_OP='DELETE' then return old; end if; return new;
end $$;
create trigger reserve_stock_special_after after insert or update or delete on public.daily_order_special_items for each row execute function public.capture_fresh_reserve_stock_special();

create function public.save_daily_special_items_atomic(p_org uuid,p_user uuid,p_date date,p_items jsonb,p_expected jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare actual jsonb; expected jsonb; row record;
begin
 perform pg_advisory_xact_lock(hashtextextended('special-orders:'||p_org::text,0));
 if not exists(select 1 from public.app_users where id=p_user and organization_id=p_org and is_active and role in ('admin','member')) then raise exception 'ไม่มีสิทธิ์บันทึก'; end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_typeof(p_expected)<>'array' then raise exception 'รายการไม่ถูกต้อง'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('productId',product_id,'vehicleId',vehicle_id,'type',entry_type,'quantity',quantity) order by entry_type,vehicle_id,product_id),'[]'::jsonb) into actual from public.daily_order_special_items where organization_id=p_org and entry_date=p_date;
 select coalesce(jsonb_agg(r order by r->>'type',r->>'vehicleId',r->>'productId'),'[]'::jsonb) into expected from jsonb_array_elements(p_expected) r;
 if actual<>expected then raise exception 'รายการวันนี้มีคนแก้แล้ว กรุณาโหลดหน้าใหม่ก่อนบันทึก'; end if;
 if exists(select 1 from jsonb_array_elements(p_items) r where r->>'type' not in ('office','remaining','claim') or r->>'type' is null or jsonb_typeof(r->'quantity')<>'number' or r->'quantity' is null or (r->>'quantity')::numeric<=0 or (r->>'quantity')::numeric>1000000000
 or not exists(select 1 from public.products p where p.id=(r->>'productId')::uuid and p.organization_id=p_org and p.is_active)
 or not exists(select 1 from public.vehicles v where v.id=(r->>'vehicleId')::uuid and v.organization_id=p_org)
 or (r->>'type'='remaining' and not exists(select 1 from public.product_warehouse_fulfillment_modes m where m.organization_id=p_org and m.product_id=(r->>'productId')::uuid and m.mode='fresh'))) then raise exception 'สินค้า รถ หรือจำนวนไม่ถูกต้อง'; end if;
 if (select count(*) from jsonb_array_elements(p_items))<>(select count(distinct (r->>'type',r->>'vehicleId',r->>'productId')) from jsonb_array_elements(p_items) r) then raise exception 'รายการสินค้าซ้ำ'; end if;
 -- Refund removed/reduced withdrawals before increasing other withdrawals.
 delete from public.daily_order_special_items s where s.organization_id=p_org and s.entry_date=p_date and s.entry_type='remaining' and not exists(select 1 from jsonb_array_elements(p_items) r where r->>'type'=s.entry_type and (r->>'vehicleId')::uuid=s.vehicle_id and (r->>'productId')::uuid=s.product_id);
 for row in select s.id,(r->>'quantity')::numeric qty from public.daily_order_special_items s join jsonb_array_elements(p_items) r on r->>'type'=s.entry_type and (r->>'vehicleId')::uuid=s.vehicle_id and (r->>'productId')::uuid=s.product_id where s.organization_id=p_org and s.entry_date=p_date and s.entry_type='remaining' and (r->>'quantity')::numeric<s.quantity loop
 update public.daily_order_special_items set quantity=row.qty where id=row.id;
 end loop;
 for row in select r from jsonb_array_elements(p_items) r order by case when r->>'type'='office' then 0 else 1 end loop
 insert into public.daily_order_special_items(organization_id,entry_date,entry_type,vehicle_id,product_id,quantity,created_by)
 values(p_org,p_date,row.r->>'type',(row.r->>'vehicleId')::uuid,(row.r->>'productId')::uuid,(row.r->>'quantity')::numeric,p_user)
 on conflict(organization_id,entry_date,entry_type,vehicle_id,product_id) do update set quantity=excluded.quantity where public.daily_order_special_items.quantity is distinct from excluded.quantity;
 end loop;
 delete from public.daily_order_special_items s where s.organization_id=p_org and s.entry_date=p_date and not exists(select 1 from jsonb_array_elements(p_items) r where r->>'type'=s.entry_type and (r->>'vehicleId')::uuid=s.vehicle_id and (r->>'productId')::uuid=s.product_id);
end $$;

create view public.fresh_reserve_stock_balances with(security_invoker=true) as
select g.organization_id,o.group_id,o.product_id,o.quantity opening_quantity,
o.quantity+coalesce(sum(m.quantity_delta) filter(where m.effective_at<=clock_timestamp()),0) available,
coalesce(sum(m.quantity_delta) filter(where m.effective_at>clock_timestamp()),0) pending,
min(m.effective_at) filter(where m.effective_at>clock_timestamp()) pending_at
from public.fresh_reserve_stock_openings o join public.fresh_reserve_stock_groups g on g.id=o.group_id
left join public.fresh_reserve_stock_movements m on m.group_id=o.group_id and m.product_id=o.product_id
group by g.organization_id,o.group_id,o.product_id,o.quantity;
revoke all on public.fresh_reserve_stock_balances from public,anon,authenticated;
grant select on public.fresh_reserve_stock_balances to service_role;
revoke all on function public.initialize_fresh_reserve_stock(uuid,uuid,date,jsonb),public.capture_fresh_reserve_stock_special(),public.save_daily_special_items_atomic(uuid,uuid,date,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.initialize_fresh_reserve_stock(uuid,uuid,date,jsonb),public.capture_fresh_reserve_stock_special(),public.save_daily_special_items_atomic(uuid,uuid,date,jsonb,jsonb) to service_role;
