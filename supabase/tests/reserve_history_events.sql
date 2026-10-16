-- Read-only checks against the event projection; never create stock movements.
do $$
begin
  if exists (
    select 1 from public.fresh_reserve_stock_movements m
    left join public.fresh_reserve_history_events e on e.movement_id=m.id
    group by m.id,m.reason,m.effective_at,m.created_at
    having count(e.id)<>case when m.reason='office' and m.effective_at>m.created_at then 2 else 1 end
  ) then raise exception 'Unexpected event count per stock movement'; end if;
  if exists (
    select 1 from public.fresh_reserve_history_events
    where (event_kind='scheduled' and event_at<>created_at)
      or (event_kind='received' and event_at<>effective_at)
  ) then raise exception 'History timestamp does not match event type'; end if;
  if (select sum(quantity_delta) from public.fresh_reserve_stock_movements)
    is distinct from (select sum(quantity_delta) from public.fresh_reserve_history_events where event_kind<>'scheduled')
  then raise exception 'Scheduled rows duplicate stock movement quantity'; end if;
  if has_table_privilege('anon','public.fresh_reserve_history_events','select')
    or has_table_privilege('authenticated','public.fresh_reserve_history_events','select')
  then raise exception 'History view must only be read by authorized server actions'; end if;
end $$;
