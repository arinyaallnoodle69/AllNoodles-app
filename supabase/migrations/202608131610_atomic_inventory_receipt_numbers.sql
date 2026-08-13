-- Allocate inventory receipt numbers atomically so concurrent requests and
-- multi-supplier receipts cannot receive the same number.

create table if not exists public.inventory_receipt_number_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  receipt_date date not null,
  last_number integer not null default 0,
  primary key (organization_id, receipt_date),
  constraint inventory_receipt_number_counters_nonnegative check (last_number >= 0)
);

insert into public.inventory_receipt_number_counters (
  organization_id,
  receipt_date,
  last_number
)
select
  organization_id,
  (received_at at time zone 'Asia/Bangkok')::date,
  max(
    case
      when receipt_number ~ '^RCV[0-9]{8,}$'
        then substring(receipt_number from 10)::integer
      else 0
    end
  )
from public.inventory_receipts
group by organization_id, (received_at at time zone 'Asia/Bangkok')::date
on conflict (organization_id, receipt_date) do update
set last_number = greatest(
  public.inventory_receipt_number_counters.last_number,
  excluded.last_number
);

alter table public.inventory_receipt_number_counters enable row level security;
alter table public.inventory_receipt_number_counters force row level security;
revoke all on public.inventory_receipt_number_counters from anon, authenticated;

drop policy if exists inventory_receipt_number_counters_deny_api_access
  on public.inventory_receipt_number_counters;
create policy inventory_receipt_number_counters_deny_api_access
on public.inventory_receipt_number_counters
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create or replace function public.generate_receipt_number(
  p_organization_id uuid,
  p_date date default current_date
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_next_number integer;
begin
  v_prefix := 'RCV' || to_char(p_date, 'YYMMDD');

  insert into public.inventory_receipt_number_counters (
    organization_id,
    receipt_date,
    last_number
  )
  values (
    p_organization_id,
    p_date,
    1
  )
  on conflict (organization_id, receipt_date) do update
  set last_number = public.inventory_receipt_number_counters.last_number + 1
  returning last_number into v_next_number;

  return v_prefix || lpad(v_next_number::text, 2, '0');
end;
$$;
