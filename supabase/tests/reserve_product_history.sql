-- Read-only reconciliation against the existing live reserve balances.
do $$
declare r record; history jsonb; reconstructed numeric;
begin
  for r in select g.organization_id,g.id group_id,o.product_id,o.quantity
    from public.fresh_reserve_stock_groups g join public.fresh_reserve_stock_openings o on o.group_id=g.id loop
    history:=public.get_reserve_product_history(r.organization_id,r.group_id,r.product_id,'2000-01-01');
    if history is null then continue; end if;
    select r.quantity+coalesce(sum((e->>'delta')::numeric),0)-(history->>'futureLegacy')::numeric into reconstructed
      from jsonb_array_elements(history->'events') e where (e->>'at')::timestamptz<=(history->>'now')::timestamptz;
    if reconstructed<>(history->>'available')::numeric then raise exception 'History does not reconcile for product %',r.product_id; end if;
    if public.get_reserve_product_history('00000000-0000-0000-0000-000000000000',r.group_id,r.product_id,'2000-01-01') is not null then raise exception 'Organization isolation failed'; end if;
  end loop;
  if has_function_privilege('authenticated','public.get_reserve_product_history(uuid,uuid,uuid,date)','EXECUTE')
    or has_function_privilege('anon','public.get_reserve_product_history(uuid,uuid,uuid,date)','EXECUTE') then raise exception 'History RPC must remain server-only'; end if;
end $$;
