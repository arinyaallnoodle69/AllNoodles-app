begin;
create temp table app_users as select * from public.app_users with no data;
create temp table fresh_reserve_stock_groups as select * from public.fresh_reserve_stock_groups with no data;
create temp table warehouses as select * from public.warehouses with no data;
create temp table suppliers as select * from public.suppliers with no data;
create temp table product_warehouse_fulfillment_modes as select * from public.product_warehouse_fulfillment_modes with no data;
create temp table products as select * from public.products with no data;
create temp table fresh_reserve_stock_openings as select * from public.fresh_reserve_stock_openings with no data;
create temp table fresh_reserve_stock_movements as select * from public.fresh_reserve_stock_movements with no data;
alter table pg_temp.fresh_reserve_stock_movements add column if not exists quantity_before numeric(15,3),add column if not exists quantity_after numeric(15,3),add column if not exists notes text;
create temp view fresh_reserve_stock_balances as  SELECT g.organization_id,
    o.group_id,
    o.product_id,
    o.quantity AS opening_quantity,
    o.quantity + COALESCE(sum(m.quantity_delta) FILTER (WHERE m.effective_at <= clock_timestamp()), 0::numeric) AS available,
    COALESCE(sum(m.quantity_delta) FILTER (WHERE m.effective_at > clock_timestamp()), 0::numeric) AS pending,
    min(m.effective_at) FILTER (WHERE m.effective_at > clock_timestamp()) AS pending_at
   FROM fresh_reserve_stock_openings o
     JOIN fresh_reserve_stock_groups g ON g.id = o.group_id
     LEFT JOIN fresh_reserve_stock_movements m ON m.group_id = o.group_id AND m.product_id = o.product_id
  GROUP BY g.organization_id, o.group_id, o.product_id, o.quantity;
create function pg_temp.adjust_bangkok_fresh_reserve_balance(
  p_org uuid,p_user uuid,p_group uuid,p_product uuid,p_expected_available numeric,p_quantity numeric,p_notes text
) returns numeric language plpgsql security invoker set search_path='' as $$
declare current_quantity numeric; effective timestamptz;
begin
  if p_quantity is null or p_quantity<0 or p_quantity>1000000000 or p_quantity<>round(p_quantity,3)
    or p_expected_available is null or p_expected_available<0 or p_expected_available>1000000000000 then
    raise exception 'จำนวนต้องไม่ติดลบ และใช้ทศนิยมไม่เกิน 3 ตำแหน่ง';
  end if;
  if length(coalesce(p_notes,''))>500 then raise exception 'เหตุผลต้องไม่เกิน 500 ตัวอักษร'; end if;
  if not exists(select 1 from pg_temp.app_users where id=p_user and organization_id=p_org and is_active and role in ('admin','member')) then raise exception 'ไม่มีสิทธิ์ปรับยอดสำรอง'; end if;
  perform pg_advisory_xact_lock(hashtextextended('special-orders:'||p_org::text,0));
  if not exists(select 1 from pg_temp.fresh_reserve_stock_groups g
    join pg_temp.warehouses w on w.id=g.warehouse_id and w.name='คลังกรุงเทพ'
    join pg_temp.suppliers s on s.id=g.supplier_id and s.supplier_code='TYV002'
    join pg_temp.product_warehouse_fulfillment_modes m on m.organization_id=g.organization_id and m.warehouse_id=g.warehouse_id
      and m.supplier_id=g.supplier_id and m.product_id=p_product and m.mode='fresh'
    join pg_temp.products p on p.id=m.product_id and p.is_active and coalesce(p.metadata->>'deleted','false')<>'true'
    where g.id=p_group and g.organization_id=p_org) then raise exception 'ปรับได้เฉพาะผลิตสดโรงงานมังกรของคลังกรุงเทพ'; end if;
  effective:=clock_timestamp();
  select o.quantity+coalesce(sum(m.quantity_delta) filter(where m.effective_at<=effective),0) into current_quantity
    from pg_temp.fresh_reserve_stock_openings o left join pg_temp.fresh_reserve_stock_movements m on m.group_id=o.group_id and m.product_id=o.product_id
    where o.group_id=p_group and o.product_id=p_product group by o.quantity;
  if current_quantity is null then raise exception 'สินค้านี้ยังไม่ได้ตั้งยอดเริ่มต้น'; end if;
  if current_quantity is distinct from p_expected_available then raise exception 'ยอดคงเหลือเปลี่ยนแล้ว กรุณาปิดแล้วเปิดแก้ไขคงเหลือใหม่'; end if;
  if current_quantity=p_quantity then return p_quantity; end if;
  insert into pg_temp.fresh_reserve_stock_movements(group_id,product_id,quantity_delta,reason,effective_at,created_by,quantity_before,quantity_after,notes)
    values(p_group,p_product,p_quantity-current_quantity,'adjustment',effective,p_user,current_quantity,p_quantity,
      coalesce(nullif(trim(p_notes),''),'ตรวจนับสต็อค'));
  return p_quantity;
end $$;

insert into pg_temp.app_users(id,organization_id,is_active,role) values(md5('user')::uuid,md5('org')::uuid,true,'member');
insert into pg_temp.warehouses(id,name) values(md5('wh')::uuid,'คลังกรุงเทพ'),(md5('province')::uuid,'คลังต่างจังหวัด');
insert into pg_temp.suppliers(id,supplier_code) values(md5('dragon')::uuid,'TYV002');
insert into pg_temp.products(id,is_active) values(md5('product')::uuid,true);
insert into pg_temp.fresh_reserve_stock_groups(id,organization_id,warehouse_id,supplier_id) values(md5('group')::uuid,md5('org')::uuid,md5('wh')::uuid,md5('dragon')::uuid);
insert into pg_temp.product_warehouse_fulfillment_modes(organization_id,warehouse_id,supplier_id,product_id,mode) values(md5('org')::uuid,md5('wh')::uuid,md5('dragon')::uuid,md5('product')::uuid,'fresh');
insert into pg_temp.fresh_reserve_stock_openings(group_id,product_id,quantity) values(md5('group')::uuid,md5('product')::uuid,50);
insert into pg_temp.fresh_reserve_stock_movements(group_id,product_id,quantity_delta,reason,effective_at) values(md5('group')::uuid,md5('product')::uuid,20,'office',clock_timestamp()+interval '1 day');
do $test$
declare failed boolean; count_before integer;
begin
 perform pg_temp.adjust_bangkok_fresh_reserve_balance(md5('org')::uuid,md5('user')::uuid,md5('group')::uuid,md5('product')::uuid,50,45,'นับจริง');
 if (select available from pg_temp.fresh_reserve_stock_balances)<>45 then raise exception '50 to 45 must save counted balance'; end if;
 if (select pending from pg_temp.fresh_reserve_stock_balances)<>20 then raise exception 'Pending receipt must remain 20'; end if;
 if not exists(select 1 from pg_temp.fresh_reserve_stock_movements where reason='adjustment' and quantity_delta=-5 and quantity_before=50 and quantity_after=45 and notes='นับจริง' and created_by=md5('user')::uuid) then raise exception 'Adjustment must audit delta, before, after, reason and actor'; end if;
 perform pg_temp.adjust_bangkok_fresh_reserve_balance(md5('org')::uuid,md5('user')::uuid,md5('group')::uuid,md5('product')::uuid,45,60,'');
 if (select available from pg_temp.fresh_reserve_stock_balances)<>60 then raise exception 'Increasing balance must work'; end if;
 select count(*) into count_before from pg_temp.fresh_reserve_stock_movements;
 perform pg_temp.adjust_bangkok_fresh_reserve_balance(md5('org')::uuid,md5('user')::uuid,md5('group')::uuid,md5('product')::uuid,60,60,'');
 if (select count(*) from pg_temp.fresh_reserve_stock_movements)<>count_before then raise exception 'No-op must not create duplicate movements'; end if;
 failed:=false;
 begin perform pg_temp.adjust_bangkok_fresh_reserve_balance(md5('org')::uuid,md5('user')::uuid,md5('group')::uuid,md5('product')::uuid,45,10,''); exception when others then failed:=true; end;
 if not failed or (select available from pg_temp.fresh_reserve_stock_balances)<>60 then raise exception 'Stale editor must not overwrite newer stock'; end if;
 failed:=false;
 begin perform pg_temp.adjust_bangkok_fresh_reserve_balance(md5('org')::uuid,md5('user')::uuid,md5('group')::uuid,md5('product')::uuid,60,-1,''); exception when others then failed:=true; end;
 if not failed then raise exception 'Negative balance must be rejected'; end if;
 failed:=false;
 begin perform pg_temp.adjust_bangkok_fresh_reserve_balance(md5('org')::uuid,md5('user')::uuid,md5('group')::uuid,md5('product')::uuid,60,1.2345,''); exception when others then failed:=true; end;
 if not failed then raise exception 'Excess decimal precision must be rejected'; end if;
 update pg_temp.product_warehouse_fulfillment_modes set mode='stock';
 failed:=false;
 begin perform pg_temp.adjust_bangkok_fresh_reserve_balance(md5('org')::uuid,md5('user')::uuid,md5('group')::uuid,md5('product')::uuid,60,10,''); exception when others then failed:=true; end;
 if not failed then raise exception 'Stock-mode products must not be adjustable here'; end if;
 update pg_temp.product_warehouse_fulfillment_modes set mode='fresh';
 update pg_temp.fresh_reserve_stock_groups set warehouse_id=md5('province')::uuid;
 failed:=false;
 begin perform pg_temp.adjust_bangkok_fresh_reserve_balance(md5('org')::uuid,md5('user')::uuid,md5('group')::uuid,md5('product')::uuid,60,10,''); exception when others then failed:=true; end;
 if not failed then raise exception 'Provincial groups must not be adjustable here'; end if;
 update pg_temp.fresh_reserve_stock_groups set warehouse_id=md5('wh')::uuid;
 failed:=false;
 begin perform pg_temp.adjust_bangkok_fresh_reserve_balance(md5('other-org')::uuid,md5('user')::uuid,md5('group')::uuid,md5('product')::uuid,60,10,''); exception when others then failed:=true; end;
 if not failed then raise exception 'Cross-organization adjustment must be rejected'; end if;
 perform pg_temp.adjust_bangkok_fresh_reserve_balance(md5('org')::uuid,md5('user')::uuid,md5('group')::uuid,md5('product')::uuid,60,0,'');
 if (select available from pg_temp.fresh_reserve_stock_balances)<>0 or (select pending from pg_temp.fresh_reserve_stock_balances)<>20 then raise exception 'Zero balance must retain future receipts'; end if;
end $test$;
rollback;
select '12 adjustment assertions passed; temporary fixtures rolled back' as result;
