-- Every application caller uses the server admin client; this mutation must stay server-only.
revoke all on function public.create_store_delivery_note(uuid, uuid[], uuid, uuid, date, text, uuid, jsonb, uuid, numeric, numeric, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_store_delivery_note(uuid, uuid[], uuid, uuid, date, text, uuid, jsonb, uuid, numeric, numeric, jsonb)
  to service_role;
