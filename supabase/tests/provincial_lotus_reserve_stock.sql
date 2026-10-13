begin;
create temp table fresh_reserve_stock_groups as select * from public.fresh_reserve_stock_groups with no data;
create temp table warehouses as select * from public.warehouses with no data;
create temp table suppliers as select * from public.suppliers with no data;
create temp table fresh_reserve_stock_openings as select * from public.fresh_reserve_stock_openings with no data;
create temp table product_warehouse_fulfillment_modes as select * from public.product_warehouse_fulfillment_modes with no data;
create temp table fresh_reserve_stock_movements as select * from public.fresh_reserve_stock_movements with no data;
create temp table orders as select * from public.orders with no data;
create temp table order_items as select * from public.order_items with no data;
create temp table vehicles as select * from public.vehicles with no data;
create temp table daily_order_special_items as select * from public.daily_order_special_items with no data;
create temp table app_users as select * from public.app_users with no data;
create temp table products as select * from public.products with no data;
create view pg_temp.provincial_fresh_reserve_stock_balances with (security_invoker=true) as
select g.organization_id,g.id group_id,o.product_id,o.quantity opening_quantity,
  o.quantity+coalesce(receipts.quantity,0)-coalesce(demand.quantity,0) available,
  coalesce(demand.quantity,0) ordered_quantity,
  0::numeric pending,null::timestamptz pending_at
from pg_temp.fresh_reserve_stock_groups g
join pg_temp.warehouses w on w.id=g.warehouse_id and w.name='คลังต่างจังหวัด'
join pg_temp.suppliers s on s.id=g.supplier_id and s.supplier_code='TYV005'
join pg_temp.fresh_reserve_stock_openings o on o.group_id=g.id
join pg_temp.product_warehouse_fulfillment_modes mode on mode.organization_id=g.organization_id
  and mode.product_id=o.product_id and mode.warehouse_id=g.warehouse_id
  and mode.supplier_id=g.supplier_id and mode.mode='fresh'
left join lateral (
  select sum(m.quantity_delta) quantity from pg_temp.fresh_reserve_stock_movements m
  where m.group_id=g.id and m.product_id=o.product_id and m.reason in ('office','adjustment')
) receipts on true
left join lateral (
  select sum(i.quantity_in_base_unit) quantity from pg_temp.orders ord
  join pg_temp.order_items i on i.order_id=ord.id and i.organization_id=ord.organization_id
  where ord.organization_id=g.organization_id and ord.warehouse_id=g.warehouse_id
    and ord.order_date>=g.start_date and ord.status in ('submitted','confirmed') and i.product_id=o.product_id
) demand on true;

create function pg_temp.capture_provincial_fresh_reserve_office()
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
    for g in select a.id from pg_temp.fresh_reserve_stock_groups a
      join pg_temp.warehouses w on w.id=a.warehouse_id and w.name='คลังต่างจังหวัด'
      join pg_temp.suppliers s on s.id=a.supplier_id and s.supplier_code='TYV005'
      join pg_temp.product_warehouse_fulfillment_modes m on m.organization_id=a.organization_id and m.warehouse_id=a.warehouse_id
        and m.supplier_id=a.supplier_id and m.product_id=r.product and m.mode='fresh'
      join pg_temp.vehicles v on v.id=r.vehicle and v.organization_id=a.organization_id and trim(v.name) not like 'รถกรุงเทพ%'
      where a.organization_id=r.org and r.entry_day>=a.start_date loop
      if not exists(select 1 from pg_temp.fresh_reserve_stock_openings where group_id=g.id and product_id=r.product) then raise exception 'สินค้านี้ยังไม่ได้ตั้งยอดสำรอง'; end if;
      insert into pg_temp.fresh_reserve_stock_movements(group_id,product_id,special_item_id,quantity_delta,reason,effective_at,created_by)
        values(g.id,r.product,r.source,r.qty,'office',clock_timestamp(),r.actor);
    end loop;
  end loop;
  if TG_OP='DELETE' then return old; end if; return new;
end $$;

create trigger test_office after insert or update or delete on pg_temp.daily_order_special_items for each row execute function pg_temp.capture_provincial_fresh_reserve_office();
insert into pg_temp.warehouses(id,name) values(md5('wh')::uuid,'คลังต่างจังหวัด'),(md5('bkk')::uuid,'คลังกรุงเทพ');
insert into pg_temp.suppliers(id,supplier_code) values(md5('lotus')::uuid,'TYV005');
insert into pg_temp.vehicles(id,organization_id,name) values(md5('truck')::uuid,md5('org')::uuid,'รถระนอง1'),(md5('bkktruck')::uuid,md5('org')::uuid,'รถกรุงเทพ');
insert into pg_temp.fresh_reserve_stock_groups(id,organization_id,warehouse_id,supplier_id,start_date) values(md5('group')::uuid,md5('org')::uuid,md5('wh')::uuid,md5('lotus')::uuid,current_date);
insert into pg_temp.fresh_reserve_stock_openings(group_id,product_id,quantity) values(md5('group')::uuid,md5('fresh')::uuid,50),(md5('group')::uuid,md5('stock')::uuid,999);
insert into pg_temp.product_warehouse_fulfillment_modes(organization_id,warehouse_id,supplier_id,product_id,mode) values(md5('org')::uuid,md5('wh')::uuid,md5('lotus')::uuid,md5('fresh')::uuid,'fresh'),(md5('org')::uuid,md5('wh')::uuid,md5('lotus')::uuid,md5('stock')::uuid,'stock');
insert into pg_temp.orders(id,organization_id,warehouse_id,order_date,status) values(md5('order')::uuid,md5('org')::uuid,md5('wh')::uuid,current_date,'submitted');
insert into pg_temp.order_items(order_id,organization_id,product_id,quantity_in_base_unit) values(md5('order')::uuid,md5('org')::uuid,md5('fresh')::uuid,30);
do $test$
begin
 if (select available from pg_temp.provincial_fresh_reserve_stock_balances where product_id=md5('fresh')::uuid)<>20 then raise exception '50 - 30 must be 20'; end if;
 if (select count(*) from pg_temp.provincial_fresh_reserve_stock_balances)<>1 then raise exception 'Stock-mode products must be excluded'; end if;
 update pg_temp.order_items set quantity_in_base_unit=40;
 if (select available from pg_temp.provincial_fresh_reserve_stock_balances)<>10 then raise exception 'Edit 30 to 40 must use only 10 extra'; end if;
 update pg_temp.order_items set quantity_in_base_unit=20;
 if (select available from pg_temp.provincial_fresh_reserve_stock_balances)<>30 then raise exception 'Reducing order must restore reserve'; end if;
 update pg_temp.orders set status='cancelled';
 if (select available from pg_temp.provincial_fresh_reserve_stock_balances)<>50 then raise exception 'Cancellation must restore reserve'; end if;
 update pg_temp.orders set status='confirmed';
 update pg_temp.order_items set quantity_in_base_unit=70;
 if (select available from pg_temp.provincial_fresh_reserve_stock_balances)<>-20 then raise exception 'Overselling must show shortage without factory ordering'; end if;
 insert into pg_temp.daily_order_special_items(id,organization_id,entry_date,entry_type,vehicle_id,product_id,quantity) values(md5('office')::uuid,md5('org')::uuid,current_date,'office',md5('truck')::uuid,md5('fresh')::uuid,50);
 if (select available from pg_temp.provincial_fresh_reserve_stock_balances)<>30 then raise exception 'Office must immediately add 50'; end if;
 if exists(select 1 from pg_temp.fresh_reserve_stock_movements where effective_at>clock_timestamp()) then raise exception 'Office must not wait for midnight'; end if;
 update pg_temp.daily_order_special_items set quantity=60 where id=md5('office')::uuid;
 if (select available from pg_temp.provincial_fresh_reserve_stock_balances)<>40 then raise exception 'Office edit must add only delta'; end if;
 insert into pg_temp.daily_order_special_items(id,organization_id,entry_date,entry_type,vehicle_id,product_id,quantity) values(md5('remaining')::uuid,md5('org')::uuid,current_date,'remaining',md5('truck')::uuid,md5('fresh')::uuid,20);
 if (select available from pg_temp.provincial_fresh_reserve_stock_balances)<>40 then raise exception 'Remaining must not deduct twice'; end if;
 insert into pg_temp.daily_order_special_items(id,organization_id,entry_date,entry_type,vehicle_id,product_id,quantity) values(md5('bkkoffice')::uuid,md5('org')::uuid,current_date,'office',md5('bkktruck')::uuid,md5('fresh')::uuid,90),(md5('stockoffice')::uuid,md5('org')::uuid,current_date,'office',md5('truck')::uuid,md5('stock')::uuid,90);
 if (select available from pg_temp.provincial_fresh_reserve_stock_balances)<>40 then raise exception 'Bangkok and stock products must not affect provincial reserve'; end if;
 delete from pg_temp.daily_order_special_items where id=md5('office')::uuid;
 if (select available from pg_temp.provincial_fresh_reserve_stock_balances)<>-20 then raise exception 'Office deletion must undo receipt'; end if;
 delete from pg_temp.order_items;
 if (select available from pg_temp.provincial_fresh_reserve_stock_balances)<>50 then raise exception 'Item deletion must restore reserve'; end if;
end $test$;
create function pg_temp.adjust_provincial_fresh_reserve_balance(
  p_org uuid,p_user uuid,p_group uuid,p_product uuid,p_expected_available numeric,p_quantity numeric,p_notes text
) returns numeric language plpgsql security invoker set search_path='' as $$
declare current_quantity numeric; effective timestamptz;
begin
  if p_quantity is null or p_quantity<0 or p_quantity>1000000000 or p_quantity<>round(p_quantity,3)
    or p_expected_available is null or abs(p_expected_available)>1000000000000 then
    raise exception 'จำนวนต้องไม่ติดลบ และใช้ทศนิยมไม่เกิน 3 ตำแหน่ง';
  end if;
  if length(coalesce(p_notes,''))>500 then raise exception 'เหตุผลต้องไม่เกิน 500 ตัวอักษร'; end if;
  if not exists(select 1 from pg_temp.app_users where id=p_user and organization_id=p_org and is_active and role in ('admin','member')) then raise exception 'ไม่มีสิทธิ์ปรับยอดสำรอง'; end if;
  perform pg_advisory_xact_lock(hashtextextended('special-orders:'||p_org::text,0));
  if not exists(select 1 from pg_temp.fresh_reserve_stock_groups g
    join pg_temp.warehouses w on w.id=g.warehouse_id and w.name='คลังต่างจังหวัด'
    join pg_temp.suppliers s on s.id=g.supplier_id and s.supplier_code='TYV005'
    join pg_temp.product_warehouse_fulfillment_modes m on m.organization_id=g.organization_id and m.warehouse_id=g.warehouse_id
      and m.supplier_id=g.supplier_id and m.product_id=p_product and m.mode='fresh'
    join pg_temp.products p on p.id=m.product_id and p.is_active and coalesce(p.metadata->>'deleted','false')<>'true'
    where g.id=p_group and g.organization_id=p_org) then raise exception 'ปรับได้เฉพาะผลิตสดโรงงานดอกบัวของคลังต่างจังหวัด'; end if;
  effective:=clock_timestamp();
  select available into current_quantity from pg_temp.provincial_fresh_reserve_stock_balances
    where organization_id=p_org and group_id=p_group and product_id=p_product;
  if current_quantity is null then raise exception 'สินค้านี้ยังไม่ได้ตั้งยอดเริ่มต้น'; end if;
  if current_quantity is distinct from p_expected_available then raise exception 'ยอดคงเหลือเปลี่ยนแล้ว กรุณาปิดแล้วเปิดแก้ไขคงเหลือใหม่'; end if;
  if current_quantity=p_quantity then return p_quantity; end if;
  insert into pg_temp.fresh_reserve_stock_movements(group_id,product_id,quantity_delta,reason,effective_at,created_by,quantity_before,quantity_after,notes)
    values(p_group,p_product,p_quantity-current_quantity,'adjustment',effective,p_user,current_quantity,p_quantity,
      coalesce(nullif(trim(p_notes),''),'ตรวจนับสต็อค'));
  return p_quantity;
end $$;

insert into pg_temp.app_users(id,organization_id,is_active,role) values(md5('user')::uuid,md5('org')::uuid,true,'member');
insert into pg_temp.products(id,is_active) values(md5('fresh')::uuid,true),(md5('stock')::uuid,true);
do $adjust$
declare failed boolean; movements integer;
begin
 perform pg_temp.adjust_provincial_fresh_reserve_balance(md5('org')::uuid,md5('user')::uuid,md5('group')::uuid,md5('fresh')::uuid,50,45,'นับจริง');
 if (select available from pg_temp.provincial_fresh_reserve_stock_balances)<>45 then raise exception 'Adjustment must set counted balance'; end if;
 if not exists(select 1 from pg_temp.fresh_reserve_stock_movements where reason='adjustment' and quantity_before=50 and quantity_after=45 and quantity_delta=-5 and notes='นับจริง') then raise exception 'Adjustment must keep audit history'; end if;
 select count(*) into movements from pg_temp.fresh_reserve_stock_movements;
 perform pg_temp.adjust_provincial_fresh_reserve_balance(md5('org')::uuid,md5('user')::uuid,md5('group')::uuid,md5('fresh')::uuid,45,45,'');
 if (select count(*) from pg_temp.fresh_reserve_stock_movements)<>movements then raise exception 'No-op must not duplicate'; end if;
 failed:=false;
 begin perform pg_temp.adjust_provincial_fresh_reserve_balance(md5('org')::uuid,md5('user')::uuid,md5('group')::uuid,md5('fresh')::uuid,50,10,''); exception when others then failed:=true; end;
 if not failed then raise exception 'Stale snapshot must be rejected'; end if;
 insert into pg_temp.order_items(order_id,organization_id,product_id,quantity_in_base_unit) values(md5('order')::uuid,md5('org')::uuid,md5('fresh')::uuid,70);
 if (select available from pg_temp.provincial_fresh_reserve_stock_balances)<>-25 then raise exception 'Orders must still deduct after adjustment'; end if;
 perform pg_temp.adjust_provincial_fresh_reserve_balance(md5('org')::uuid,md5('user')::uuid,md5('group')::uuid,md5('fresh')::uuid,-25,20,'ตรวจนับ');
 if (select available from pg_temp.provincial_fresh_reserve_stock_balances)<>20 then raise exception 'Negative shortage can be corrected to counted stock'; end if;
 if (select quantity_in_base_unit from pg_temp.order_items)<>70 then raise exception 'Adjustment must not change customer order'; end if;
 update pg_temp.order_items set quantity_in_base_unit=60;
 if (select available from pg_temp.provincial_fresh_reserve_stock_balances)<>30 then raise exception 'Later order reduction must restore 10'; end if;
 failed:=false;
 begin perform pg_temp.adjust_provincial_fresh_reserve_balance(md5('org')::uuid,md5('user')::uuid,md5('group')::uuid,md5('stock')::uuid,999,10,''); exception when others then failed:=true; end;
 if not failed then raise exception 'Stock products must stay excluded'; end if;
 failed:=false;
 begin perform pg_temp.adjust_provincial_fresh_reserve_balance(md5('other')::uuid,md5('user')::uuid,md5('group')::uuid,md5('fresh')::uuid,30,10,''); exception when others then failed:=true; end;
 if not failed then raise exception 'Other organization must be rejected'; end if;
 failed:=false;
 begin perform pg_temp.adjust_provincial_fresh_reserve_balance(md5('org')::uuid,md5('user')::uuid,md5('group')::uuid,md5('fresh')::uuid,30,-1,''); exception when others then failed:=true; end;
 if not failed then raise exception 'Negative counted quantity must be rejected'; end if;
 failed:=false;
 begin perform pg_temp.adjust_provincial_fresh_reserve_balance(md5('org')::uuid,md5('user')::uuid,md5('group')::uuid,md5('fresh')::uuid,30,1.2345,''); exception when others then failed:=true; end;
 if not failed then raise exception 'Excess precision must be rejected'; end if;
end $adjust$;
rollback;
select '25 reserve assertions passed; temporary fixtures rolled back' as result;
