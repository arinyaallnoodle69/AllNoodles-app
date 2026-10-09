BEGIN;
DO $$
DECLARE
  org uuid;
  vehicle uuid;
  main_ids uuid[];
  noodle_ids uuid[];
  before_rows jsonb;
  after_rows jsonb;
  saved_noodle_rows jsonb;
  rejected boolean;
BEGIN
  SELECT c.organization_id, c.default_vehicle_id INTO org, vehicle
    FROM public.customers c JOIN public.vehicles v ON v.id = c.default_vehicle_id
    WHERE c.is_active AND v.name LIKE '%กรุงเทพ%' LIMIT 1;
  SELECT array_agg(id ORDER BY customer_code DESC) INTO main_ids
    FROM public.customers WHERE organization_id = org AND is_active AND default_vehicle_id = vehicle AND customer_code IN ('ANS001','ANS015');
  SELECT array_agg(id ORDER BY customer_code DESC) INTO noodle_ids
    FROM public.customers WHERE organization_id = org AND is_active AND default_vehicle_id = vehicle AND customer_code IN ('ANS002','ANS004');
  ASSERT cardinality(main_ids) = 2 AND cardinality(noodle_ids) = 2, 'Missing existing Bangkok test stores';
  SELECT jsonb_agg(to_jsonb(c) - 'updated_at' - 'packing_list_sort_order' ORDER BY id) INTO before_rows FROM public.customers c;
  PERFORM public.update_customer_packing_order(org, vehicle, noodle_ids);
  ASSERT (SELECT packing_list_sort_order = 0 FROM public.customers WHERE id = noodle_ids[1]);
  SELECT jsonb_agg(to_jsonb(c) ORDER BY id) INTO saved_noodle_rows FROM public.customers c WHERE id = ANY(noodle_ids);
  PERFORM public.update_customer_packing_order(org, vehicle, main_ids);
  ASSERT (SELECT packing_list_sort_order = 0 FROM public.customers WHERE id = main_ids[1]);
  ASSERT (SELECT jsonb_agg(to_jsonb(c) ORDER BY id) = saved_noodle_rows FROM public.customers c WHERE id = ANY(noodle_ids)), 'Other group changed';
  SELECT jsonb_agg(to_jsonb(c) - 'updated_at' - 'packing_list_sort_order' ORDER BY id) INTO after_rows FROM public.customers c;
  ASSERT before_rows = after_rows, 'Shared order, vehicle or other customer data changed';
  rejected := false;
  BEGIN
    PERFORM public.update_customer_packing_order(org, vehicle, ARRAY[main_ids[2], '00000000-0000-0000-0000-000000000000'::uuid]);
  EXCEPTION WHEN OTHERS THEN rejected := true;
  END;
  ASSERT rejected, 'Invalid partial list accepted';
  ASSERT (SELECT packing_list_sort_order = 1 FROM public.customers WHERE id = main_ids[2]), 'Partial write was not rolled back';
  rejected := false;
  BEGIN
    PERFORM public.update_customer_packing_order('00000000-0000-0000-0000-000000000000', vehicle, main_ids);
  EXCEPTION WHEN OTHERS THEN rejected := true;
  END;
  ASSERT rejected, 'Cross-organization write accepted';
  rejected := false;
  BEGIN
    PERFORM public.update_customer_packing_order(org, vehicle, ARRAY[main_ids[1],main_ids[1]]);
  EXCEPTION WHEN OTHERS THEN rejected := true;
  END;
  ASSERT rejected, 'Duplicate IDs accepted';
END;
$$;
ROLLBACK;
SELECT 'packing order isolation, atomic rollback and organization checks passed; all test writes rolled back' AS result;
