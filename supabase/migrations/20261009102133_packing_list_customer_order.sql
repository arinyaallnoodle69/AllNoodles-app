-- Packing-sheet ordering is separate from the shared delivery/customer ordering.
ALTER TABLE public.customers ADD COLUMN packing_list_sort_order integer
  CHECK (packing_list_sort_order >= 0);

CREATE FUNCTION public.update_customer_packing_order(
  p_organization_id uuid, p_vehicle_id uuid, p_customer_ids uuid[]
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  updated_count integer;
BEGIN
  IF cardinality(p_customer_ids) IS NULL OR cardinality(p_customer_ids) NOT BETWEEN 1 AND 2000
    OR (SELECT count(DISTINCT id) FROM unnest(p_customer_ids) AS ids(id)) <> cardinality(p_customer_ids) THEN
    RAISE EXCEPTION 'Invalid customer list';
  END IF;
  PERFORM 1 FROM public.customers
    WHERE organization_id = p_organization_id AND id = ANY(p_customer_ids)
    ORDER BY id FOR UPDATE;
  UPDATE public.customers AS c SET packing_list_sort_order = requested.position - 1
    FROM unnest(p_customer_ids) WITH ORDINALITY AS requested(id, position)
    WHERE c.id = requested.id AND c.organization_id = p_organization_id
      AND c.is_active AND c.default_vehicle_id = p_vehicle_id;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  IF updated_count <> cardinality(p_customer_ids) THEN
    RAISE EXCEPTION 'Customer list changed; refresh and retry';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.update_customer_packing_order(uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_customer_packing_order(uuid, uuid, uuid[]) TO service_role;
