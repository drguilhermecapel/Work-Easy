-- Reuse the existing support protocol and the approved pilot roster. Neither
-- channels nor staff are seeded. Provision team contacts only after a human
-- verification and reference held by the backend. A company address alone is
-- not a verified, staffed channel.
create table private.ride_support_channels (
  coverage_id uuid primary key references private.ride_coverage(id) on delete cascade,
  channel text not null check (channel in ('email','phone')),
  address text not null check (length(address)<=254 and
    ((channel='email' and address ~ '^[A-Za-z0-9._+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$')
      or (channel='phone' and address ~ '^\+[1-9][0-9]{7,14}$'))),
  team text not null check (length(trim(team)) between 2 and 80),
  verified_ref text not null check(length(trim(verified_ref)) between 4 and 160)
);
create view private.ride_staffed_channels with(security_invoker=true) as
  select c.id,c.lead_id,c.backup_id,c.period*p.period as hours,p.frozen,x.channel,x.address,x.team
    from private.ride_support_channels x join private.ride_coverage c on c.id=x.coverage_id join private.ride_pilot p on p.id=c.pilot
    join public.admins lead on lead.user_id=c.lead_id join public.admins backup on backup.user_id=c.backup_id
    where c.period && p.period and private.ride_active_user(c.lead_id) and private.ride_active_user(c.backup_id);

create function private.require_ride_support_channel() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.environment='live' and not exists(select from private.ride_staffed_channels c where not c.frozen
      and c.hours @> coalesce(new.driver_slot,new.slot)) then raise exception 'ride_support_unstaffed'; end if;
  return null;
end $$;
-- Budget, reservation and assignment are atomic with the check. A paused pilot
-- still handles existing protocols and allows passengers to reach its staff.
create trigger ride_support_coverage after insert on public.ride_legs
  for each row execute function private.require_ride_support_channel();
create trigger ride_support_assignment after update of driver_slot on public.ride_legs
  for each row when(new.driver_slot is not null and new.driver_slot is distinct from old.driver_slot)
  execute function private.require_ride_support_channel();
revoke all on function private.require_ride_support_channel() from public,anon,authenticated,service_role;

create table private.ride_support_assignments (
  task_id uuid primary key references public.support_tasks(id),
  claimed_by uuid not null, claimed_at timestamptz not null default clock_timestamp(),
  code text check (code in ('assisted','rebooked','cost_reviewed','escalated','duplicate'))
);
create table private.ride_support_history (
  id bigint generated always as identity primary key, task_id uuid not null references public.support_tasks(id),
  actor_id uuid not null, shift_id uuid not null, action text not null check(action in ('claim','resolve')),
  at timestamptz not null default clock_timestamp()
);
-- Allowlist protocol types and resolve the owning leg in the same environment.
-- Other support cases and arbitrary JSON payloads are never returned.
create view private.ride_support_cases with(security_invoker=true) as
  select t.id as protocol,l.id as leg,l.environment,t.kind,
    case when t.kind='ride_help' then t.payload->>'reason' end as reason,t.created_at,t.resolved_at,a.claimed_by,a.code
  from public.support_tasks t join public.ride_legs l on l.id::text=t.payload->>'leg_id' and l.environment=t.payload->>'environment'
    left join private.ride_support_assignments a on a.task_id=t.id
  where t.kind in ('ride_help','ride_receipt_incomplete','ride_deletion_review');
revoke all on private.ride_support_channels,private.ride_staffed_channels,private.ride_support_assignments,
  private.ride_support_history,private.ride_support_cases from public,anon,authenticated,service_role;

create function private.ride_support_shift(p_user uuid) returns uuid language sql stable security definer set search_path='' as $$
  select id from private.ride_staffed_channels c where c.hours @> now() and p_user in (c.lead_id,c.backup_id)
  order by (c.lead_id=p_user) desc,upper(c.hours),c.id limit 1
$$;
revoke all on function private.ride_support_shift(uuid) from public,anon,authenticated,service_role;
create function public.admin_ride_support_queue() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid(); shift uuid; result jsonb;
begin
  perform private.require_admin();
  if not private.ride_active_user(uid) then raise exception 'not_allowed'; end if;
  shift:=private.ride_support_shift(uid);
  with cases as (
    select c.* from private.ride_support_cases c where c.environment=private.ride_env() and c.resolved_at is null
    union all (select c.* from private.ride_support_cases c where c.environment=private.ride_env() and c.resolved_at is not null
               order by c.resolved_at desc,c.protocol limit 50)
  )
  select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('claimed_by_me',coalesce(c.claimed_by=uid,false),
    'can_claim',c.resolved_at is null and shift is not null and c.claimed_by is distinct from uid and private.ride_support_shift(c.claimed_by) is null,
    'can_resolve',c.resolved_at is null and shift is not null and coalesce(c.claimed_by=uid,false))
    order by (c.resolved_at is not null),case when c.resolved_at is null then c.created_at end,c.resolved_at desc,c.protocol),'[]'::jsonb)
    into result from cases c;
  return result;
end $$;

create function public.admin_ride_support_action(p_protocol uuid,p_action text,p_code text) returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); shift uuid; c private.ride_support_cases;
begin
  perform private.require_admin();
  if not private.ride_active_user(uid) then raise exception 'not_allowed'; end if;
  if p_action is null or p_action not in ('claim','resolve') or (p_action='claim' and p_code is not null) or
    (p_action='resolve' and (p_code is null or p_code not in ('assisted','rebooked','cost_reviewed','escalated','duplicate')))
    then raise exception 'invalid_input'; end if;
  -- Two operators cannot both win a claim. Read assignment again under the
  -- protocol lock so a response lost after commit can be replayed safely.
  perform 1 from public.support_tasks where id=p_protocol for update;
  select * into c from private.ride_support_cases where protocol=p_protocol and environment=private.ride_env();
  if not found then raise exception 'not_allowed'; end if;
  if c.resolved_at is not null then
    if p_action='resolve' and c.claimed_by=uid and c.code=p_code then return p_protocol; end if;
    raise exception 'ride_support_closed';
  end if;
  select private.ride_support_shift(uid) into shift;
  if shift is null then raise exception 'ride_support_off_duty'; end if;
  if p_action='claim' then
    if c.claimed_by=uid then return p_protocol; end if;
    if private.ride_support_shift(c.claimed_by) is not null then raise exception 'ride_support_claimed'; end if;
    insert into private.ride_support_assignments(task_id,claimed_by) values(p_protocol,uid)
      on conflict(task_id) do update set claimed_by=excluded.claimed_by,claimed_at=clock_timestamp();
  else
    if c.claimed_by is distinct from uid then raise exception 'ride_support_not_owner'; end if;
    update private.ride_support_assignments set code=p_code where task_id=p_protocol;
    update public.support_tasks set resolved_by=uid,resolved_at=clock_timestamp() where id=p_protocol;
  end if;
  insert into private.ride_support_history(task_id,actor_id,shift_id,action) values(p_protocol,uid,shift,p_action);
  return p_protocol;
end $$;

create function public.ride_support_contact(p_leg uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid(); l public.ride_legs; channel private.ride_staffed_channels; requests jsonb;
begin
  if not private.ride_active_user(uid) then raise exception 'not_allowed'; end if;
  select leg.* into l from public.ride_legs leg join public.rides r on r.id=leg.ride_id
    where leg.id=p_leg and leg.environment=private.ride_env() and (uid in (r.passenger_id,leg.payer_id,leg.driver_id)
      or exists(select from public.bookings b where b.id=r.booking_id and b.client_id=uid));
  if not found then raise exception 'not_allowed'; end if;
  -- Prefer an open team, then the next planned team, finally the last staffed
  -- window for this trip. Never display a historic window as currently staffed.
  select * into channel from private.ride_staffed_channels c
    where upper(c.hours)>now() or c.hours && l.slot
    order by (c.hours @> now()) desc,(lower(c.hours)>now()) desc,
      case when lower(c.hours)>now() then lower(c.hours) end,upper(c.hours) desc,c.id limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('protocol',c.protocol,'reason',c.reason,'created_at',c.created_at,
    'resolved_at',c.resolved_at,'code',c.code) order by c.created_at desc),'[]')
    into requests from private.ride_help h join private.ride_support_cases c on c.protocol=h.task_id
    where h.leg_id=p_leg and h.actor=uid and c.environment=l.environment;
  return jsonb_build_object('environment',l.environment,'channel',channel.channel,'address',channel.address,
    'team',channel.team,'from',lower(channel.hours),'until',upper(channel.hours),'on_duty',coalesce(channel.hours @> now(),false),'requests',requests);
end $$;
revoke all on function public.admin_ride_support_queue(),public.admin_ride_support_action(uuid,text,text),public.ride_support_contact(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.admin_ride_support_queue(),public.admin_ride_support_action(uuid,text,text),public.ride_support_contact(uuid) to authenticated;
