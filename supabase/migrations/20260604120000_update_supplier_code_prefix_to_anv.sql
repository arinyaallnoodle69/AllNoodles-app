-- Update newly generated supplier codes from TYVXXX to ANVXXX.

create or replace function public.next_supplier_code(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  insert into public.supplier_code_counters (organization_id, last_number)
  values (p_organization_id, 1)
  on conflict (organization_id) do update
    set last_number = public.supplier_code_counters.last_number + 1
  returning last_number into v_next;

  return 'ANV' || lpad(v_next::text, 3, '0');
end;
$$;
