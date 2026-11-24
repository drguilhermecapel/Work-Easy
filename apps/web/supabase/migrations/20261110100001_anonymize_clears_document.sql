-- Account deletion and CRM documents: anonymize_user also clears the CPF/CNPJ of
-- CRM entries, in both directions: the entries the provider keeps about other people (by
-- provider_id) and the entries about the deleted person as a client (by client_id). Nothing
-- reads these documents after the account is gone: charges need an entry with a document,
-- so a charge for an erased entry is refused, and the account export runs before the deletion.
-- The rest of the function is unchanged.

create or replace function public.anonymize_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
  update public.care_recipients cr
     set first_name = 'Removido', birth_year = null, preferences = null, emergency_contact = null
    from public.households h
   where cr.household_id = h.id and h.owner_id = p_user;

  delete from public.notifications where user_id = p_user and status = 'queued';
  update public.notifications set phone = null, email = null, params = '{}' where user_id = p_user;

  perform private.audit('user.anonymized', 'profile', p_user::text, '{}'::jsonb);
end;
$$;
