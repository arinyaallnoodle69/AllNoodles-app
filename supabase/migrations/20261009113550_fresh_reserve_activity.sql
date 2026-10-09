create table public.fresh_reserve_activity (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  order_date date not null,
  product_id uuid not null,
  order_id uuid,
  source_key text not null,
  transaction_id bigint not null,
  customer_name text not null,
  reason text not null,
  before_quantity numeric,
  after_quantity numeric not null,
  demand_change numeric default 0,
  reserve_change numeric default 0,
  available_after numeric,
  pending_demand numeric not null,
  pending_available numeric not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (organization_id, order_date, product_id, source_key, transaction_id)
);
create index fresh_reserve_activity_latest on public.fresh_reserve_activity(organization_id,order_date,updated_at desc);
alter table public.fresh_reserve_activity enable row level security;
revoke all on public.fresh_reserve_activity from public,anon,authenticated;
grant select,insert,update,delete on public.fresh_reserve_activity to service_role;
create policy fresh_reserve_activity_service on public.fresh_reserve_activity to service_role using (true) with check (true);

create function public.fresh_reserve_order_quantities(p_org uuid,p_date date,p_product uuid)
returns table(order_id uuid,vehicle_id uuid,quantity numeric)
language sql volatile security invoker set search_path=''
as $$
 select o.id,coalesce(d.vehicle_id,o.assigned_vehicle_id,c.default_vehicle_id),sum(i.quantity_in_base_unit)
 from public.orders o
 join public.customers c on c.id=o.customer_id and c.organization_id=o.organization_id
 join public.order_items i on i.order_id=o.id and i.organization_id=o.organization_id and i.product_id=p_product
 left join lateral (
   select n.warehouse_id,n.vehicle_id from public.delivery_notes n
   where n.order_id=o.id and n.organization_id=o.organization_id and n.status<>'cancelled'
   order by n.created_at,n.id limit 1
 ) d on true
 join public.warehouses w on w.id=coalesce(d.warehouse_id,o.warehouse_id,c.default_warehouse_id)
   and w.organization_id=o.organization_id and trim(w.name)='คลังกรุงเทพ'
 join public.product_warehouse_fulfillment_modes m on m.organization_id=o.organization_id
   and m.product_id=i.product_id and m.warehouse_id=w.id and m.mode='fresh'
 where o.organization_id=p_org and o.order_date=p_date and o.status<>'cancelled'
 group by o.id,coalesce(d.vehicle_id,o.assigned_vehicle_id,c.default_vehicle_id);
$$;

create function public.fresh_reserve_current_demand(p_org uuid,p_date date,p_product uuid)
returns numeric language sql volatile security invoker set search_path=''
as $$
 with quantities as (
   select vehicle_id,quantity from public.fresh_reserve_order_quantities(p_org,p_date,p_product)
   union all
   select s.vehicle_id,s.quantity from public.daily_order_special_items s
   where s.organization_id=p_org and s.entry_date=p_date and s.product_id=p_product and s.entry_type='office'
     and exists(select 1 from public.product_warehouse_fulfillment_modes m join public.warehouses w on w.id=m.warehouse_id
       where m.organization_id=p_org and m.product_id=p_product and m.mode='fresh' and trim(w.name)='คลังกรุงเทพ')
 ), by_vehicle as (select vehicle_id,sum(quantity) as quantity from quantities group by vehicle_id),
 remaining as (
   select vehicle_id,sum(quantity) as quantity from public.daily_order_special_items
   where organization_id=p_org and entry_date=p_date and product_id=p_product and entry_type='remaining'
   group by vehicle_id
 )
 select coalesce(sum(greatest(0,b.quantity-coalesce(r.quantity,0))),0)
 from by_vehicle b left join remaining r on r.vehicle_id=b.vehicle_id;
$$;

create function public.record_fresh_reserve_activity(
  p_org uuid,p_date date,p_order uuid,p_special uuid,p_product uuid,p_phase text,p_reason text
) returns void language plpgsql volatile security invoker set search_path=''
as $$
declare
 p record; adjustment jsonb; demand numeric; capacity numeric; available numeric;
 quantity numeric; source text; name text; existing public.fresh_reserve_activity%rowtype;
begin
 if p_org is null or p_date is null then return; end if;
 if not exists(select 1 from public.products where organization_id=p_org
   and sku in ('ANP180','ANP181','ANP182') and metadata#>array['factory_order_adjustments',p_date::text] is not null) then return; end if;
 -- Serialize demand snapshots for a day without locking unrelated order rows.
 perform pg_advisory_xact_lock(hashtextextended('fresh-reserve:'||p_org::text||':'||p_date::text,0));
 source:=case when p_order is not null then 'order:'||p_order::text else 'special:'||p_special::text end;
 for p in select id,metadata from public.products where organization_id=p_org
   and sku in ('ANP180','ANP181','ANP182') and (p_product is null or id=p_product) order by id loop
   adjustment:=p.metadata#>array['factory_order_adjustments',p_date::text];
   if adjustment is null then continue; end if;
   demand:=public.fresh_reserve_current_demand(p_org,p_date,p.id);
   capacity:=(adjustment->>'adjustedQuantity')::numeric+(adjustment->>'remainingQuantity')::numeric;
   available:=greatest(0,capacity-demand);
   if p_order is not null then
     select coalesce(sum(q.quantity),0) into quantity
       from public.fresh_reserve_order_quantities(p_org,p_date,p.id) q where q.order_id=p_order;
     select c.name into name from public.orders o join public.customers c on c.id=o.customer_id where o.id=p_order;
   else
     select coalesce(sum(s.quantity),0) into quantity from public.daily_order_special_items s
       where s.id=p_special and s.organization_id=p_org and s.entry_date=p_date and s.product_id=p.id;
     name:='รายการพิเศษ';
   end if;
   if p_phase='before' then
     insert into public.fresh_reserve_activity(organization_id,order_date,product_id,order_id,source_key,transaction_id,
       customer_name,reason,before_quantity,after_quantity,available_after,pending_demand,pending_available)
     values(p_org,p_date,p.id,p_order,source,txid_current(),coalesce(name,'ลูกค้า'),p_reason,quantity,quantity,available,demand,available)
     on conflict(organization_id,order_date,product_id,source_key,transaction_id)
       do update set pending_demand=excluded.pending_demand,pending_available=excluded.pending_available;
   else
     select * into existing from public.fresh_reserve_activity where organization_id=p_org and order_date=p_date
       and product_id=p.id and source_key=source and transaction_id=txid_current() for update;
     if not found then continue; end if;
     update public.fresh_reserve_activity set after_quantity=quantity,
       demand_change=existing.demand_change+demand-existing.pending_demand,
       reserve_change=existing.reserve_change+existing.pending_available-available,
       available_after=available,reason=p_reason,updated_at=clock_timestamp()
       where id=existing.id;
     delete from public.fresh_reserve_activity where id=existing.id
       and abs(demand_change)<0.000001 and abs(reserve_change)<0.000001;
   end if;
 end loop;
end;
$$;

create function public.capture_fresh_reserve_order_change()
returns trigger language plpgsql security definer set search_path=''
as $$
declare r record; phase text:=lower(TG_WHEN); o record; reason text;
begin
 if TG_TABLE_NAME='order_items' then
   if TG_OP='UPDATE' and (old.order_id,old.product_id,old.quantity_in_base_unit) is not distinct from
     (new.order_id,new.product_id,new.quantity_in_base_unit) then return new; end if;
   if TG_OP<>'INSERT' then
     select organization_id,order_date into o from public.orders where id=old.order_id;
     perform public.record_fresh_reserve_activity(o.organization_id,o.order_date,old.order_id,null,old.product_id,phase,'order');
   end if;
   if TG_OP<>'DELETE' and (TG_OP='INSERT' or (new.order_id,new.product_id) is distinct from (old.order_id,old.product_id)) then
     select organization_id,order_date into o from public.orders where id=new.order_id;
     perform public.record_fresh_reserve_activity(o.organization_id,o.order_date,new.order_id,null,new.product_id,phase,'order');
   end if;
 elsif TG_TABLE_NAME='orders' then
   if TG_OP='UPDATE' and (old.status,old.order_date,old.warehouse_id,old.assigned_vehicle_id,old.customer_id) is not distinct from
     (new.status,new.order_date,new.warehouse_id,new.assigned_vehicle_id,new.customer_id) then return new; end if;
   reason:=case when TG_OP='DELETE' then 'cancel' when new.status='cancelled' then 'cancel' else 'order' end;
   perform public.record_fresh_reserve_activity(old.organization_id,old.order_date,old.id,null,null,phase,reason);
   if TG_OP='UPDATE' and new.order_date is distinct from old.order_date then
     perform public.record_fresh_reserve_activity(new.organization_id,new.order_date,new.id,null,null,phase,'transfer');
   end if;
 elsif TG_TABLE_NAME='delivery_notes' then
   if TG_OP='UPDATE' and (old.order_id,old.warehouse_id,old.vehicle_id,old.status) is not distinct from
     (new.order_id,new.warehouse_id,new.vehicle_id,new.status) then return new; end if;
   if TG_OP<>'INSERT' then
     select organization_id,order_date into o from public.orders where id=old.order_id;
     perform public.record_fresh_reserve_activity(o.organization_id,o.order_date,old.order_id,null,null,phase,'transfer');
   end if;
   if TG_OP<>'DELETE' and (TG_OP='INSERT' or new.order_id is distinct from old.order_id) then
     select organization_id,order_date into o from public.orders where id=new.order_id;
     perform public.record_fresh_reserve_activity(o.organization_id,o.order_date,new.order_id,null,null,phase,'transfer');
   end if;
 elsif TG_TABLE_NAME='daily_order_special_items' then
   if TG_OP='UPDATE' and (old.entry_date,old.product_id,old.vehicle_id,old.entry_type,old.quantity) is not distinct from
     (new.entry_date,new.product_id,new.vehicle_id,new.entry_type,new.quantity) then return new; end if;
   if TG_OP<>'INSERT' then perform public.record_fresh_reserve_activity(old.organization_id,old.entry_date,null,old.id,old.product_id,phase,'special'); end if;
   if TG_OP<>'DELETE' and (TG_OP='INSERT' or (new.entry_date,new.product_id) is distinct from (old.entry_date,old.product_id)) then
     perform public.record_fresh_reserve_activity(new.organization_id,new.entry_date,null,new.id,new.product_id,phase,'special');
   end if;
 elsif TG_TABLE_NAME='customers' then
   if (old.default_warehouse_id,old.default_vehicle_id) is not distinct from (new.default_warehouse_id,new.default_vehicle_id) then return new; end if;
   for r in select id,organization_id,order_date from public.orders where customer_id=old.id
     and status<>'cancelled' and (warehouse_id is null or assigned_vehicle_id is null) order by order_date,id loop
     perform public.record_fresh_reserve_activity(r.organization_id,r.order_date,r.id,null,null,phase,'transfer');
   end loop;
 end if;
 if TG_OP='DELETE' then return old; end if;
 return new;
end;
$$;
create trigger fresh_reserve_items_before before insert or update or delete on public.order_items for each row execute function public.capture_fresh_reserve_order_change();
create trigger fresh_reserve_items_after after insert or update or delete on public.order_items for each row execute function public.capture_fresh_reserve_order_change();
create trigger fresh_reserve_orders_before before update of status,order_date,warehouse_id,assigned_vehicle_id,customer_id or delete on public.orders for each row execute function public.capture_fresh_reserve_order_change();
create trigger fresh_reserve_orders_after after update of status,order_date,warehouse_id,assigned_vehicle_id,customer_id or delete on public.orders for each row execute function public.capture_fresh_reserve_order_change();
create trigger fresh_reserve_delivery_before before insert or update or delete on public.delivery_notes for each row execute function public.capture_fresh_reserve_order_change();
create trigger fresh_reserve_delivery_after after insert or update or delete on public.delivery_notes for each row execute function public.capture_fresh_reserve_order_change();
create trigger fresh_reserve_special_before before insert or update or delete on public.daily_order_special_items for each row execute function public.capture_fresh_reserve_order_change();
create trigger fresh_reserve_special_after after insert or update or delete on public.daily_order_special_items for each row execute function public.capture_fresh_reserve_order_change();
create trigger fresh_reserve_customers_before before update of default_warehouse_id,default_vehicle_id on public.customers for each row execute function public.capture_fresh_reserve_order_change();
create trigger fresh_reserve_customers_after after update of default_warehouse_id,default_vehicle_id on public.customers for each row execute function public.capture_fresh_reserve_order_change();

revoke all on function public.fresh_reserve_order_quantities(uuid,date,uuid) from public,anon,authenticated;
revoke all on function public.fresh_reserve_current_demand(uuid,date,uuid) from public,anon,authenticated;
revoke all on function public.record_fresh_reserve_activity(uuid,date,uuid,uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.capture_fresh_reserve_order_change() from public,anon,authenticated;
grant execute on function public.fresh_reserve_order_quantities(uuid,date,uuid),public.fresh_reserve_current_demand(uuid,date,uuid),
  public.record_fresh_reserve_activity(uuid,date,uuid,uuid,uuid,text,text),public.capture_fresh_reserve_order_change() to service_role;

-- Existing rows have no before-edit snapshot; preserve them as explicitly unknown history.
insert into public.fresh_reserve_activity(organization_id,order_date,product_id,order_id,source_key,transaction_id,
  customer_name,reason,before_quantity,after_quantity,demand_change,reserve_change,available_after,
  pending_demand,pending_available,created_at,updated_at)
select p.organization_id,a.key::date,p.id,q.order_id,'order:'||q.order_id::text,txid_current(),c.name,'legacy',
  null,q.quantity,null,null,null,0,0,t.changed_at,t.changed_at
from public.products p
cross join lateral jsonb_each(coalesce(p.metadata->'factory_order_adjustments','{}'::jsonb)) a
cross join lateral public.fresh_reserve_order_quantities(p.organization_id,a.key::date,p.id) q
join public.orders o on o.id=q.order_id
join public.customers c on c.id=o.customer_id
cross join lateral (select max(i.updated_at) changed_at from public.order_items i where i.order_id=q.order_id and i.product_id=p.id) t
where p.sku in ('ANP180','ANP181','ANP182')
  and t.changed_at>=coalesce(a.value->>'confirmedAt',a.value->>'updatedAt')::timestamptz;
