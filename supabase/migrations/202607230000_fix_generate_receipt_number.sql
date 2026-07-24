-- Migration: Fix generate_receipt_number to use max() instead of count(*) to prevent duplicates on deletion or concurrency
create or replace function public.generate_receipt_number(
  p_organization_id uuid,
  p_date date default current_date
)
returns text
language plpgsql
security definer
as $$
declare
  v_prefix text;
  v_max_seq int;
  v_new_number text;
begin
  -- Format: RCV + YYMMDD
  v_prefix := 'RCV' || to_char(p_date, 'YYMMDD');
  
  -- Find the maximum sequence number (last 2 digits) of existing receipts for this org and date
  -- matching pattern RCVYYMMDDXX
  select coalesce(
    max(nullif(substring(receipt_number from 10 for 2), '')::integer),
    0
  ) into v_max_seq
  from public.inventory_receipts
  where organization_id = p_organization_id
    and date(received_at at time zone 'Asia/Bangkok') = p_date
    and receipt_number ~ ('^' || v_prefix || '[0-9]{2}$');
    
  -- Result: RCVYYMMDD + XX (2 digits running)
  v_new_number := v_prefix || lpad((v_max_seq + 1)::text, 2, '0');
  
  return v_new_number;
end;
$$;
