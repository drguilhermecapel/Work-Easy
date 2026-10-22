-- 11 Administration: review actions (all require is_admin() and write audit_log) and
-- the dashboard views. Views run with the caller's rights (security_invoker) and the
-- admin RLS policies; they also filter on is_admin(), because participants can read
-- some of the underlying rows (their own provider row or disputed job).

create function private.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
end;
$$;

-- The verification steps of the occupation's policy that no accepted document of the
-- provider covers yet. Shared by the occupation approval and by the first approval of the
-- provider, so that neither can approve an occupation the policy would refuse.
-- An occupation WITHOUT a policy has no steps to list, so this returns empty for it: callers
-- must check private.occupation_has_policy first and treat a missing policy as a block.
create function private.occupation_missing_steps(p_provider uuid, p_occupation text)
returns public.verification_step[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(required.step), '{}')
    from (
      select unnest(p.verification) as step
        from public.occupation_policies p where p.occupation_slug = p_occupation
    ) required
   where not exists (
     select 1 from public.provider_documents d
      where d.provider_id = p_provider and d.step = required.step and d.status = 'accepted'
   );
$$;

-- A document that stops being 'accepted' (rejected by the admin, or removed) takes back the
-- approval of the occupations that depended on it: every approved occupation of the provider
-- whose policy asks for the document's step and that no other accepted document covers goes
-- back to approved = false, with one audit entry each. Runs for any writer (admin function,
-- service role, cascade), so no path leaves an approval standing without its document.
create function private.revoke_approvals_of_lost_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text;
  v_slugs text[];
begin
  if old.status <> 'accepted' then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.status = 'accepted'
     and new.step = old.step and new.provider_id = old.provider_id then
    return null;
  end if;
  -- Deleting the provider cascades to its documents and occupations: nothing to revoke.
  if not exists (select 1 from public.providers p where p.id = old.provider_id) then
    return null;
  end if;

  with revoked as (
    update public.provider_occupations po
       set approved = false
     where po.provider_id = old.provider_id
       and po.approved
       and exists (select 1 from public.occupation_policies p
                    where p.occupation_slug = po.occupation_slug and old.step = any (p.verification))
       and old.step = any (private.occupation_missing_steps(po.provider_id, po.occupation_slug))
    returning po.occupation_slug
  )
  select coalesce(array_agg(occupation_slug order by occupation_slug), '{}') into v_slugs from revoked;

  foreach v_slug in array v_slugs
  loop
    perform private.audit('occupation.approval_revoked', 'provider_occupation',
                          old.provider_id::text || ':' || v_slug,
                          jsonb_build_object('document', old.id, 'step', old.step,
                                             'cause', case when tg_op = 'DELETE' then 'document_removed'
                                                           else 'document_' || new.status::text end));
  end loop;
  return null;
end;
$$;

create trigger provider_documents_revoke_approvals
  after update of status, step, provider_id or delete on public.provider_documents
  for each row execute function private.revoke_approvals_of_lost_document();

create function public.admin_review_document(p_document uuid, p_accept boolean, p_reason text default null)
returns public.document_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.document_status := case when p_accept then 'accepted' else 'rejected' end;
begin
  perform private.require_admin();
  if p_accept is null or (not p_accept and nullif(trim(p_reason), '') is null) then
    raise exception 'not_allowed' using errcode = 'P0001', detail = 'reason required to reject';
  end if;
  -- A document is accepted only when its file is in the bucket.
  if p_accept and not exists (
       select 1 from public.provider_documents d
         join storage.objects o on o.bucket_id = 'provider-documents' and o.name = d.storage_path
        where d.id = p_document) then
    raise exception 'not_allowed' using errcode = 'P0001', detail = 'file missing';
  end if;

  update public.provider_documents
     set status = v_status,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         rejection_reason = case when p_accept then null else p_reason end
   where id = p_document;
  if not found then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  perform private.audit('document.' || v_status::text, 'provider_document', p_document::text,
                        jsonb_build_object('reason', p_reason));
  return v_status;
end;
$$;

create function public.admin_set_registry_status(
  p_provider uuid,
  p_occupation text,
  p_status public.registry_status,
  p_reason text default null
)
returns public.registry_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.registry_status;
begin
  perform private.require_admin();
  select registry_status into v_old from public.provider_occupations
   where provider_id = p_provider and occupation_slug = p_occupation for update;
  if not found or p_status is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  update public.provider_occupations set registry_status = p_status
   where provider_id = p_provider and occupation_slug = p_occupation;

  perform private.audit('registry.status', 'provider_occupation', p_provider::text || ':' || p_occupation,
                        jsonb_build_object('from', v_old, 'to', p_status, 'reason', p_reason));
  return p_status;
end;
$$;

create function public.admin_set_provider_status(
  p_provider uuid,
  p_status public.provider_status,
  p_reason text default null
)
returns public.provider_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.provider_status;
  v_approved text[] := '{}';
begin
  perform private.require_admin();
  select status into v_old from public.providers where id = p_provider for update;
  if not found or p_status is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  update public.providers set status = p_status where id = p_provider;
  -- The first approval (from draft or review) approves the occupations on file whose policy
  -- is fully covered: every verification step with an accepted document and a registry that was
  -- not rejected (the same rule as admin_set_occupation_approval). The others stay to be
  -- approved one by one, as do the occupations added later; reinstating a suspended provider
  -- approves nothing.
  if p_status = 'approved' and v_old in ('draft', 'pending_review') then
    with done as (
      update public.provider_occupations po
         set approved = true
       where po.provider_id = p_provider and not po.approved and po.registry_status <> 'rejected'
         and private.occupation_has_policy(po.occupation_slug)
         and cardinality(private.occupation_missing_steps(po.provider_id, po.occupation_slug)) = 0
      returning po.occupation_slug
    )
    select coalesce(array_agg(occupation_slug order by occupation_slug), '{}') into v_approved from done;
  end if;
  perform private.audit('provider.status', 'provider', p_provider::text,
                        jsonb_build_object('from', v_old, 'to', p_status, 'reason', p_reason,
                                           'occupations_approved', to_jsonb(v_approved)));
  return p_status;
end;
$$;

-- Approves (or withdraws the approval of) one occupation of a provider. Approving needs every
-- verification step of the occupation's policy covered by an accepted document, and a
-- registry that was not rejected. An occupation without a policy is never approved
-- (not_allowed, detail 'policy missing').
create function public.admin_set_occupation_approval(
  p_provider uuid,
  p_occupation text,
  p_approved boolean,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.provider_occupations;
  v_missing public.verification_step[];
begin
  perform private.require_admin();
  select * into v_row from public.provider_occupations
   where provider_id = p_provider and occupation_slug = p_occupation for update;
  if not found or p_approved is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  if p_approved then
    if v_row.registry_status = 'rejected' then
      raise exception 'not_allowed' using errcode = 'P0001', detail = 'registry rejected';
    end if;
    -- Without a policy nothing says which documents are required, so nothing can be approved.
    if not private.occupation_has_policy(p_occupation) then
      raise exception 'not_allowed' using errcode = 'P0001', detail = 'policy missing';
    end if;
    v_missing := private.occupation_missing_steps(p_provider, p_occupation);
    if cardinality(v_missing) > 0 then
      raise exception 'documents_missing' using errcode = 'P0001', detail = array_to_string(v_missing, ',');
    end if;
  end if;

  update public.provider_occupations set approved = p_approved
   where provider_id = p_provider and occupation_slug = p_occupation;
  perform private.audit('occupation.approval', 'provider_occupation', p_provider::text || ':' || p_occupation,
                        jsonb_build_object('approved', p_approved, 'reason', p_reason));
  return p_approved;
end;
$$;

-- The gateway payload of a payment (payer tax data): hidden from payers and providers.
create function public.admin_get_payment_raw(p_payment uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_raw jsonb;
begin
  perform private.require_admin();
  select raw into v_raw from public.payments where id = p_payment;
  if not found then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  perform private.audit('payment.raw_viewed', 'payment', p_payment::text, '{}'::jsonb);
  return v_raw;
end;
$$;

create function public.admin_set_setting(p_key text, p_value jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_min numeric;
  v_max numeric;
  v_number numeric;
begin
  perform private.require_admin();
  if nullif(trim(p_key), '') is null or p_value is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  -- The keys the administration screen edits have a type and a range, checked here as well as
  -- on the screen (a direct call cannot store 1000000 as the commission). Other keys pass.
  if p_key in ('commission_enabled', 'escrow_enabled') then
    if jsonb_typeof(p_value) <> 'boolean' then
      raise exception 'invalid_setting' using errcode = '23514', detail = p_key || ' is true or false';
    end if;
  elsif p_key in ('commission_bps', 'pro_price_cents', 'proposal_limit', 'labor_lock_days_per_week') then
    select r.lo, r.hi into v_min, v_max
      from (values ('commission_bps', 0, 5000), ('pro_price_cents', 100, 100000),
                   ('proposal_limit', 1, 10), ('labor_lock_days_per_week', 1, 7)) as r(k, lo, hi)
     where r.k = p_key;
    if jsonb_typeof(p_value) <> 'number' then
      raise exception 'invalid_setting' using errcode = '23514', detail = p_key || ' is a whole number';
    end if;
    v_number := (p_value #>> '{}')::numeric;
    if v_number <> trunc(v_number) or v_number < v_min or v_number > v_max then
      raise exception 'invalid_setting' using errcode = '23514',
        detail = p_key || ' is a whole number from ' || v_min || ' to ' || v_max;
    end if;
  end if;

  select value into v_old from public.platform_settings where key = p_key;
  insert into public.platform_settings (key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value;

  perform private.audit('setting.changed', 'platform_setting', p_key,
                        jsonb_build_object('from', v_old, 'to', p_value));
  return p_value;
end;
$$;

-- Closes a dispute through transition_booking() (which requires the reason for admins).
create function public.admin_resolve_dispute(p_booking uuid, p_to public.booking_status, p_reason text)
returns public.booking_status
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if not exists (select 1 from public.bookings b where b.id = p_booking and b.status = 'disputed') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'not_allowed' using errcode = 'P0001', detail = 'reason required';
  end if;

  perform public.transition_booking(p_booking, p_to, p_reason);
  perform private.audit('dispute.resolved', 'booking', p_booking::text,
                        jsonb_build_object('to', p_to, 'reason', p_reason));
  return p_to;
end;
$$;

-- Records that an administrator dealt with a payment that needed manual action (a refund the
-- gateway refused, or a payment received after the booking was canceled). It writes
-- 'payment.reviewed' with the reason, which takes the payment's earlier entries out of
-- admin_payments_attention. It refuses when nothing is waiting, so a second administrator
-- who arrives late gets invalid_transition instead of a duplicate entry.
create function public.admin_review_payment(p_payment uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if nullif(trim(p_reason), '') is null then
    raise exception 'not_allowed' using errcode = 'P0001', detail = 'reason required';
  end if;
  if not exists (select 1 from public.payments where id = p_payment) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.admin_payments_attention a where a.payment_id = p_payment) then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;

  perform private.audit('payment.reviewed', 'payments', p_payment::text,
                        jsonb_build_object('reason', trim(p_reason)));
  return true;
end;
$$;

revoke all on function public.admin_review_document(uuid, boolean, text) from public;
revoke all on function public.admin_set_registry_status(uuid, text, public.registry_status, text) from public;
revoke all on function public.admin_set_provider_status(uuid, public.provider_status, text) from public;
revoke all on function public.admin_set_setting(text, jsonb) from public;
revoke all on function public.admin_resolve_dispute(uuid, public.booking_status, text) from public;
revoke all on function public.admin_set_occupation_approval(uuid, text, boolean, text) from public;
revoke all on function public.admin_get_payment_raw(uuid) from public;
revoke all on function public.admin_review_payment(uuid, text) from public;
grant execute on function public.admin_review_document(uuid, boolean, text) to authenticated;
grant execute on function public.admin_set_registry_status(uuid, text, public.registry_status, text) to authenticated;
grant execute on function public.admin_set_provider_status(uuid, public.provider_status, text) to authenticated;
grant execute on function public.admin_set_setting(text, jsonb) to authenticated;
grant execute on function public.admin_resolve_dispute(uuid, public.booking_status, text) to authenticated;
grant execute on function public.admin_set_occupation_approval(uuid, text, boolean, text) to authenticated;
grant execute on function public.admin_get_payment_raw(uuid) to authenticated;
grant execute on function public.admin_review_payment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Dashboard views
-- ---------------------------------------------------------------------------

create view public.admin_provider_queue
with (security_invoker = true)
as
select p.id as provider_id,
       p.display_name,
       p.slug,
       p.status,
       p.created_at,
       pf.full_name,
       pf.phone,
       (select coalesce(array_agg(po.occupation_slug order by po.is_primary desc, po.occupation_slug), '{}')
          from public.provider_occupations po where po.provider_id = p.id) as occupations,
       (select count(*) from public.provider_occupations po
         where po.provider_id = p.id and po.registry_status = 'informed') as registries_to_review,
       (select count(*) from public.provider_occupations po
         where po.provider_id = p.id and not po.approved) as occupations_to_approve,
       (select count(*) from public.provider_documents d
         where d.provider_id = p.id and d.status = 'submitted') as documents_submitted,
       (select count(*) from public.provider_documents d
         where d.provider_id = p.id and d.status = 'accepted') as documents_accepted,
       (select count(*) from public.provider_documents d
         where d.provider_id = p.id and d.status = 'rejected') as documents_rejected
  from public.providers p
  join public.profiles pf on pf.id = p.id
 where (p.status = 'pending_review'
        or (p.status = 'approved'
            and exists (select 1 from public.provider_occupations po where po.provider_id = p.id and not po.approved)))
   and (select public.is_admin())
 order by p.created_at;

create view public.admin_open_disputes
with (security_invoker = true)
as
select b.id as booking_id,
       b.occupation_slug,
       b.period,
       b.price_cents,
       b.platform_fee_cents,
       b.origin,
       b.client_id,
       c.full_name as client_name,
       b.provider_id,
       p.display_name as provider_name,
       (select e.at from public.booking_events e
         where e.booking_id = b.id and e.to_status = 'disputed' order by e.at desc limit 1) as disputed_at,
       (select coalesce(array_agg(pay.status order by pay.created_at), '{}')
          from public.payments pay where pay.booking_id = b.id) as payment_statuses
  from public.bookings b
  left join public.profiles c on c.id = b.client_id
  left join public.providers p on p.id = b.provider_id
 where b.status = 'disputed'
   and (select public.is_admin());

-- Counts per entity and status: created in the current ISO week, in the current month
-- (both São Paulo time) and in total.
create view public.admin_metrics
with (security_invoker = true)
as
with bounds as (
  select (date_trunc('week', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') as week_start,
         (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') as month_start
),
rows as (
  select 'requests' as entity, status::text as status, created_at from public.requests
  union all select 'proposals', status::text, created_at from public.proposals
  union all select 'bookings', status::text, created_at from public.bookings
  union all select 'payments', status::text, created_at from public.payments
  union all select 'providers', status::text, created_at from public.providers
)
select r.entity,
       r.status,
       count(*) filter (where r.created_at >= b.week_start) as this_week,
       count(*) filter (where r.created_at >= b.month_start) as this_month,
       count(*) as total
  from rows r cross join bounds b
 where (select public.is_admin())
 group by r.entity, r.status
 order by r.entity, r.status;

-- Payments that need a person: the audit entries payment.refund_failed (the gateway refused the
-- automatic refund) and payment.received_after_cancel (paid after the booking was canceled) that
-- nothing has settled yet. "Settled" is a later payment.refunded_after_cancel (the refund went
-- through) or a later payment.reviewed (an administrator dealt with it and gave the reason, see
-- admin_review_payment). One row per open entry, newest first; the webhook writes them with the
-- entity 'payments' and the payment id as entity_id.
create view public.admin_payments_attention
with (security_invoker = true)
as
select e.id as audit_id,
       e.action,
       e.at,
       e.data,
       pay.id as payment_id,
       pay.booking_id,
       pay.provider_id,
       pay.method,
       pay.amount_cents,
       pay.status
  from public.audit_log e
  join public.payments pay on pay.id::text = e.entity_id
 where e.entity = 'payments'
   and e.action in ('payment.refund_failed', 'payment.received_after_cancel')
   and not exists (
     select 1 from public.audit_log h
      where h.entity = 'payments' and h.entity_id = e.entity_id
        and h.action in ('payment.refunded_after_cancel', 'payment.reviewed')
        and h.id > e.id)
   and (select public.is_admin())
 order by e.at desc, e.id desc;

revoke all on public.admin_provider_queue, public.admin_open_disputes, public.admin_metrics from anon;
grant select on public.admin_provider_queue, public.admin_open_disputes, public.admin_metrics to authenticated;
revoke all on public.admin_payments_attention from anon;
grant select on public.admin_payments_attention to authenticated;

revoke all on all functions in schema private from public;
