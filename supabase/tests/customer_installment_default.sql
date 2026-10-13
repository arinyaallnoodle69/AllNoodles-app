begin;
create temp table customers as select * from public.customers with no data;
create temp table delivery_notes as select * from public.delivery_notes with no data;
alter table pg_temp.delivery_notes alter column id set default gen_random_uuid();
create function pg_temp.test_installment(p_customer_id uuid,p_dn_id uuid default null,p_previous_outstanding numeric default null,p_installment_paid numeric default null)
returns jsonb language plpgsql as $fn$
declare
 p_organization_id uuid := md5('payment-org')::uuid;
 p_vehicle_id uuid; p_warehouse_id uuid; p_created_by uuid;
 v_dn_id uuid := p_dn_id; v_dn_number text; v_target_date date := current_date;
 v_primary_order_id uuid; v_clean_notes text;
 v_cust_outstanding numeric; v_cust_installment numeric;
 v_prev_outstanding numeric; v_installment_paid numeric:=0;
 v_remaining_outstanding numeric:=0; v_is_installment boolean:=false;
begin
 -- Omitted payment fields on reprint must preserve the existing bill's payment.
    if v_dn_id is not null and p_installment_paid is null then
      select installment_paid into p_installment_paid from pg_temp.delivery_notes where id = v_dn_id;
    end if;
    -- Lock customer profile to fetch and update balance info safely
  
      select outstanding_balance, installment_limit
        into v_cust_outstanding, v_cust_installment
      from pg_temp.customers
      where id = p_customer_id and organization_id = p_organization_id
      for update;


      -- Only a new automatic bill inherits an active customer installment plan.
      if v_dn_id is null and p_previous_outstanding is null and p_installment_paid is null
        and v_cust_outstanding>0 and v_cust_installment>0 then
        p_installment_paid := least(v_cust_outstanding, v_cust_installment);
      end if;

      if v_dn_id is null then
        v_dn_number := 'TEST-DN';

        v_prev_outstanding := coalesce(p_previous_outstanding, v_cust_outstanding, 0);

        if p_installment_paid is not null and p_installment_paid > 0 then
          v_installment_paid := least(v_prev_outstanding, p_installment_paid);
          v_is_installment := true;
          v_remaining_outstanding := greatest(0, v_prev_outstanding - v_installment_paid);
        else
          v_installment_paid := 0;
          v_is_installment := false;
          v_remaining_outstanding := 0;
        end if;

        insert into pg_temp.delivery_notes (
          organization_id,
          order_id,
          customer_id,
          vehicle_id,
          warehouse_id,
          delivery_number,
          delivery_date,
          status,
          notes,
          created_by,
          previous_outstanding,
          installment_paid,
          remaining_outstanding,
          is_installment_plan
        ) values (
          p_organization_id,
          v_primary_order_id,
          p_customer_id,
          p_vehicle_id,
          p_warehouse_id,
          v_dn_number,
          v_target_date,
          'confirmed',
          v_clean_notes,
          p_created_by,
          v_prev_outstanding,
          v_installment_paid,
          v_remaining_outstanding,
          v_is_installment
        ) returning id into v_dn_id;
      else
        select dn.previous_outstanding into v_prev_outstanding from pg_temp.delivery_notes dn where dn.id = v_dn_id;
        v_prev_outstanding := coalesce(p_previous_outstanding, v_prev_outstanding, v_cust_outstanding, 0);

        if p_installment_paid is not null and p_installment_paid > 0 then
          v_installment_paid := least(v_prev_outstanding, p_installment_paid);
          v_is_installment := true;
          v_remaining_outstanding := greatest(0, v_prev_outstanding - v_installment_paid);
        else
          v_installment_paid := 0;
          v_is_installment := false;
          v_remaining_outstanding := 0;
        end if;

        update pg_temp.delivery_notes
        set
          vehicle_id = coalesce(p_vehicle_id, vehicle_id),
          warehouse_id = p_warehouse_id,
          previous_outstanding = v_prev_outstanding,
          installment_paid = v_installment_paid,
          remaining_outstanding = v_remaining_outstanding,
          is_installment_plan = v_is_installment,
          notes = case
            when v_clean_notes is null then notes
            when notes is null or trim(notes) = '' then v_clean_notes
            else notes || ' / ' || v_clean_notes
          end
        where id = v_dn_id;
      end if;

      
       if v_prev_outstanding is not null then
        update pg_temp.customers
        set outstanding_balance = v_remaining_outstanding,
            installment_limit = case
              when v_remaining_outstanding > 0 and v_is_installment then p_installment_paid
              else null
            end
        where id = p_customer_id;
      end if;


 return jsonb_build_object('id',v_dn_id,'previous',v_prev_outstanding,'paid',v_installment_paid,'remaining',v_remaining_outstanding,
 'limit',(select installment_limit from pg_temp.customers where id=p_customer_id),
 'balance',(select outstanding_balance from pg_temp.customers where id=p_customer_id));
end $fn$;
insert into pg_temp.customers(id,organization_id,outstanding_balance,installment_limit) values
 (md5('plan')::uuid,md5('payment-org')::uuid,0,null),
 (md5('debt-only')::uuid,md5('payment-org')::uuid,0,null),
 (md5('final-payment')::uuid,md5('payment-org')::uuid,200,300),
 (md5('override')::uuid,md5('payment-org')::uuid,1700,300),
 (md5('manual-debt-only')::uuid,md5('payment-org')::uuid,1700,300);
do $test$
declare r jsonb; bill uuid;
begin
 r:=pg_temp.test_installment(md5('plan')::uuid,null,2000,300);
 if (r->>'remaining')::numeric<>1700 or (r->>'limit')::numeric<>300 then raise exception 'Initial payment must remember 300 and leave 1700'; end if;
 r:=pg_temp.test_installment(md5('plan')::uuid);
 if (r->>'previous')::numeric<>1700 or (r->>'paid')::numeric<>300 or (r->>'remaining')::numeric<>1400 then raise exception 'New automatic bill must inherit previous 1700 and installment 300; got %',r; end if;
 bill:=(r->>'id')::uuid;
 r:=pg_temp.test_installment(md5('plan')::uuid,bill);
 if (r->>'remaining')::numeric<>1400 or (r->>'balance')::numeric<>1400 then raise exception 'Reprint must not deduct another payment'; end if;
 r:=pg_temp.test_installment(md5('debt-only')::uuid,null,2000,null);
 if (r->>'remaining')::numeric<>0 or r->>'limit' is not null then raise exception 'Debt-only behavior must stay unchanged'; end if;
 r:=pg_temp.test_installment(md5('debt-only')::uuid);
 if (r->>'previous')::numeric<>0 or (r->>'paid')::numeric<>0 then raise exception 'Debt-only must not carry forward'; end if;
 r:=pg_temp.test_installment(md5('final-payment')::uuid);
 if (r->>'paid')::numeric<>200 or (r->>'remaining')::numeric<>0 or r->>'limit' is not null then raise exception 'Final payment must not exceed remaining debt'; end if;
 r:=pg_temp.test_installment(md5('override')::uuid,null,1700,100);
 if (r->>'paid')::numeric<>100 or (r->>'limit')::numeric<>100 then raise exception 'Explicit payment overrides default'; end if;
 r:=pg_temp.test_installment(md5('manual-debt-only')::uuid,null,1700,null);
 if (r->>'paid')::numeric<>0 then raise exception 'Manual debt-only entry must not acquire automatic installment'; end if;
end $test$;
rollback;
select '8 installment assertions passed; temporary fixtures rolled back' as result;
