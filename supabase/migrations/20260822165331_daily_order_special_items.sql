begin;

create table if not exists public.daily_order_special_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entry_date date not null,
  entry_type text not null,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity numeric(14, 3) not null,
  created_by uuid null references public.app_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint daily_order_special_items_type_check
    check (entry_type in ('office', 'claim')),
  constraint daily_order_special_items_quantity_check
    check (quantity > 0),
  constraint daily_order_special_items_unique
    unique (organization_id, entry_date, entry_type, vehicle_id, product_id)
);

create index if not exists daily_order_special_items_org_date_idx
  on public.daily_order_special_items (organization_id, entry_date, vehicle_id, entry_type);

create index if not exists daily_order_special_items_product_idx
  on public.daily_order_special_items (organization_id, product_id, entry_date);

drop trigger if exists set_daily_order_special_items_updated_at
  on public.daily_order_special_items;
create trigger set_daily_order_special_items_updated_at
before update on public.daily_order_special_items
for each row execute function public.set_updated_at_timestamp();

alter table public.daily_order_special_items enable row level security;
alter table public.daily_order_special_items force row level security;

-- All access is intentionally server-side through the organization-scoped
-- admin client and validated server actions. No browser Data API access.
revoke all on public.daily_order_special_items from anon, authenticated;

comment on table public.daily_order_special_items is
  'Daily non-sale quantities. Office rows feed packing/factory sheets; claim rows feed packing/vehicle-loading sheets only.';

commit;
