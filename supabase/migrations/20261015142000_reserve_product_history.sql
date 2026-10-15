-- Read the balance and all contributing events in one database snapshot.
create function public.get_reserve_product_history(p_org uuid,p_group uuid,p_product uuid,p_from date)
returns jsonb language sql stable security invoker set search_path='' as $$
with scope as (
  select g.*,w.name warehouse_name from public.fresh_reserve_stock_groups g
  join public.warehouses w on w.id=g.warehouse_id
  join public.suppliers s on s.id=g.supplier_id
  join public.product_warehouse_fulfillment_modes mode on mode.organization_id=g.organization_id
    and mode.warehouse_id=g.warehouse_id and mode.supplier_id=g.supplier_id and mode.product_id=p_product and mode.mode='fresh'
  where g.id=p_group and g.organization_id=p_org
    and ((w.name='คลังกรุงเทพ' and s.name='โรงงานมังกร') or (w.name='คลังต่างจังหวัด' and s.supplier_code='TYV005'))
), balance as (
  select b.available from scope g join public.fresh_reserve_stock_balances b on b.group_id=g.id and b.product_id=p_product where g.warehouse_name='คลังกรุงเทพ'
  union all
  select b.available from scope g join public.provincial_fresh_reserve_stock_balances b on b.group_id=g.id and b.product_id=p_product where g.warehouse_name='คลังต่างจังหวัด'
), events as (
  select m.id::text id,m.quantity_delta delta,m.reason,m.effective_at at,m.notes,
    c.name customer_name,o.order_number
  from scope g join public.fresh_reserve_stock_movements m on m.group_id=g.id and m.product_id=p_product
  left join public.order_items i on i.id=m.order_item_id and i.organization_id=p_org
  left join public.orders o on o.id=i.order_id and o.organization_id=p_org
  left join public.customers c on c.id=o.customer_id and c.organization_id=p_org
  where m.effective_at >= (p_from::timestamp at time zone 'Asia/Bangkok')
    and (g.warehouse_name='คลังกรุงเทพ' or m.reason in ('office','adjustment','order'))
  union all
  -- Old provincial orders predate movement logging; show their current net demand once.
  select 'legacy:'||i.id,-i.quantity_in_base_unit,'legacy',
    o.order_date::timestamp at time zone 'Asia/Bangkok',null,c.name,o.order_number
  from scope g join public.orders o on o.organization_id=p_org and o.warehouse_id=g.warehouse_id
  join public.order_items i on i.order_id=o.id and i.organization_id=p_org and i.product_id=p_product and i.supply_source='legacy'
  left join public.customers c on c.id=o.customer_id and c.organization_id=p_org
  where g.warehouse_name='คลังต่างจังหวัด' and o.order_date>=g.start_date and o.order_date>=p_from
    and o.order_date <= (statement_timestamp() at time zone 'Asia/Bangkok')::date
    and o.status in ('submitted','confirmed')
), future_legacy as (
  select coalesce(sum(i.quantity_in_base_unit),0) quantity from scope g
  join public.orders o on o.organization_id=p_org and o.warehouse_id=g.warehouse_id
  join public.order_items i on i.order_id=o.id and i.organization_id=p_org and i.product_id=p_product and i.supply_source='legacy'
  where g.warehouse_name='คลังต่างจังหวัด' and o.order_date>=g.start_date
    and o.order_date>(statement_timestamp() at time zone 'Asia/Bangkok')::date and o.status in ('submitted','confirmed')
)
select jsonb_build_object('available',b.available,'startDate',g.start_date,'now',statement_timestamp(),
  'futureLegacy',f.quantity,'events',coalesce((select jsonb_agg(jsonb_build_object(
    'id',e.id,'delta',e.delta,'reason',e.reason,'at',e.at,'notes',e.notes,
    'customerName',e.customer_name,'orderNumber',e.order_number) order by e.at,e.id) from events e),'[]'::jsonb))
from scope g cross join balance b cross join future_legacy f;
$$;
revoke all on function public.get_reserve_product_history(uuid,uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.get_reserve_product_history(uuid,uuid,uuid,date) to service_role;
