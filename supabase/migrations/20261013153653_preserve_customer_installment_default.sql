do $migration$
declare
  definition text;
  marker text := $marker$      if v_dn_id is null then
        v_dn_number := public.next_delivery_note_number(p_organization_id, v_target_date);$marker$;
begin
  select replace(pg_get_functiondef(oid), chr(13), '') into strict definition
    from pg_proc where proname='create_store_delivery_note' and pronamespace='public'::regnamespace and pronargs=12;
  if position(marker in definition)=0 then raise exception 'Delivery function changed; review installment migration'; end if;
  execute replace(definition, marker, $default$
      -- Only a new automatic bill inherits an active customer installment plan.
      if v_dn_id is null and p_previous_outstanding is null and p_installment_paid is null
        and v_cust_outstanding>0 and v_cust_installment>0 then
        p_installment_paid := least(v_cust_outstanding, v_cust_installment);
      end if;

$default$ || marker);
end $migration$;
