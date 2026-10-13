create or replace view public.provincial_fresh_reserve_stock_balances with (security_invoker=true) as
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
  where m.group_id=g.id and m.product_id=o.product_id and m.reason in ('office','adjustment')
) receipts on true
left join lateral (
  select sum(i.quantity_in_base_unit) quantity from public.orders ord
  join public.order_items i on i.order_id=ord.id and i.organization_id=ord.organization_id
  where ord.organization_id=g.organization_id and ord.warehouse_id=g.warehouse_id
    and ord.order_date>=g.start_date and ord.status in ('submitted','confirmed') and i.product_id=o.product_id
) demand on true;
revoke all on public.provincial_fresh_reserve_stock_balances from public,anon,authenticated;
grant select on public.provincial_fresh_reserve_stock_balances to service_role;

create function public.adjust_provincial_fresh_reserve_balance(
  p_org uuid,p_user uuid,p_group uuid,p_product uuid,p_expected_available numeric,p_quantity numeric,p_notes text
) returns numeric language plpgsql security invoker set search_path='' as $$
declare current_quantity numeric; effective timestamptz;
begin
  if p_quantity is null or p_quantity<0 or p_quantity>1000000000 or p_quantity<>round(p_quantity,3)
    or p_expected_available is null or abs(p_expected_available)>1000000000000 then
    raise exception 'จำนวนต้องไม่ติดลบ และใช้ทศนิยมไม่เกิน 3 ตำแหน่ง';
  end if;
  if length(coalesce(p_notes,''))>500 then raise exception 'เหตุผลต้องไม่เกิน 500 ตัวอักษร'; end if;
  if not exists(select 1 from public.app_users where id=p_user and organization_id=p_org and is_active and role in ('admin','member')) then raise exception 'ไม่มีสิทธิ์ปรับยอดสำรอง'; end if;
  perform pg_advisory_xact_lock(hashtextextended('special-orders:'||p_org::text,0));
  if not exists(select 1 from public.fresh_reserve_stock_groups g
    join public.warehouses w on w.id=g.warehouse_id and w.name='คลังต่างจังหวัด'
    join public.suppliers s on s.id=g.supplier_id and s.supplier_code='TYV005'
    join public.product_warehouse_fulfillment_modes m on m.organization_id=g.organization_id and m.warehouse_id=g.warehouse_id
      and m.supplier_id=g.supplier_id and m.product_id=p_product and m.mode='fresh'
    join public.products p on p.id=m.product_id and p.is_active and coalesce(p.metadata->>'deleted','false')<>'true'
    where g.id=p_group and g.organization_id=p_org) then raise exception 'ปรับได้เฉพาะผลิตสดโรงงานดอกบัวของคลังต่างจังหวัด'; end if;
  effective:=clock_timestamp();
  select available into current_quantity from public.provincial_fresh_reserve_stock_balances
    where organization_id=p_org and group_id=p_group and product_id=p_product;
  if current_quantity is null then raise exception 'สินค้านี้ยังไม่ได้ตั้งยอดเริ่มต้น'; end if;
  if current_quantity is distinct from p_expected_available then raise exception 'ยอดคงเหลือเปลี่ยนแล้ว กรุณาปิดแล้วเปิดแก้ไขคงเหลือใหม่'; end if;
  if current_quantity=p_quantity then return p_quantity; end if;
  insert into public.fresh_reserve_stock_movements(group_id,product_id,quantity_delta,reason,effective_at,created_by,quantity_before,quantity_after,notes)
    values(p_group,p_product,p_quantity-current_quantity,'adjustment',effective,p_user,current_quantity,p_quantity,
      coalesce(nullif(trim(p_notes),''),'ตรวจนับสต็อค'));
  return p_quantity;
end $$;
revoke all on function public.adjust_provincial_fresh_reserve_balance(uuid,uuid,uuid,uuid,numeric,numeric,text) from public,anon,authenticated;
grant execute on function public.adjust_provincial_fresh_reserve_balance(uuid,uuid,uuid,uuid,numeric,numeric,text) to service_role;
