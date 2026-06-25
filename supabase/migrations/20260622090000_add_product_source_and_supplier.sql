alter table public.products
  add column if not exists product_kind text not null default 'made_to_order',
  add column if not exists supplier_id uuid null references public.suppliers(id) on delete set null;

alter table public.products
  drop constraint if exists products_product_kind_check;

alter table public.products
  add constraint products_product_kind_check
  check (product_kind in ('made_to_order', 'stock'));

create index if not exists products_supplier_id_idx
  on public.products (supplier_id);

