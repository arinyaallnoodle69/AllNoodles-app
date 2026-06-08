-- Update public.get_profit_sales_report to use historical cost price from order_items if available.
-- This prevents future product cost changes from altering historical sales profit calculations.

CREATE OR REPLACE FUNCTION public.get_profit_sales_report(
  p_organization_id uuid,
  p_from_date date,
  p_to_date date,
  p_customer_ids uuid[] default null
)
RETURNS TABLE (
  iso_date date,
  order_count bigint,
  sales numeric,
  cost numeric,
  net_profit numeric,
  margin_percent numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  with filtered_notes as (
    select
      dn.id,
      dn.delivery_date,
      coalesce(dn.total_amount, 0)::numeric as total_amount
    from public.delivery_notes dn
    where dn.organization_id = p_organization_id
      and dn.status = 'confirmed'
      and dn.delivery_date >= p_from_date
      and dn.delivery_date <= p_to_date
      and (
        p_customer_ids is null
        or cardinality(p_customer_ids) = 0
        or dn.customer_id = any(p_customer_ids)
      )
  ),
  note_costs as (
    select
      dni.delivery_note_id,
      sum(
        coalesce(dni.quantity_delivered, 0)::numeric *
        coalesce(
          nullif(oi.cost_price, 0), -- Use cost price from order_items if recorded and non-zero
          case
            when psu.cost_mode = 'fixed' and psu.fixed_cost_price is not null
              then psu.fixed_cost_price
            else coalesce(p.cost_price, 0)::numeric * coalesce(psu.base_unit_quantity, 0)::numeric
          end
        )
      ) as cost
    from public.delivery_note_items dni
    join filtered_notes fn on fn.id = dni.delivery_note_id
    left join public.order_items oi on oi.id = dni.order_item_id
    left join public.product_sale_units psu on psu.id = dni.product_sale_unit_id
    left join public.products p on p.id = psu.product_id
    group by dni.delivery_note_id
  ),
  daily as (
    select
      fn.delivery_date,
      count(*)::bigint as order_count,
      sum(fn.total_amount)::numeric as sales,
      coalesce(sum(nc.cost), 0)::numeric as cost
    from filtered_notes fn
    left join note_costs nc on nc.delivery_note_id = fn.id
    group by fn.delivery_date
  )
  select
    d.delivery_date as iso_date,
    d.order_count,
    round(d.sales, 2) as sales,
    round(d.cost, 2) as cost,
    round(d.sales - d.cost, 2) as net_profit,
    case
      when d.sales > 0 then round(((d.sales - d.cost) / d.sales) * 100, 4)
      else 0
    end as margin_percent
  from daily d
  order by d.delivery_date;
$$;
