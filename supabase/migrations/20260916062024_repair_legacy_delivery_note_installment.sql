do $$
declare
  v_note_id uuid;
  v_customer_id uuid;
begin
  select id, customer_id
    into v_note_id, v_customer_id
  from public.delivery_notes
  where delivery_number = 'DN2026090069'
    and delivery_date = date '2026-09-16'
    and status = 'confirmed'
    and total_amount = 4640
    and previous_outstanding = 17420
    and installment_paid = 17420
    and remaining_outstanding = 0
    and is_installment_plan = true
  for update;

  if v_note_id is null then
    if exists (
      select 1
      from public.delivery_notes dn
      join public.customers c on c.id = dn.customer_id
      where dn.delivery_number = 'DN2026090069'
        and dn.installment_paid = 0
        and dn.remaining_outstanding = 17420
        and dn.is_installment_plan = false
        and c.outstanding_balance = 17420
    ) then
      raise notice 'บิล DN2026090069 ถูกซ่อมแล้ว';
      return;
    end if;
    raise exception 'ยกเลิกการซ่อม: ไม่พบบิล DN2026090069 ที่ตรงกับข้อมูลเดิมทุกช่อง';
  end if;

  update public.delivery_notes
  set installment_paid = 0,
      remaining_outstanding = previous_outstanding,
      is_installment_plan = false
  where id = v_note_id;

  update public.customers
  set outstanding_balance = 17420
  where id = v_customer_id
    and outstanding_balance = 0
    and not exists (
      select 1
      from public.delivery_notes newer
      where newer.customer_id = v_customer_id
        and newer.status = 'confirmed'
        and newer.created_at > (
          select repaired.created_at
          from public.delivery_notes repaired
          where repaired.id = v_note_id
        )
    );

  if not found then
    raise exception 'ยกเลิกการซ่อม: ยอดลูกค้าเปลี่ยนไปหรือมีบิลใหม่กว่าแล้ว';
  end if;
end
$$;
