create table if not exists public.product_warehouse_fulfillment_modes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  mode text not null default 'stock',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_warehouse_fulfillment_modes_mode_check
    check (mode in ('stock', 'fresh', 'disabled')),
  constraint product_warehouse_fulfillment_modes_unique
    unique (organization_id, product_id, warehouse_id)
);

alter table public.product_warehouse_fulfillment_modes
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;

create index if not exists product_warehouse_fulfillment_modes_org_warehouse_idx
  on public.product_warehouse_fulfillment_modes (organization_id, warehouse_id, mode);

create index if not exists product_warehouse_fulfillment_modes_org_product_idx
  on public.product_warehouse_fulfillment_modes (organization_id, product_id);

create index if not exists product_warehouse_fulfillment_modes_org_supplier_idx
  on public.product_warehouse_fulfillment_modes (organization_id, supplier_id)
  where supplier_id is not null;

drop trigger if exists product_warehouse_fulfillment_modes_set_updated_at
  on public.product_warehouse_fulfillment_modes;
create trigger product_warehouse_fulfillment_modes_set_updated_at
before update on public.product_warehouse_fulfillment_modes
for each row execute function public.set_updated_at();

alter table public.product_warehouse_fulfillment_modes enable row level security;
alter table public.product_warehouse_fulfillment_modes force row level security;

revoke all on public.product_warehouse_fulfillment_modes from anon, authenticated;

drop policy if exists product_warehouse_fulfillment_modes_deny_api_access
  on public.product_warehouse_fulfillment_modes;
create policy product_warehouse_fulfillment_modes_deny_api_access
on public.product_warehouse_fulfillment_modes as restrictive for all
using (false)
with check (false);

insert into public.product_warehouse_fulfillment_modes (
  organization_id,
  product_id,
  warehouse_id,
  supplier_id,
  mode
)
select
  p.organization_id,
  p.id,
  w.id,
  case when p.product_kind = 'made_to_order' then p.supplier_id else null end,
  case when p.product_kind = 'made_to_order' then 'fresh' else 'stock' end
from public.products p
join public.warehouses w
  on w.organization_id = p.organization_id
where coalesce((p.metadata ->> 'deleted')::boolean, false) = false
on conflict (organization_id, product_id, warehouse_id) do nothing;

update public.product_warehouse_fulfillment_modes m
set supplier_id = p.supplier_id
from public.products p
where m.product_id = p.id
  and m.organization_id = p.organization_id
  and m.mode = 'fresh'
  and m.supplier_id is null
  and p.supplier_id is not null;
