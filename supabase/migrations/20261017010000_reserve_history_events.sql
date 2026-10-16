-- Read-only event projection: scheduling is history, not a second stock movement.
create or replace view public.fresh_reserve_history_events with (security_invoker = true) as
select m.id::text || case when m.reason='office' and m.effective_at>m.created_at then ':scheduled' else '' end as id,
  m.id as movement_id,g.organization_id,m.group_id,m.product_id,m.quantity_delta,m.quantity_before,m.quantity_after,m.reason,
  m.created_at,m.effective_at,m.created_at as event_at,
  case when m.reason='office' and m.effective_at>m.created_at then 'scheduled' else 'movement' end as event_kind,
  coalesce(p.name,'ไม่พบชื่อสินค้า') as product_name
from public.fresh_reserve_stock_movements m
join public.fresh_reserve_stock_groups g on g.id=m.group_id
left join public.products p on p.id=m.product_id and p.organization_id=g.organization_id
union all
select m.id::text || ':received',m.id,g.organization_id,m.group_id,m.product_id,m.quantity_delta,m.quantity_before,m.quantity_after,m.reason,
  m.created_at,m.effective_at,m.effective_at,'received',coalesce(p.name,'ไม่พบชื่อสินค้า')
from public.fresh_reserve_stock_movements m
join public.fresh_reserve_stock_groups g on g.id=m.group_id
left join public.products p on p.id=m.product_id and p.organization_id=g.organization_id
where m.reason='office' and m.effective_at>m.created_at;
revoke all on public.fresh_reserve_history_events from public,anon,authenticated;
grant select on public.fresh_reserve_history_events to service_role;
