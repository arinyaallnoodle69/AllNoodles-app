alter table public.orders
  add column if not exists assigned_vehicle_id uuid null
    references public.vehicles(id) on delete set null;

create index if not exists orders_org_date_assigned_vehicle_idx
  on public.orders (organization_id, order_date, assigned_vehicle_id)
  where status <> 'cancelled';

create or replace function public.move_orders_between_vehicles(
  p_organization_id uuid,
  p_order_date date,
  p_from_vehicle_id uuid,
  p_to_vehicle_id uuid
)
returns table (
  moved_order_count integer,
  moved_delivery_note_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_organization_id is null or p_order_date is null then
    raise exception 'organization and order date are required';
  end if;

  if p_from_vehicle_id is null or p_to_vehicle_id is null then
    raise exception 'source and destination vehicles are required';
  end if;

  if p_from_vehicle_id = p_to_vehicle_id then
    raise exception 'source and destination vehicles must be different';
  end if;

  if not exists (
    select 1
    from public.vehicles
    where id = p_from_vehicle_id
      and organization_id = p_organization_id
      and is_active = true
  ) then
    raise exception 'source vehicle was not found';
  end if;

  if not exists (
    select 1
    from public.vehicles
    where id = p_to_vehicle_id
      and organization_id = p_organization_id
      and is_active = true
  ) then
    raise exception 'destination vehicle was not found';
  end if;

  return query
  with target_orders as materialized (
    select o.id
    from public.orders o
    join public.customers c
      on c.id = o.customer_id
     and c.organization_id = o.organization_id
    where o.organization_id = p_organization_id
      and o.order_date = p_order_date
      and o.status <> 'cancelled'
      and coalesce(
        (
          select dn.vehicle_id
          from public.delivery_notes dn
          where dn.organization_id = p_organization_id
            and dn.order_id = o.id
            and dn.status <> 'cancelled'
          order by dn.created_at asc
          limit 1
        ),
        o.assigned_vehicle_id,
        c.default_vehicle_id
      ) = p_from_vehicle_id
    for update of o
  ),
  moved_orders as (
    update public.orders o
    set assigned_vehicle_id = p_to_vehicle_id,
        updated_at = timezone('utc', now())
    where o.id in (select id from target_orders)
    returning o.id
  ),
  moved_delivery_notes as (
    update public.delivery_notes dn
    set vehicle_id = p_to_vehicle_id,
        updated_at = timezone('utc', now())
    where dn.organization_id = p_organization_id
      and dn.status <> 'cancelled'
      and dn.order_id in (select id from moved_orders)
    returning dn.id
  )
  select
    (select count(*)::integer from moved_orders),
    (select count(*)::integer from moved_delivery_notes);
end;
$$;

revoke all on function public.move_orders_between_vehicles(uuid, date, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.move_orders_between_vehicles(uuid, date, uuid, uuid)
  to service_role;
