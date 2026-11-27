-- Exact paths have two distinct lifetimes. The signal cache expires in 00401.
-- Only the onboard path becomes part of the passenger receipt and municipal record.
alter table private.ride_driver_credentials
  add column public_driver_name text check(length(trim(public_driver_name)) between 1 and 200),
  add column public_driver_number text check(length(trim(public_driver_number)) between 1 and 80),
  add column vehicle_plate text check(length(trim(vehicle_plate)) between 1 and 16),
  add column vehicle_model text check(length(trim(vehicle_model)) between 1 and 100);

create table private.ride_receipt_policy (
  environment text primary key references private.ride_network(environment),
  approval_ref text not null check(length(trim(approval_ref)) between 1 and 160),
  receipt_retention_days int not null check(receipt_retention_days between 1 and 36500),
  export_enabled boolean not null default false,
  approved_until timestamptz not null
);
-- A legal retention period has to be supplied for live. A rehearsal never
-- authorizes a real export, real driver or real payment.
insert into private.ride_receipt_policy values ('simulation','synthetic-test',7,false,'infinity');

-- "Arriving" in the dispatch workflow means on the way. The driver marks
-- actual arrival separately so the municipal wait is never invented from ETA.
create table private.ride_pickup_arrivals (
  leg_id uuid primary key references public.ride_legs(id), arrived_at timestamptz not null default clock_timestamp()
);
revoke all on private.ride_pickup_arrivals from public,anon,authenticated,service_role;
create function public.ride_mark_at_pickup(p_leg uuid) returns timestamptz
language plpgsql security definer set search_path='' as $$
declare l public.ride_legs; stamp timestamptz;
begin
  select * into l from public.ride_legs where id=p_leg and driver_id=auth.uid()
    and environment=private.ride_env() for update;
  if l.id is null then raise exception 'not_allowed'; end if;
  select arrived_at into stamp from private.ride_pickup_arrivals where leg_id=p_leg;
  if found then return stamp; end if;
  if l.status<>'arriving' then raise exception 'ride_invalid_transition'; end if;
  insert into private.ride_pickup_arrivals(leg_id) values(p_leg) returning arrived_at into stamp;
  return stamp;
end $$;
revoke all on function public.ride_mark_at_pickup(uuid) from public,anon,authenticated,service_role;
grant execute on function public.ride_mark_at_pickup(uuid) to authenticated;

-- Only an operator can resolve an uncertain trip. An out-of-band confirmation
-- keeps its own actual travel times, distinct from the time of reconciliation.
create table private.ride_resolution_proofs (
  leg_id uuid primary key references public.ride_legs(id), operator_id uuid not null references public.profiles(id),
  operation_key uuid not null, evidence_ref text not null, boarded_at timestamptz not null,
  ended_at timestamptz not null, recorded_at timestamptz not null default clock_timestamp(),
  unique(operator_id,operation_key), check(ended_at>=boarded_at)
);
revoke all on private.ride_resolution_proofs from public,anon,authenticated,service_role;

create or replace function public.ride_resolve(p_leg uuid,p_to text,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l public.ride_legs;
begin
  perform private.require_admin();
  if p_to is null or p_to not in ('completed','cancelled') then raise exception 'invalid_ride_transition'; end if;
  select * into l from public.ride_legs where id=p_leg and environment=private.ride_env() for update;
  if l.id is null then raise exception 'not_allowed'; end if;
  if p_to='completed' and (l.environment='live' or not exists(
    select from private.ride_events e where e.leg_id=l.id and e.to_status='boarded'
  )) then raise exception 'ride_resolution_proof_required'; end if;
  return private.ride_command(p_leg,'resolve_'||p_to,p_key);
end $$;

create function public.ride_resolve_with_evidence(p_leg uuid,p_key uuid,p_evidence_ref text,
  p_boarded_at timestamptz,p_ended_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l public.ride_legs; previous private.ride_resolution_proofs; requested_at timestamptz;
begin
  perform private.require_admin();
  if p_key is null or p_evidence_ref is null or p_evidence_ref !~ '^[A-Za-z0-9][A-Za-z0-9_./:-]{3,159}$'
    or position('//' in p_evidence_ref)>0 or p_boarded_at is null or p_ended_at is null
    or not isfinite(p_boarded_at) or not isfinite(p_ended_at) or p_boarded_at>p_ended_at or p_ended_at>clock_timestamp() then
    raise exception 'invalid_ride_evidence'; end if;
  select * into l from public.ride_legs where id=p_leg and environment=private.ride_env() for update;
  if l.id is null then raise exception 'not_allowed'; end if;
  select * into previous from private.ride_resolution_proofs where leg_id=l.id;
  if found then
    if previous.operator_id<>auth.uid() or previous.operation_key<>p_key or previous.evidence_ref<>p_evidence_ref
      or previous.boarded_at<>p_boarded_at or previous.ended_at<>p_ended_at then raise exception 'idempotency_conflict'; end if;
  else
    select created_at into requested_at from public.rides where id=l.ride_id;
    if l.status<>'unknown' or l.driver_id is null or p_boarded_at<requested_at then raise exception 'invalid_ride_evidence'; end if;
    insert into private.ride_resolution_proofs(leg_id,operator_id,operation_key,evidence_ref,boarded_at,ended_at)
      values(l.id,auth.uid(),p_key,p_evidence_ref,p_boarded_at,p_ended_at);
  end if;
  return private.ride_command(p_leg,'resolve_completed',p_key);
end $$;
revoke all on function public.ride_resolve_with_evidence(uuid,uuid,text,timestamptz,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.ride_resolve_with_evidence(uuid,uuid,text,timestamptz,timestamptz) to authenticated;

create table private.ride_receipts (
  leg_id uuid primary key references public.ride_legs(id),
  environment text not null, issued_at timestamptz not null, expires_at timestamptz not null,
  passenger_id uuid not null, payer_id uuid not null, driver_id uuid not null,
  origin text not null, destination text not null, origin_point jsonb, destination_point jsonb,
  driver_name text, driver_number text, vehicle_category text, vehicle_model text, vehicle_plate text,
  pickup_at timestamptz not null, boarded_at timestamptz, arrived_at timestamptz,
  ended_at timestamptz not null, route jsonb not null, measured_meters bigint,
  quoted_meters integer, quoted_minutes integer not null,
  retention_ref text not null
);
create index ride_receipts_expiry on private.ride_receipts(expires_at);
create index ride_receipts_export on private.ride_receipts(environment,ended_at,leg_id);
create table private.ride_receipt_holds (
  leg_id uuid primary key references private.ride_receipts on delete cascade,
  case_ref text not null check(length(trim(case_ref)) between 1 and 160),
  responsible_ref text not null check(length(trim(responsible_ref)) between 1 and 160),
  hold_until timestamptz not null check(isfinite(hold_until))
);
create table private.ride_export_audit (
  id bigint generated always as identity primary key, requested_at timestamptz not null default now(),
  period_start timestamptz not null, period_end timestamptz not null, after_id uuid,
  rows_returned integer not null, approval_ref text not null
);
revoke all on private.ride_receipt_policy, private.ride_receipts, private.ride_receipt_holds,
  private.ride_export_audit from public, anon, authenticated, service_role;

-- Required administrative evidence is independent of a driver's interest form.
-- Continuity: expiry blocks new live assignments, never completion of a ride in flight.
create function private.guard_ride_receipt_readiness() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.environment='live' and new.driver_id is not null and
     (tg_op='INSERT' or old.driver_id is distinct from new.driver_id) then
    if not exists (select from private.ride_receipt_policy p
      join private.ride_driver_credentials c on c.driver_id=new.driver_id
      where p.environment='live' and p.approved_until>now() and p.export_enabled
        and c.public_driver_number is not null and c.vehicle_plate is not null and c.vehicle_model is not null
        and c.public_driver_name is not null
        and exists(select from private.ride_signal_settings where singleton and location_enabled)) then
      raise exception 'ride_receipt_not_ready';
    end if;
  end if;
  return new;
end $$;
create trigger ride_receipt_readiness before insert or update of driver_id on public.ride_legs
  for each row execute function private.guard_ride_receipt_readiness();

-- Snapshot the individually consented locations or the public meeting places
-- frozen for this quote. A service client never receives this projection.
create function private.ride_receipt_endpoints(p_leg uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('origin',case when l.route_case_id is not null then p.origin else m.origin end,
    'destination',case when l.route_case_id is not null then p.destination else m.destination end)
  from public.ride_legs l left join private.ride_route_points p on p.route_id=l.route_case_id and p.delete_by>now()
  left join private.ride_meeting_snapshots m on m.quote_id=l.source_quote_id and m.seq=l.quote_seq
  where l.id=p_leg
$$;
revoke all on function private.ride_receipt_endpoints(uuid) from public,anon,authenticated,service_role;

create function private.snapshot_ride_receipt(p_leg uuid) returns void
language plpgsql security definer set search_path='' as $$
declare
  l public.ride_legs; r public.rides; c private.ride_driver_credentials;
  p private.ride_receipt_policy; boarding timestamptz; arrival timestamptz;
  path jsonb; distance_m bigint; estimate_m integer; trip_end timestamptz;
  proof private.ride_resolution_proofs; endpoints jsonb;
begin
  select * into strict l from public.ride_legs where id=p_leg and status='completed';
  select * into strict r from public.rides where id=l.ride_id;
  endpoints:=private.ride_receipt_endpoints(l.id);
  select * into p from private.ride_receipt_policy where environment=l.environment;
  -- Legacy completed trips without approved retention remain financially visible.
  if not found then return; end if;
  select * into c from private.ride_driver_credentials where driver_id=l.driver_id;
  select min(at) into boarding from private.ride_events where leg_id=l.id and to_status='boarded';
  select arrived_at into arrival from private.ride_pickup_arrivals where leg_id=l.id;
  select * into proof from private.ride_resolution_proofs where leg_id=l.id;
  boarding:=coalesce(proof.boarded_at,boarding);
  trip_end:=coalesce(proof.ended_at,l.updated_at);
  select (entry->>'meters')::int into estimate_m from private.ride_quotes q
    cross join lateral jsonb_array_elements(q.legs) entry
    where q.id=coalesce(l.source_quote_id,r.quote_id) and (entry->>'seq')::int=coalesce(l.quote_seq,l.seq);

  -- Great-circle distance between successive observed points, not the estimate
  -- from the tariff table. Only samples obtained after boarding belong here.
  with pts as (
    select observed_at,latitude as lat,longitude as lon,
      lag(latitude) over w as prev_lat,lag(longitude) over w as prev_lon
      from private.ride_observations
      where leg_id=l.id and onboard and observed_at>=boarding and observed_at<=trip_end
      window w as(order by observed_at)
  ) select coalesce(jsonb_agg(jsonb_build_array(lat,lon) order by observed_at),'[]'::jsonb),
    round(sum(12742000 * asin(sqrt(least(1.0, power(sin(radians(lat-prev_lat)/2),2)
      + cos(radians(prev_lat))*cos(radians(lat))*power(sin(radians(lon-prev_lon)/2),2)))))
      filter(where prev_lat is not null))::bigint
    into path,distance_m from pts;

  insert into private.ride_receipts(leg_id,environment,issued_at,expires_at,passenger_id,payer_id,driver_id,
    origin,destination,origin_point,destination_point,driver_name,driver_number,vehicle_category,vehicle_model,vehicle_plate,
    pickup_at,boarded_at,arrived_at,ended_at,route,measured_meters,quoted_meters,quoted_minutes,retention_ref)
    select l.id,r.environment,now(),l.updated_at+make_interval(days=>p.receipt_retention_days),
      r.passenger_id,l.payer_id,l.driver_id,coalesce(endpoints#>>'{origin,label}',case when l.environment='simulation' then l.origin else 'Não aferida' end),
      coalesce(endpoints#>>'{destination,label}',case when l.environment='simulation' then l.destination else 'Não aferido' end),
      nullif(endpoints->'origin','null'::jsonb),nullif(endpoints->'destination','null'::jsonb),
      case when l.environment='simulation' then d.full_name else c.public_driver_name end,c.public_driver_number,
      v.vehicle,c.vehicle_model,c.vehicle_plate,case when r.scheduled_at is null and l.seq=1 then r.created_at else l.pickup_at end,boarding,arrival,trip_end,path,distance_m,
      estimate_m,l.duration_minutes,p.approval_ref
    from public.ride_drivers v join public.profiles d on d.id=v.id where v.id=l.driver_id
    on conflict(leg_id) do nothing;
  if found and l.environment='live' and
     (distance_m is null or boarding is null or arrival is null or c.public_driver_number is null or c.vehicle_plate is null
        or endpoints#>>'{origin,label}' is null or endpoints#>>'{destination,label}' is null) then
    insert into public.support_tasks(kind,payload) values ('ride_receipt_incomplete',
      jsonb_build_object('leg_id',l.id,'environment',l.environment));
  end if;
end $$;
create function private.issue_completed_ride_receipt() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform private.snapshot_ride_receipt(new.id);
  return new;
end $$;
create trigger ride_receipt_on_completion after update of status on public.ride_legs
  for each row when (new.status='completed' and old.status is distinct from new.status)
  execute function private.issue_completed_ride_receipt();
select private.snapshot_ride_receipt(id) from public.ride_legs where status='completed';

-- Calculate financial state from confirmed ledger events on every read. A
-- driver's payout is independent of what the payer actually paid.
create function private.ride_receipt_money(p_leg uuid) returns jsonb language sql stable
security definer set search_path='' as $$
  select jsonb_build_object('currency','BRL','fare_cents',a.fare_cents,'extras_cents',a.extras_cents,
    'reversed_cents',b.reversed_cents,'final_cents',a.fare_cents-b.reversed_cents,
    'paid_cents',coalesce((select sum(e.amount_cents) from private.ride_financial_events e
      where e.leg_id=p_leg and e.kind='capture'),0)-b.reversed_cents,
    'due_cents',b.receivable_cents,'disputed_cents',b.disputed_cents,
    'pending',exists(select from private.ride_financial_unknown u where u.leg_id=p_leg),
    'commission_cents',b.commission_cents,'driver_cents',a.fare_cents-b.reversed_cents-b.commission_cents)
  from private.ride_financial_accounts a join private.ride_financial_balances b using(leg_id)
  where a.leg_id=p_leg
$$;

create function public.ride_aftercare(p_leg uuid) returns jsonb language plpgsql stable
security definer set search_path='' as $$
declare
  me uuid:=auth.uid(); l public.ride_legs; r public.rides; s private.ride_receipts;
  passenger boolean; payer boolean; driver boolean; document jsonb; money jsonb;
begin
  select * into l from public.ride_legs where id=p_leg and environment=private.ride_env();
  if me is null or l.id is null or not exists(select from public.profiles where id=me and deleted_at is null) then
    raise exception 'not_allowed';
  end if;
  select * into strict r from public.rides where id=l.ride_id;
  passenger:=me=r.passenger_id; payer:=me=l.payer_id; driver:=coalesce(me=l.driver_id,false);
  if not (passenger or payer or driver or exists(select from public.bookings b where b.id=r.booking_id and b.client_id=me))
    then raise exception 'not_allowed'; end if;
  if l.status='completed' and (passenger or payer or driver) then
    select * into s from private.ride_receipts where leg_id=p_leg;
    money:=private.ride_receipt_money(p_leg);
    if not driver then money:=money - 'commission_cents' - 'driver_cents'; end if;
    if not payer then money:=money - 'due_cents' - 'pending' - 'disputed_cents'; end if;
    document:=jsonb_build_object('id',l.id,'simulation',r.environment='simulation',
      'issued_at',coalesce(s.issued_at,l.updated_at),'role',case when passenger then 'passenger' when driver then 'driver' else 'payer' end,
      'money',money);
    if passenger and s.leg_id is not null then
      document:=document||jsonb_build_object('journey',jsonb_build_object(
        'origin',s.origin,'destination',s.destination,'origin_point',s.origin_point,'destination_point',s.destination_point,'driver_name',s.driver_name,'driver_number',s.driver_number,
        'vehicle_category',s.vehicle_category,'vehicle_model',s.vehicle_model,'vehicle_plate',s.vehicle_plate,
        'boarded_at',s.boarded_at,'ended_at',s.ended_at,'meters',s.measured_meters,'quoted_meters',s.quoted_meters,
        'quoted_minutes',s.quoted_minutes,'points',s.route));
    end if;
  end if;
  return jsonb_build_object('can_rate',passenger and l.status='completed',
    'stars',(select stars from private.ride_ratings where leg_id=p_leg and passenger),'document',document);
end $$;

-- For an authorized backend export job only. No external destination, anonymous
-- access, broad admin role or implicit transmission is provided. UUID keyset
-- pagination inside a bounded, half-open reporting period prevents overlap.
create function public.export_ride_municipal(p_from timestamptz,p_until timestamptz,p_after uuid,p_limit int)
returns jsonb language plpgsql security definer set search_path='' as $$
declare policy private.ride_receipt_policy; batch jsonb;
begin
  select * into policy from private.ride_receipt_policy where environment=private.ride_env()
    and environment='live' and export_enabled and approved_until>now();
  if not found then raise exception 'export_disabled'; end if;
  if p_limit is null or p_limit not between 1 and 500 or p_from is null or p_until is null or p_from>=p_until
    or p_until>now() or p_until-p_from>interval '1 day' then raise exception 'invalid_export_window'; end if;
  select coalesce(jsonb_agg(to_jsonb(rows) order by leg_id),'[]'::jsonb) into batch from (
    select s.leg_id,s.origin,s.destination,s.origin_point,s.destination_point,s.route,s.measured_meters,s.boarded_at,s.ended_at,
      (s.measured_meters is not null and s.arrived_at is not null and s.boarded_at is not null and s.driver_number is not null and s.vehicle_plate is not null and s.origin_point is not null and s.destination_point is not null) as evidence_complete,
      extract(epoch from(s.ended_at-s.boarded_at))::int as duration_seconds,
      case when s.arrived_at is not null then greatest(0,extract(epoch from(s.arrived_at-s.pickup_at)))::int end as arrival_delay_seconds,
      s.driver_number,s.vehicle_plate,s.vehicle_model, rt.stars,
      jsonb_build_object('fare_cents',a.fare_cents,'extras_cents',a.extras_cents,
        'reversed_cents',b.reversed_cents,'total_due_cents',a.fare_cents-b.reversed_cents,
        'paid_cents',a.fare_cents-b.receivable_cents-b.reversed_cents) as prices
    from private.ride_receipts s join private.ride_financial_accounts a on a.leg_id=s.leg_id
      join private.ride_financial_balances b on b.leg_id=s.leg_id left join private.ride_ratings rt on rt.leg_id=s.leg_id
    where s.environment='live' and s.ended_at>=p_from and s.ended_at<p_until
      and (p_after is null or s.leg_id>p_after) order by s.leg_id limit p_limit
  ) rows;
  insert into private.ride_export_audit(period_start,period_end,after_id,rows_returned,approval_ref)
    values(p_from,p_until,p_after,jsonb_array_length(batch),policy.approval_ref);
  return batch;
end $$;

create function private.purge_ride_receipts() returns void language sql security definer set search_path='' as $$
  delete from private.ride_receipts s where s.expires_at<=now()
    and not exists(select from private.ride_receipt_holds h where h.leg_id=s.leg_id and h.hold_until>now())
$$;
select cron.schedule('workeasy-ride-receipt-retention','17 4 * * *',$job$select private.purge_ride_receipts()$job$);
revoke all on function private.guard_ride_receipt_readiness(),private.snapshot_ride_receipt(uuid),
  private.issue_completed_ride_receipt(),private.ride_receipt_money(uuid),private.purge_ride_receipts(),
  public.ride_aftercare(uuid),public.export_ride_municipal(timestamptz,timestamptz,uuid,int) from public,anon,authenticated,service_role;
grant execute on function public.ride_aftercare(uuid) to authenticated;
grant execute on function public.export_ride_municipal(timestamptz,timestamptz,uuid,int) to service_role;
