alter table public.products
  add column if not exists print_background_color text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_print_background_color_hex_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_print_background_color_hex_check
      check (print_background_color is null or print_background_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end
$$;
