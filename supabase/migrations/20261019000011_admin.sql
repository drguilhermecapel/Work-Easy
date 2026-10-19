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
begin
  perform private.require_admin();
  select status into v_old from public.providers where id = p_provider for update;
  if not found or p_status is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  update public.providers set status = p_status where id = p_provider;
  perform private.audit('provider.status', 'provider', p_provider::text,
                        jsonb_build_object('from', v_old, 'to', p_status, 'reason', p_reason));
  return p_status;
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
begin
  perform private.require_admin();
  if nullif(trim(p_key), '') is null or p_value is null then
    raise exception 'not_allowed' using errcode = 'P0001';
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

revoke all on function public.admin_review_document(uuid, boolean, text) from public;
revoke all on function public.admin_set_registry_status(uuid, text, public.registry_status, text) from public;
revoke all on function public.admin_set_provider_status(uuid, public.provider_status, text) from public;
revoke all on function public.admin_set_setting(text, jsonb) from public;
revoke all on function public.admin_resolve_dispute(uuid, public.booking_status, text) from public;
grant execute on function public.admin_review_document(uuid, boolean, text) to authenticated;
grant execute on function public.admin_set_registry_status(uuid, text, public.registry_status, text) to authenticated;
grant execute on function public.admin_set_provider_status(uuid, public.provider_status, text) to authenticated;
grant execute on function public.admin_set_setting(text, jsonb) to authenticated;
grant execute on function public.admin_resolve_dispute(uuid, public.booking_status, text) to authenticated;

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
       (select count(*) from public.provider_documents d
         where d.provider_id = p.id and d.status = 'submitted') as documents_submitted,
       (select count(*) from public.provider_documents d
         where d.provider_id = p.id and d.status = 'accepted') as documents_accepted,
       (select count(*) from public.provider_documents d
         where d.provider_id = p.id and d.status = 'rejected') as documents_rejected
  from public.providers p
  join public.profiles pf on pf.id = p.id
 where p.status = 'pending_review'
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

revoke all on public.admin_provider_queue, public.admin_open_disputes, public.admin_metrics from anon;
grant select on public.admin_provider_queue, public.admin_open_disputes, public.admin_metrics to authenticated;

revoke all on all functions in schema private from public;
