begin;

create or replace function public.normalize_zero_delivery_installment()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(new.installment_paid, 0) = 0 then
    new.installment_paid := 0;
    new.remaining_outstanding := new.previous_outstanding;
    new.is_installment_plan := false;
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_zero_delivery_installment on public.delivery_notes;
create trigger normalize_zero_delivery_installment
before insert or update of previous_outstanding, installment_paid, remaining_outstanding, is_installment_plan
on public.delivery_notes
for each row execute function public.normalize_zero_delivery_installment();

commit;
