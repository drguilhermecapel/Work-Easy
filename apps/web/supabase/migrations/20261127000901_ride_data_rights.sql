-- A financial/regulatory record can outlive the Auth account. The subject key has
-- no name, contact, credentials or login privileges. Identifiable archives retain
-- their independent expiry/hold; the technical key is not itself anonymisation.
create table private.ride_subjects (id uuid primary key);
revoke all on private.ride_subjects from public,anon,authenticated,service_role;
create function private.register_ride_subject() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into private.ride_subjects(id) values(new.id) on conflict do nothing;
  return null;
end $$;
revoke all on function private.register_ride_subject() from public,anon,authenticated,service_role;
create trigger register_ride_subject after insert on public.profiles for each row execute function private.register_ride_subject();
insert into private.ride_subjects select id from public.profiles on conflict do nothing;

-- Retarget only the direct network's single-column profile FKs. Keep the original
-- constraint names and the integrity checks. Service bookings/payments keep D7.
do $migration$
declare f record;
begin
  for f in select c.conrelid::regclass as rel,c.conname,a.attname
    from pg_catalog.pg_constraint c join pg_catalog.pg_class t on t.oid=c.conrelid
    join pg_catalog.pg_namespace n on n.oid=t.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid=t.oid and a.attnum=c.conkey[1]
    where c.contype='f' and c.confrelid='public.profiles'::regclass and cardinality(c.conkey)=1
      and n.nspname in ('private','public') and (t.relname='rides' or t.relname like 'ride\_%' escape '\')
  loop
    execute format('alter table %s drop constraint %I, add constraint %I foreign key (%I) references private.ride_subjects(id)',
      f.rel,f.conname,f.conname,f.attname);
  end loop;
end $migration$;
create function private.retire_ride_subject() returns trigger language plpgsql security definer set search_path='' as $$
begin
  begin
    -- An unused registration may be removed now. FKs preserve dossiers and any
    -- driver whose public identity is still required for a trip or its review.
    delete from public.ride_drivers where id=old.id;
  exception when foreign_key_violation then
    null;
  end;
  begin
    delete from private.ride_subjects where id=old.id;
  exception when foreign_key_violation then
    -- A historical transaction still refers to this opaque key.
    null;
  end;
  return null;
end $$;
revoke all on function private.retire_ride_subject() from public,anon,authenticated,service_role;
create trigger retire_ride_subject after delete on public.profiles for each row execute function private.retire_ride_subject();

create function private.erase_ride_account() returns trigger language plpgsql security definer set search_path='' as $$
declare l record; next_state text;
begin
  delete from public.admins where user_id=new.id;
  delete from private.ride_coverage where new.id in (lead_id,backup_id) and upper(period)>now();
  delete from private.ride_devices where driver_id=new.id;
  delete from private.ride_driver_shifts where driver_id=new.id;
  delete from private.ride_declines where driver_id=new.id;
  delete from private.ride_upload_limits where driver_id=new.id;
  update public.ride_drivers set online=false,status='rejected',valid_until=null,updated_at=now() where id=new.id;
  -- Binding a new charge needs an active profile and a new contract. Submitted
  -- charges already contain their own evidence for refunds and reconciliation.
  delete from private.ride_live_psp_customers where payer_id=new.id;
  delete from private.ride_live_psp_wallets where driver_id=new.id;
  delete from private.ride_sandbox_customers where payer_id=new.id;
  update private.ride_quotes set status='superseded' where status='awaiting_consent' and new.id=any(required_users);
  for l in select leg.id,leg.status,leg.environment,leg.driver_id from public.ride_legs leg join public.rides r on r.id=leg.ride_id
    where new.id in (r.passenger_id,leg.payer_id,leg.driver_id) order by leg.id for update of leg
  loop
    delete from private.ride_arrival_estimates where leg_id=l.id;
    if l.status in ('requested','accepted','arriving','boarded','unknown') then
      -- Unassigned supply is definitively withdrawn locally. An assigned or
      -- previously uncertain trip requires human confirmation, including costs.
      next_state:=case when l.status='requested' then 'cancelled' else 'unknown' end;
      if next_state<>l.status then
        update public.ride_legs set status=next_state,updated_at=now() where id=l.id;
        insert into private.ride_events(actor_id,operation_key,leg_id,action,from_status,to_status)
          values(new.id,gen_random_uuid(),l.id,'account_erased',l.status,next_state);
      end if;
      if next_state='unknown' and l.environment='live' and l.driver_id=new.id then
        -- Existing assigned transport can still require a statutory receipt.
        -- Preserve the authorized credential privately for at most the 24h
        -- reconciliation window. A longer hold needs its own case and deadline.
        insert into private.ride_dossier_holds as h(dossier_id,evidence_ref,until_at)
          select d.id,'ride_deletion_review:'||l.id,least(d.expires_at,now()+interval '24 hours')
          from private.ride_dossiers d join private.ride_driver_credentials c on c.driver_document_ref=d.id::text
          where d.driver_id=new.id and c.driver_id=new.id and d.expires_at>now()
            and exists(select from private.ride_receipt_policy p where p.environment='live' and p.approved_until>now())
          on conflict(dossier_id) do update set evidence_ref=excluded.evidence_ref,until_at=excluded.until_at
            where h.until_at<=now();
      end if;
      if next_state='unknown' and not exists(select from public.support_tasks t where t.kind='ride_deletion_review' and t.payload->>'leg_id'=l.id::text) then
        insert into public.support_tasks(kind,payload) values('ride_deletion_review',jsonb_build_object('leg_id',l.id,'environment',l.environment));
      end if;
    end if;
    -- For unresolved trips the existing restricted onboard evidence expires
    -- under the 24h rule. No new observations may arrive. All other raw GPS goes.
    delete from private.ride_observations o where o.leg_id=l.id and
      (l.status not in ('accepted','arriving','boarded','unknown') or not o.onboard);
  end loop;
  delete from private.ride_route_points p using private.ride_route_cases c where p.route_id=c.id
    and new.id in (c.creator_id,c.passenger_id,c.client_id)
    and not exists(select from public.ride_legs pending where pending.route_case_id=c.id and pending.status='unknown');
  delete from private.ride_route_cases c where c.passenger_id=new.id and c.client_id is null and c.status='draft'
    and not exists(select from public.ride_legs used where used.route_case_id=c.id);
  return null;
end $$;
revoke all on function private.erase_ride_account() from public,anon,authenticated,service_role;
create trigger erase_ride_account after update of deleted_at on public.profiles for each row
  when (new.deleted_at is not null and old.deleted_at is null) execute function private.erase_ride_account();

-- DSAR projection. Identity is derived from the verified JWT. No arbitrary
-- subject argument, raw token, PSP link, counterpart identifier, document path,
-- reviewed evidence or admin expansion. Each role sees its own records only.
create function public.ride_export_my_data() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); data jsonb;
begin
  if not private.ride_active_user(u) then raise exception 'not_allowed'; end if;
  select jsonb_build_object(
    'driver',(select jsonb_build_object('environment',d.environment,'vehicle',d.vehicle,'status',d.status,'online',d.online,'valid_until',d.valid_until)
      from public.ride_drivers d where d.id=u),
    'shifts',coalesce((select jsonb_agg(jsonb_build_object('area',s.area,'from',lower(s.period),'until',upper(s.period)) order by lower(s.period)) from private.ride_driver_shifts s where s.driver_id=u),'[]'),
    'dossiers',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'status',d.status,'name',d.display_name,'vehicle_model',d.vehicle_model,
      'vehicle_plate',d.vehicle_plate,'number',d.public_driver_number,'privacy_version',d.privacy_version,'reviewed_at',d.reviewed_at,
      'reason',d.rejection_reason,'created_at',d.created_at,'expires_at',d.expires_at,'files',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,
      'kind',f.kind,'uploaded_at',f.uploaded_at) order by f.uploaded_at) from private.ride_dossier_files f where f.dossier_id=d.id and not f.replaced),'[]')) order by d.created_at)
      from private.ride_dossiers d where d.driver_id=u and d.expires_at>now()),'[]'),
    'route_requests',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',c.id,'status',c.status,'created_at',c.created_at,
      'origin',case when (u=c.passenger_id and (c.client_id is null or c.service_endpoint='destination')) or (u=c.client_id and c.service_endpoint='origin') then p.origin end,
      'destination',case when (u=c.passenger_id and (c.client_id is null or c.service_endpoint='origin')) or (u=c.client_id and c.service_endpoint='destination') then p.destination end)) order by c.created_at)
      from private.ride_route_cases c left join private.ride_route_points p on p.route_id=c.id and p.delete_by>now()
      where u in (c.creator_id,c.client_id,c.passenger_id)),'[]'),
    'device_registrations',coalesce((select jsonb_agg(jsonb_build_object('platform',d.transport,'expires_at',d.expires_at) order by d.transport)
      from private.ride_devices d where d.driver_id=u and d.expires_at>now()),'[]'),
    'driver_observations',coalesce((select jsonb_agg(jsonb_build_object('leg',o.leg_id,'observed_at',o.observed_at,'accuracy_m',o.accuracy_m,
      'onboard',o.onboard) order by o.observed_at) from private.ride_observations o join public.ride_legs l on l.id=o.leg_id
      where l.driver_id=u and o.observed_at>now()-interval '24 hours'),'[]'),
    'quotes',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'environment',q.environment,'status',q.status,'created_at',q.created_at,'expires_at',q.expires_at,
      'accepted',c.accepted,'decision_at',c.at,'my_authorized_legs',coalesce((select jsonb_agg(jsonb_build_object('seq',e->'seq','limit_cents',e->'limit_cents',
      'extras_cents',e->'extras_cents') order by (e->>'seq')::int) from jsonb_array_elements(q.legs) e where e->>'payer_id'=u::text),'[]')) order by q.created_at)
      from private.ride_quotes q left join private.ride_consents c on c.quote_id=q.id and c.actor_id=u where u=any(q.required_users) or q.actor_id=u),'[]'),
    'legs',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',l.id,'environment',l.environment,'sequence',l.seq,'revision',l.revision,
      'status',l.status,'pickup_at',l.pickup_at,'passenger',r.passenger_id=u,'payer',l.payer_id=u,'driver',coalesce(l.driver_id=u,false),
      'fare_cents',case when l.payer_id=u then l.fare_cents end,'financial',case when l.payer_id=u or l.driver_id=u then
        (select jsonb_strip_nulls(jsonb_build_object('paid_cents',case when l.payer_id=u then m->'paid_cents' end,
          'due_cents',case when l.payer_id=u then m->'due_cents' end,'reversed_cents',case when l.payer_id=u then m->'reversed_cents' end,
          'driver_cents',case when l.driver_id=u then m->'driver_cents' end,'commission_cents',case when l.driver_id=u then m->'commission_cents' end))
         from private.ride_receipt_money(l.id) m where m is not null) end,
      'journey',case when r.passenger_id=u and s.leg_id is not null then jsonb_build_object('origin',s.origin,'destination',s.destination,'boarded_at',s.boarded_at,
          'ended_at',s.ended_at,'points',s.route,'distance_m',s.measured_meters) end,'my_rating',case when r.passenger_id=u then v.stars end)) order by l.pickup_at,l.seq,l.revision)
      from public.ride_legs l join public.rides r on r.id=l.ride_id left join private.ride_receipts s on s.leg_id=l.id and s.expires_at>now()
      left join private.ride_ratings v on v.leg_id=l.id where u in (r.passenger_id,l.payer_id,l.driver_id)),'[]'),
    'help',coalesce((select jsonb_agg(jsonb_build_object('leg',h.leg_id,'reason',h.reason,'protocol',h.task_id) order by h.leg_id,h.reason) from private.ride_help h where h.actor=u),'[]')
  ) into data;
  return data;
end $$;
revoke all on function public.ride_export_my_data() from public,anon,authenticated,service_role;
grant execute on function public.ride_export_my_data() to authenticated;
create view public.my_ride_data_export with(security_invoker=true) as
  select auth.uid() as id, public.ride_export_my_data() as mobility where auth.uid() is not null;
revoke all on public.my_ride_data_export from public,anon,authenticated,service_role;
grant select on public.my_ride_data_export to authenticated;
