-- Extract billed delivery numbers from billing_records.snapshot_rows on the
-- database side instead of transferring full JSONB snapshots to the app.
-- Result set is identical to parsing snapshot_rows in application code.

-- Composite index for the date-range overlap lookup used by billing pages.
create index if not exists billing_records_org_date_range_idx
  on public.billing_records (organization_id, from_date, to_date);

create or replace function public.get_billed_delivery_numbers(
  p_organization_id uuid,
  p_from_date date,
  p_to_date date
)
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select distinct elem ->> 'deliveryNumber'
  from public.billing_records br
  cross join lateral jsonb_array_elements(coalesce(br.snapshot_rows, '[]'::jsonb)) as elem
  where br.organization_id = p_organization_id
    and br.from_date <= p_to_date
    and br.to_date >= p_from_date
    and elem ->> 'deliveryNumber' is not null;
$$;

-- App reads through the service role only; keep anon/authenticated out.
revoke all on function public.get_billed_delivery_numbers(uuid, date, date) from public, anon, authenticated;
grant execute on function public.get_billed_delivery_numbers(uuid, date, date) to service_role;
