alter table public.customers
  add column if not exists sort_order integer not null default 0;

with ranked_customers as (
  select
    id,
    row_number() over (
      partition by organization_id
      order by customer_code asc, created_at asc
    ) - 1 as next_sort_order
  from public.customers
)
update public.customers as customers
set sort_order = ranked_customers.next_sort_order
from ranked_customers
where customers.id = ranked_customers.id
  and customers.sort_order = 0;

create index if not exists customers_org_sort_order_idx
  on public.customers (organization_id, is_active, sort_order, customer_code);
