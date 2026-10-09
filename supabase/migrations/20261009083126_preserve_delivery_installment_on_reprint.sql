do $migration$
declare
  definition text;
  marker text := '-- Lock customer profile to fetch and update balance info safely';
begin
  select pg_get_functiondef(oid) into strict definition from pg_proc
    where proname = 'create_store_delivery_note' and pronamespace = 'public'::regnamespace and pronargs = 12;
  if position(marker in definition) = 0 then raise exception 'Delivery function changed; review migration before applying'; end if;
  execute replace(definition, marker, $replacement$
    -- Omitted payment fields on reprint must preserve the existing bill's payment.
    if v_dn_id is not null and p_installment_paid is null then
      select installment_paid into p_installment_paid from public.delivery_notes where id = v_dn_id;
    end if;
    -- Lock customer profile to fetch and update balance info safely
  $replacement$);
end $migration$;
