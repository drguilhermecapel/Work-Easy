-- Privacy and retention fixes for the care line and for the retention purge.
--
-- 1. public.anonymize_user clears the free text of the family's shifts (shifts.notes) and of the
--    daily reports of those shifts (meals, activities, mood, notes). The shifts and the reports stay.
-- 2. private.shares_contact and private.is_counterpart release nothing from a shift that the family
--    canceled (status canceled). Shifts in the other statuses keep the rule they had.
-- 3. public.run_retention_purge also deletes assist_usage_events older than one day. The result keeps
--    the two counts it already reported; the removal of usage events is not in the result.
--
-- Each function is the last definition of its name, copied whole and changed only where listed above.
-- Signatures, security definer, the empty search_path and the grants are unchanged (create or replace).

create or replace function public.anonymize_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_copied integer;
begin
  if not private.is_service_role() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  -- Identity documents live in Storage, which SQL cannot delete from. account-delete removes
  -- the folder provider-documents/<user_id>/ through the Storage API first; until it is
  -- empty the account is not anonymized (the order is Storage, anonymize_user, Auth).
  if exists (select 1 from storage.objects o
              where o.bucket_id = 'provider-documents' and (storage.foldername(o.name))[1] = p_user::text) then
    raise exception 'storage_not_empty' using errcode = 'P0001';
  end if;

  -- Consent proof, before anything is erased: the decisions still within five years are copied
  -- without the account id, and the account is linked to the copy. A repeated call adds nothing.
  if not exists (select 1 from public.consent_proof_links l where l.user_id = p_user) then
    v_owner := gen_random_uuid();
    insert into public.consent_proofs (proof_owner, purpose, version, granted, at, retain_until)
    select v_owner, c.purpose, c.version, c.granted, c.at, c.at + interval '5 years'
      from public.consents c
     where c.user_id = p_user and c.at + interval '5 years' > now();
    get diagnostics v_copied = row_count;
    if v_copied > 0 then
      insert into public.consent_proof_links (user_id, proof_owner) values (p_user, v_owner);
    end if;
  end if;

  update public.profiles
     set full_name = null, phone = null, deleted_at = coalesce(deleted_at, now())
   where id = p_user;

  -- As a provider: the public page goes away; jobs and payments remain.
  update public.providers
     set display_name = 'Prestador removido',
         slug = 'removido-' || replace(id::text, '-', ''),
         bio = null,
         avatar_path = null,
         status = 'suspended',
         accepts_platform_requests = false
   where id = p_user;
  update public.services set active = false, description = null where provider_id = p_user;
  delete from public.provider_neighborhoods where provider_id = p_user;
  delete from public.availability where provider_id = p_user;
  update public.provider_clients
     set name = 'Cliente removido', phone = null, email = null, notes = null, cpf_cnpj = null
   where provider_id = p_user;
  update public.quotes set client_name = null, client_phone = null, notes = null where provider_id = p_user;
  update public.checkins set lat = null, lng = null where provider_id = p_user;
  delete from public.provider_documents where provider_id = p_user;

  -- As a client: entries about this person in providers' CRMs and quotes.
  update public.quotes q
     set client_name = null, client_phone = null
    from public.provider_clients pc
   where q.provider_client_id = pc.id and pc.client_id = p_user;
  update public.provider_clients
     set name = 'Cliente removido', phone = null, email = null, notes = null, cpf_cnpj = null
   where client_id = p_user;
  update public.requests set description = 'Pedido removido a pedido do titular.', preferred_dates = null
   where client_id = p_user;
  update public.reviews set comment = null where client_id = p_user;
  update public.bookings set notes = null, canceled_reason = null
   where client_id = p_user or provider_id = p_user;
  update public.booking_events e set reason = null
    from public.bookings b
   where e.booking_id = b.id and (b.client_id = p_user or b.provider_id = p_user);
  -- Payments stay for tax records, but the gateway payload (payer name, CPF/CNPJ, e-mail)
  -- keeps only the fiscal fields, and the payment pages are dropped.
  update public.payments
     set raw = case when raw is null then null else jsonb_strip_nulls(jsonb_build_object(
           'id', raw -> 'id', 'status', raw -> 'status', 'value', raw -> 'value',
           'netValue', raw -> 'netValue', 'billingType', raw -> 'billingType',
           'dueDate', raw -> 'dueDate', 'paymentDate', raw -> 'paymentDate',
           'confirmedDate', raw -> 'confirmedDate', 'invoiceNumber', raw -> 'invoiceNumber')) end,
         invoice_url = null, pix_qr_code = null, pix_payload = null
   where payer_id = p_user or provider_id = p_user;
  -- The same rule for the webhook events of those payments: the event type and the fiscal
  -- fields of the payment stay; the customer, the invoice link and the descriptions go.
  update public.payment_events e
     set payload = jsonb_strip_nulls(jsonb_build_object(
           'event', e.payload -> 'event',
           'payment', jsonb_strip_nulls(jsonb_build_object(
             'id', e.payload #> '{payment,id}', 'status', e.payload #> '{payment,status}',
             'value', e.payload #> '{payment,value}', 'netValue', e.payload #> '{payment,netValue}',
             'billingType', e.payload #> '{payment,billingType}', 'dueDate', e.payload #> '{payment,dueDate}',
             'paymentDate', e.payload #> '{payment,paymentDate}', 'confirmedDate', e.payload #> '{payment,confirmedDate}',
             'invoiceNumber', e.payload #> '{payment,invoiceNumber}'))))
   where e.payload is not null
     and e.payment_id in (select p.id from public.payments p where p.payer_id = p_user or p.provider_id = p_user);
  update public.households set name = 'Removida', notes = null where owner_id = p_user;
  -- Free text of the care line: the notes of the family's shifts and the daily report of each shift.
  update public.shifts s set notes = null
    from public.households h
   where s.household_id = h.id and h.owner_id = p_user and s.notes is not null;
  update public.daily_reports r set meals = null, activities = null, mood = null, notes = null
    from public.shifts s join public.households h on h.id = s.household_id
   where r.shift_id = s.id and h.owner_id = p_user;
  update public.care_recipients cr
     set first_name = 'Removido', birth_year = null, preferences = null, emergency_contact = null
    from public.households h
   where cr.household_id = h.id and h.owner_id = p_user;

  delete from public.notifications where user_id = p_user and status = 'queued';
  update public.notifications set phone = null, email = null, params = '{}' where user_id = p_user;

  perform private.audit('user.anonymized', 'profile', p_user::text, '{}'::jsonb);
end;
$$;

create or replace function private.shares_contact(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.bookings b
     where b.origin = 'platform'
       and ((b.client_id = (select auth.uid()) and b.provider_id = p_user
             and b.status not in ('requested', 'canceled'))
         or (b.provider_id = (select auth.uid()) and b.client_id = p_user
             and b.status not in ('requested', 'canceled')))
  )
  or exists (
    select 1 from public.shifts s
      join public.households h on h.id = s.household_id
     where s.status <> 'canceled'
       and ((h.owner_id = (select auth.uid()) and s.provider_id = p_user)
         or (s.provider_id = (select auth.uid()) and h.owner_id = p_user))
  );
$$;

create or replace function private.is_counterpart(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.bookings b
     where b.origin = 'platform'
       and ((b.client_id = (select auth.uid()) and b.provider_id = p_user)
         or (b.provider_id = (select auth.uid()) and b.client_id = p_user))
  )
  or exists (
    -- a client sees who sent a proposal (the provider never sees the client before a match)
    select 1 from public.proposals p
      join public.requests r on r.id = p.request_id
     where p.provider_id = p_user and r.client_id = (select auth.uid())
  )
  or exists (
    -- the family sees the assigned caregiver; the assigned caregiver sees the family
    select 1 from public.shifts s
      join public.households h on h.id = s.household_id
     where s.status <> 'canceled'
       and ((h.owner_id = (select auth.uid()) and s.provider_id = p_user)
         or (s.provider_id = (select auth.uid()) and h.owner_id = p_user))
  );
$$;

create or replace function public.run_retention_purge()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_consent_proofs bigint;
  v_access_events bigint;
begin
  select count(*) into v_consent_proofs from public.consent_proofs where retain_until <= now();
  select count(*) into v_access_events from public.access_events where occurred_at < now() - interval '6 months';
  perform private.purge_expired_consent_proofs();
  perform private.purge_access_events();
  -- Assistant usage events older than one day. They are not part of the result.
  delete from public.assist_usage_events where used_at < now() - interval '1 day';
  return jsonb_build_object(
    'consent_proofs_removed', v_consent_proofs,
    'access_events_removed', v_access_events
  );
end;
$$;
