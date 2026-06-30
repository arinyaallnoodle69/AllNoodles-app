create table if not exists public.product_brands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint product_brands_org_name_unique unique (organization_id, name)
);

create index if not exists product_brands_org_sort_idx
  on public.product_brands (organization_id, sort_order, name);

alter table public.product_brands enable row level security;
alter table public.product_brands force row level security;

revoke all on public.product_brands from anon, authenticated;

drop policy if exists product_brands_deny_api_access on public.product_brands;
create policy product_brands_deny_api_access
on public.product_brands
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

drop trigger if exists product_brands_set_updated_at on public.product_brands;
create trigger product_brands_set_updated_at
before update on public.product_brands
for each row
execute function public.set_updated_at();

-- Backfill from products metadata
with source_brands as (
  select
    p.organization_id,
    trim(both from p.metadata ->> 'brand') as brand_name
  from public.products p
  where trim(both from coalesce(p.metadata ->> 'brand', '')) <> ''
  group by p.organization_id, trim(both from p.metadata ->> 'brand')
)
insert into public.product_brands (
  organization_id,
  name,
  sort_order
)
select
  source_brands.organization_id,
  source_brands.brand_name,
  row_number() over (
    partition by source_brands.organization_id
    order by source_brands.brand_name
  ) - 1
from source_brands
on conflict (organization_id, name) do nothing;
