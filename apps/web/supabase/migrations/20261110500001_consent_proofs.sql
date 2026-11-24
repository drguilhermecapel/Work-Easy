-- Consent proof kept after account deletion. The consent history of an account is removed with the
-- account (consents.user_id cascades), so anonymize_user copies the account's decisions that are
-- still within five years to consent_proofs before anything is erased. The copy has no user id: a
-- random owner key links it to the account in consent_proof_links. Neither table is readable by
-- authenticated or anon users; the service role reads them.
-- private.purge_expired_consent_proofs() deletes the proofs past retain_until and the links left
-- without proofs. Its schedule is not set here: it has to be scheduled (for example with pg_cron).
-- The rest of anonymize_user is unchanged.

create table public.consent_proofs (
  id uuid primary key default gen_random_uuid(),
  proof_owner uuid not null,
  purpose public.consent_purpose not null,
  version text not null check (char_length(version) between 1 and 40),
  granted boolean not null,
  at timestamptz not null,
  retain_until timestamptz not null
);

comment on table public.consent_proofs is 'Consent decisions kept five years after the account is deleted. No account id.';

create index consent_proofs_owner_idx on public.consent_proofs (proof_owner);
create index consent_proofs_retain_idx on public.consent_proofs (retain_until);

-- user_id has no foreign key: the link must outlive the profile it points from.
create table public.consent_proof_links (
  user_id uuid primary key,
  proof_owner uuid not null unique
);

comment on table public.consent_proof_links is 'Links an erased account to its consent proofs. Service role only.';

alter table public.consent_proofs enable row level security;
alter table public.consent_proof_links enable row level security;

-- Only the service role reads these tables. No policy exists for authenticated or anon users.
-- The service-role read policy is explicit because every table in public has one; the grants
-- below are what limit access.
create policy consent_proofs_service_read on public.consent_proofs
  for select to service_role using (true);
create policy consent_proof_links_service_read on public.consent_proof_links
  for select to service_role using (true);

revoke all on public.consent_proofs, public.consent_proof_links from public, anon, authenticated, service_role;
grant select on public.consent_proofs, public.consent_proof_links to service_role;

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
  update public.care_recipients cr
     set first_name = 'Removido', birth_year = null, preferences = null, emergency_contact = null
    from public.households h
   where cr.household_id = h.id and h.owner_id = p_user;

  delete from public.notifications where user_id = p_user and status = 'queued';
  update public.notifications set phone = null, email = null, params = '{}' where user_id = p_user;

  perform private.audit('user.anonymized', 'profile', p_user::text, '{}'::jsonb);
end;
$$;

-- Deletes the proofs past their retention and the links left without any proof.
create function private.purge_expired_consent_proofs()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.consent_proofs where retain_until <= now();
  delete from public.consent_proof_links l
   where not exists (select 1 from public.consent_proofs p where p.proof_owner = l.proof_owner);
end;
$$;

revoke all on function private.purge_expired_consent_proofs() from public, anon, authenticated;
