begin;

-- Additive only: all historical lines remain ordinary sales.
alter table public.order_items
  add column if not exists is_replacement boolean not null default false;

create or replace function public.enforce_order_replacement_price()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.is_replacement then
    new.unit_price := 0;
    new.line_total := 0;
    new.notes := 'ส่งชดเชย (ไม่คิดเงิน)';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_order_replacement_price on public.order_items;
create trigger enforce_order_replacement_price
before insert or update on public.order_items
for each row execute function public.enforce_order_replacement_price();

comment on column public.order_items.is_replacement is
  'Free outbound replacement shipment; quantity and warehouse stock handling remain unchanged.';
notify pgrst, 'reload schema';
commit;
