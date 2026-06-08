-- Make order shortage summaries warehouse-aware.
-- Stock availability must be checked against the order warehouse, not product totals.

create or replace function public.get_order_daily_store_items(
  p_organization_id uuid,
  p_order_date date,
  p_customer_id uuid
)
returns table (
  product_id uuid,
  product_sku text,
  product_name text,
  product_unit text,
  product_unit_ratio numeric,
  product_sale_unit_id uuid,
  ordered_quantity numeric,
  current_stock_quantity numeric,
  deliverable_quantity numeric,
  short_quantity numeric,
  unit_price numeric,
  line_total numeric,
  order_rounds integer,
  image_url text
)
language sql
stable
security definer
set search_path = public
as $$
  with scoped_orders as (
    select
      o.id,
      coalesce(o.warehouse_id, c.default_warehouse_id) as warehouse_id
    from public.orders o
    join public.customers c
      on c.id = o.customer_id
     and c.organization_id = o.organization_id
    where o.organization_id = p_organization_id
      and o.order_date = p_order_date
      and o.customer_id = p_customer_id
      and (o.status is null or o.status <> 'cancelled')
  ),
  selected_warehouses as (
    select distinct warehouse_id
    from scoped_orders
    where warehouse_id is not null
  ),
  daily_total_demand as (
    select
      oi.product_id,
      sw.warehouse_id,
      sum(coalesce(oi.quantity_in_base_unit, oi.quantity)) as total_daily_base_qty
    from public.order_items oi
    join public.orders o
      on o.id = oi.order_id
    join public.customers c
      on c.id = o.customer_id
     and c.organization_id = o.organization_id
    join selected_warehouses sw
      on sw.warehouse_id = coalesce(o.warehouse_id, c.default_warehouse_id)
    where o.organization_id = p_organization_id
      and o.order_date = p_order_date
      and (o.fulfillment_status is null or o.fulfillment_status <> 'complete')
      and (o.status is null or o.status <> 'cancelled')
      and coalesce(o.warehouse_id, c.default_warehouse_id) is not null
    group by oi.product_id, sw.warehouse_id
  ),
  item_rollup as (
    select
      oi.product_id,
      so.warehouse_id,
      coalesce(oi.product_sale_unit_id, '00000000-0000-0000-0000-000000000000'::uuid) as product_sale_unit_id,
      coalesce(oi.sale_unit_label, p.unit) as sale_unit_label,
      max(coalesce(nullif(oi.sale_unit_ratio, 0), 1)) as sale_unit_ratio,
      sum(oi.quantity) as ordered_quantity,
      sum(coalesce(oi.quantity_in_base_unit, oi.quantity)) as ordered_quantity_in_base_unit,
      max(oi.unit_price) as unit_price,
      sum(oi.line_total) as line_total,
      count(distinct oi.order_id)::integer as order_rounds
    from public.order_items oi
    join scoped_orders so
      on so.id = oi.order_id
    join public.products p
      on p.id = oi.product_id
    where so.warehouse_id is not null
    group by
      oi.product_id,
      so.warehouse_id,
      coalesce(oi.product_sale_unit_id, '00000000-0000-0000-0000-000000000000'::uuid),
      coalesce(oi.sale_unit_label, p.unit)
  )
  select
    p.id,
    p.sku,
    p.name,
    ir.sale_unit_label,
    ir.sale_unit_ratio,
    case
      when ir.product_sale_unit_id = '00000000-0000-0000-0000-000000000000'::uuid then null
      else ir.product_sale_unit_id
    end,
    ir.ordered_quantity,
    coalesce(pws.stock_quantity, 0),
    case
      when coalesce(dtd.total_daily_base_qty, 0) <= coalesce(pws.stock_quantity, 0) then ir.ordered_quantity
      else least(ir.ordered_quantity, floor(coalesce(pws.stock_quantity, 0) / nullif(ir.sale_unit_ratio, 0)))
    end as deliverable_quantity,
    case
      when coalesce(dtd.total_daily_base_qty, 0) <= coalesce(pws.stock_quantity, 0) then 0
      else greatest(0, ir.ordered_quantity - floor(coalesce(pws.stock_quantity, 0) / nullif(ir.sale_unit_ratio, 0)))
    end as short_quantity,
    ir.unit_price,
    ir.line_total,
    ir.order_rounds,
    (
      select pi.public_url
      from public.product_images pi
      where pi.product_id = p.id
      order by pi.sort_order asc, pi.created_at asc
      limit 1
    )
  from item_rollup ir
  join public.products p
    on p.id = ir.product_id
  left join public.product_warehouse_stocks pws
    on pws.organization_id = p_organization_id
   and pws.product_id = ir.product_id
   and pws.warehouse_id = ir.warehouse_id
  left join daily_total_demand dtd
    on dtd.product_id = ir.product_id
   and dtd.warehouse_id = ir.warehouse_id
  order by p.name asc, ir.sale_unit_label asc;
$$;

create or replace function public.get_order_daily_store_summaries(
  p_organization_id uuid,
  p_order_date date,
  p_search text default null,
  p_limit integer default 80,
  p_offset integer default 0
)
returns table (
  customer_id uuid,
  customer_code text,
  customer_name text,
  order_rounds integer,
  product_count integer,
  total_quantity numeric,
  total_amount numeric,
  latest_order_at timestamptz,
  shortage_product_count integer,
  is_complete boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with scoped_orders as (
    select
      o.id,
      o.customer_id,
      o.created_at,
      o.total_amount,
      o.fulfillment_status,
      coalesce(o.warehouse_id, c.default_warehouse_id) as warehouse_id
    from public.orders o
    join public.customers c
      on c.id = o.customer_id
     and c.organization_id = o.organization_id
    where o.organization_id = p_organization_id
      and o.order_date = p_order_date
      and c.organization_id = p_organization_id
      and (o.status is null or o.status <> 'cancelled')
      and (
        nullif(btrim(coalesce(p_search, '')), '') is null
        or c.name ilike '%' || btrim(p_search) || '%'
        or c.customer_code ilike '%' || btrim(p_search) || '%'
      )
  ),
  daily_total_demand as (
    select
      oi.product_id,
      coalesce(o.warehouse_id, c.default_warehouse_id) as warehouse_id,
      sum(coalesce(oi.quantity_in_base_unit, oi.quantity)) as total_daily_base_qty
    from public.order_items oi
    join public.orders o
      on o.id = oi.order_id
    join public.customers c
      on c.id = o.customer_id
     and c.organization_id = o.organization_id
    where o.organization_id = p_organization_id
      and o.order_date = p_order_date
      and (o.fulfillment_status is null or o.fulfillment_status <> 'complete')
      and (o.status is null or o.status <> 'cancelled')
      and coalesce(o.warehouse_id, c.default_warehouse_id) is not null
    group by oi.product_id, coalesce(o.warehouse_id, c.default_warehouse_id)
  ),
  item_rollup as (
    select
      so.customer_id,
      so.warehouse_id,
      oi.product_id,
      sum(coalesce(oi.quantity_in_base_unit, oi.quantity)) as ordered_quantity_in_base_unit
    from scoped_orders so
    join public.order_items oi
      on oi.order_id = so.id
    where so.warehouse_id is not null
    group by so.customer_id, so.warehouse_id, oi.product_id
  ),
  customer_rollup as (
    select
      so.customer_id,
      count(*)::integer as order_rounds,
      coalesce(sum(so.total_amount), 0) as total_amount,
      max(so.created_at) as latest_order_at,
      every(so.fulfillment_status = 'complete') as is_complete
    from scoped_orders so
    group by so.customer_id
  )
  select
    c.id,
    c.customer_code,
    c.name,
    cr.order_rounds,
    count(distinct ir.product_id)::integer as product_count,
    coalesce(sum(ir.ordered_quantity_in_base_unit), 0) as total_quantity,
    cr.total_amount,
    cr.latest_order_at,
    coalesce(
      count(distinct (ir.product_id, ir.warehouse_id)) filter (
        where coalesce(dtd.total_daily_base_qty, 0) > coalesce(pws.stock_quantity, 0)
      ),
      0
    )::integer as shortage_product_count,
    coalesce(cr.is_complete, false) as is_complete
  from customer_rollup cr
  join public.customers c
    on c.id = cr.customer_id
  left join item_rollup ir
    on ir.customer_id = cr.customer_id
  left join public.product_warehouse_stocks pws
    on pws.organization_id = p_organization_id
   and pws.product_id = ir.product_id
   and pws.warehouse_id = ir.warehouse_id
  left join daily_total_demand dtd
    on dtd.product_id = ir.product_id
   and dtd.warehouse_id = ir.warehouse_id
  where coalesce(cr.is_complete, false) = false
  group by c.id, c.customer_code, c.name, cr.order_rounds, cr.total_amount, cr.latest_order_at, cr.is_complete
  order by cr.latest_order_at desc, c.name asc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;
