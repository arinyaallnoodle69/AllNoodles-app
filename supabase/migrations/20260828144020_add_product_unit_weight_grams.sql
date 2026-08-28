alter table public.products
  add column if not exists unit_weight_grams numeric(14, 3);

comment on column public.products.unit_weight_grams is
  'Gross weight in grams for one base sale unit; null means weight is not configured.';

alter table public.products
  drop constraint if exists products_unit_weight_grams_positive_check;

alter table public.products
  add constraint products_unit_weight_grams_positive_check
  check (unit_weight_grams is null or unit_weight_grams > 0);
