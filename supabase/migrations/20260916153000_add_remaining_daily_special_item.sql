begin;

alter table public.daily_order_special_items
  drop constraint if exists daily_order_special_items_type_check;

alter table public.daily_order_special_items
  add constraint daily_order_special_items_type_check
  check (entry_type in ('office', 'claim', 'remaining'));

comment on table public.daily_order_special_items is
  'Daily non-sale quantities. Office adds factory demand, claim adds vehicle loading, remaining subtracts fresh-production demand.';

commit;
