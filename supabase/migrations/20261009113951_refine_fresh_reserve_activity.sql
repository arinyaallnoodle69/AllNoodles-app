create or replace function public.record_fresh_reserve_activity(
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
 source:=case when p_reason='customer' then 'customer:'||p_special::text when p_order is not null then 'order:'||p_order::text else 'special:'||p_special::text end;
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
   elsif p_reason='customer' then
     select coalesce(sum(q.quantity),0) into quantity
       from public.fresh_reserve_order_quantities(p_org,p_date,p.id) q
       join public.orders o on o.id=q.order_id where o.customer_id=p_special;
     select c.name into name from public.customers c where c.id=p_special and c.organization_id=p_org;
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
       available_after=available,reason=case when abs(demand-existing.pending_demand)>0.000001 then p_reason else existing.reason end,updated_at=clock_timestamp()
       where id=existing.id;
     delete from public.fresh_reserve_activity where id=existing.id
       and abs(demand_change)<0.000001 and abs(reserve_change)<0.000001;
   end if;
 end loop;
end;
$$;

create or replace function public.capture_fresh_reserve_order_change()
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
   reason:=case when TG_OP='DELETE' then 'cancel' when new.status='cancelled' then 'cancel' when (new.order_date,new.warehouse_id,new.assigned_vehicle_id,new.customer_id) is distinct from (old.order_date,old.warehouse_id,old.assigned_vehicle_id,old.customer_id) then 'transfer' else 'order' end;
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
   for r in select distinct organization_id,order_date from public.orders where customer_id=old.id
     and status<>'cancelled' and (warehouse_id is null or assigned_vehicle_id is null) order by order_date loop
     perform public.record_fresh_reserve_activity(r.organization_id,r.order_date,null,old.id,null,phase,'customer');
   end loop;
 end if;
 if TG_OP='DELETE' then return old; end if;
 return new;
end;
$$;
