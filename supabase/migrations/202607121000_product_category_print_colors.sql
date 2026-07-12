alter table public.product_categories
  add column if not exists print_color text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'product_categories_print_color_hex_check'
      and conrelid = 'public.product_categories'::regclass
  ) then
    alter table public.product_categories
      add constraint product_categories_print_color_hex_check
      check (print_color is null or print_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end
$$;
