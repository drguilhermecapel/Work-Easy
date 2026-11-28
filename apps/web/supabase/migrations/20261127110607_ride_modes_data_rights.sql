-- O17 stage 6: data rights of the modalities (reserve, seat in a line van, hourly block,
-- assistance). Three existing chains are extended by rename and wrap, with no new job:
-- the retention purge (the flight reference and the reserve terms leave 24 h after the leg
-- closes, with the assistance modality frozen on the leg), the account erasure (future seats
-- go back to the departure, the person's seats, answers and actor ids leave the ledgers) and
-- the person's own export. Transaction records (legs, quotes, consents) keep following O16.

-- A ledger row may outlive the account that wrote it: the identifier becomes null, while
-- the role, the time and the operation key of the outcome stay. A system row never had one.
alter table private.ride_reserve_events drop constraint ride_reserve_events_check,
 add constraint ride_reserve_events_check check(actor_role<>'system' or actor_id is null);
alter table private.ride_reserve_shifts alter column requested_by drop not null;
alter table private.ride_block_extensions alter column proposer drop not null,alter column driver_id drop not null;

-- Retention. The terms and the flight reference only serve the trip; the leg mode 'assist'
-- or 'wav' says as much as the assistance preference and leaves under the same stage-3 rule.
-- The five-minute job reads only those two modes, whatever the size of the history.
create index ride_leg_modes_assistance on private.ride_leg_modes(leg_id) where modality in ('assist','wav');
alter function private.purge_ride_safety() rename to purge_ride_safety_before_modes;
create function private.purge_ride_safety() returns void language sql security definer set search_path='' as $$
 select private.purge_ride_safety_before_modes();
 delete from private.ride_reserve_terms t using public.ride_legs l where l.id=t.leg_id and l.status in ('completed','cancelled')
   and coalesce(t.closed_at,l.updated_at)<=now()-interval '24 hours';
 delete from private.ride_leg_modes m using public.ride_legs l where l.id=m.leg_id and m.modality in ('assist','wav')
   and l.status in ('completed','cancelled') and l.updated_at<now()-interval '24 hours';
$$;

-- Erasure (D7). Named to fire after erase_ride_account, which has already cancelled or
-- frozen the person's open legs, so their reserve proposals are settled by then.
create function private.erase_ride_modes() returns trigger language plpgsql security definer set search_path='' as $$
declare s record;
begin
 -- Seats: departures are locked in id order, as every seat writer does. A seat of a coming
 -- departure returns to it with one audit row; nothing was charged, so no seat row is kept.
 perform private.ride_shuttle_lock_departures(variadic array(select m.departure_id from private.ride_shuttle_seats m
   where m.passenger_id=new.id and m.state='confirmed'));
 for s in select m.id,m.departure_id,m.seats,m.seat_cents from private.ride_shuttle_seats m
    join private.ride_shuttle_departures d on d.id=m.departure_id
    where m.passenger_id=new.id and m.state='confirmed' and d.state='open' and d.departs_at>now() order by m.id for update of m loop
   update private.ride_shuttle_seats set state='released' where id=s.id;
   perform private.ride_shuttle_event(gen_random_uuid(),'released',s.departure_id,s.id,null,'system',s.seats,s.seat_cents,
     jsonb_build_object('reason','account_erased'));
 end loop;
 delete from private.ride_shuttle_seats where passenger_id=new.id;
 update private.ride_shuttle_events set actor_id=null where actor_id=new.id;
 update private.ride_shuttle_departures set driver_id=null where driver_id=new.id;
 -- Reserve: no proposal stays open for or by this person; then the actor ids leave.
 for s in update private.ride_reserve_shifts set state='expired',outcome='leg_changed',decided_at=clock_timestamp()
    where state='proposed' and new.id in (requested_by,driver_id) returning id,leg_id,old_pickup,new_pickup loop
   perform private.ride_reserve_event(s.leg_id,'shift_expired',null,'system',s.id,s.old_pickup,s.new_pickup,jsonb_build_object('outcome','account_erased'));
 end loop;
 update private.ride_reserve_shifts set requested_by=null where requested_by=new.id;
 update private.ride_reserve_shifts set driver_id=null where driver_id=new.id;
 update private.ride_reserve_events set actor_id=null where actor_id=new.id;
 -- The passenger's terms of a closed leg leave now; a leg still under review loses the flight reference.
 delete from private.ride_reserve_terms t using public.ride_legs l join public.rides r on r.id=l.ride_id
   where t.leg_id=l.id and r.passenger_id=new.id and l.status in ('completed','cancelled');
 update private.ride_reserve_terms t set flight_ref=null,updated_at=now() from public.ride_legs l join public.rides r on r.id=l.ride_id
   where t.leg_id=l.id and r.passenger_id=new.id and t.flight_ref is not null;
 -- Block extensions: an open proposal closes, the person's answers are deleted (an applied
 -- one already lives in the consents of its quote version) and the ids leave the proposal.
 update private.ride_block_extensions set state='expired',closed_at=clock_timestamp()
   where state='pending' and (proposer=new.id or driver_id=new.id or new.id=any(required));
 delete from private.ride_block_extension_decisions where actor_id=new.id;
 update private.ride_block_extensions set proposer=null where proposer=new.id;
 update private.ride_block_extensions set driver_id=null where driver_id=new.id;
 update private.ride_block_extensions set required=array_remove(required,new.id) where new.id=any(required);
 -- Assistance: the choice kept with the quote, its modality on quotes and legs, and the
 -- inspected equipment of the person's vehicle.
 delete from private.ride_access_quotes where owner_id=new.id;
 delete from private.ride_quote_modes m using private.ride_quotes q where m.quote_id=q.id and q.passenger_id=new.id and m.modality in ('assist','wav');
 delete from private.ride_leg_modes m using public.ride_legs l join public.rides r on r.id=l.ride_id
   where m.leg_id=l.id and r.passenger_id=new.id and m.modality in ('assist','wav');
 delete from private.ride_access_equipment where driver_id=new.id;
 return null;
end $$;
create trigger erase_ride_modes after update of deleted_at on public.profiles for each row
 when(new.deleted_at is not null and old.deleted_at is null) execute function private.erase_ride_modes();

-- The person's own export gains the stage-6 records. Each role reads its own side only:
-- no other passenger, no operator reference, no evidence reference, no counterpart id.
alter function public.ride_export_my_data() rename to ride_export_before_modes;
create function public.ride_export_my_data() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare data jsonb:=public.ride_export_before_modes(); me uuid:=auth.uid();
begin
 return data||jsonb_build_object(
  'access_preferences',coalesce((select jsonb_agg(jsonb_build_object('leg',p.leg,'cue',p.cue,'assistance',p.assistance,'shared',p.share_cue,
      'companion',p.companion,'boarding_minutes',p.boarding_minutes) order by p.leg) from private.ride_access_preferences p where p.owner_id=me),'[]'),
  'shuttle_seats',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',s.id,'environment',l.environment,'origin_area',l.origin_area,
      'destination_area',l.destination_area,'departs_at',d.departs_at,'seats',s.seats,'seat_cents',s.seat_cents,'charged_cents',0,'state',s.state,
      'booked_at',s.created_at,'closed_at',s.closed_at,'replaces',s.replaces)) order by s.created_at,s.id)
    from private.ride_shuttle_seats s join private.ride_shuttle_departures d on d.id=s.departure_id
    join private.ride_shuttle_lines l on l.id=d.line_id where s.passenger_id=me),'[]'),
  'reserve_terms',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('leg',t.leg_id,'state',t.state,'original_pickup',t.original_pickup,
      'confirm_by',t.confirm_by,'airport',t.airport,'terminal',t.terminal,'flight_ref',t.flight_ref,'frozen_at',t.frozen_at,'closed_at',t.closed_at))
      order by t.frozen_at,t.leg_id)
    from private.ride_reserve_terms t join public.ride_legs l on l.id=t.leg_id join public.rides r on r.id=l.ride_id where r.passenger_id=me),'[]'),
  'reserve_shifts',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',s.id,'leg',s.leg_id,'reason',s.reason,'old_pickup',s.old_pickup,
      'new_pickup',s.new_pickup,'state',s.state,'requested_by_me',coalesce(s.requested_by=me,false),
      'my_answer',case when s.driver_id=me then s.accepted end,'created_at',s.created_at,'decided_at',s.decided_at)) order by s.created_at,s.id)
    from private.ride_reserve_shifts s where s.requested_by=me or s.driver_id=me),'[]'),
  'block_extensions',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',e.id,'leg',e.leg_id,'minutes',e.minutes,'km',e.km,'cents',e.cents,
      'driver_cents',case when e.driver_id=me then e.driver_cents end,'state',e.state,'proposed_by_me',coalesce(e.proposer=me,false),
      'accepted',d.accepted,'decided_at',d.decided_at,'created_at',e.created_at,'closed_at',e.closed_at)) order by e.created_at,e.id)
    from private.ride_block_extensions e left join private.ride_block_extension_decisions d on d.extension_id=e.id and d.actor_id=me
    where e.proposer=me or me=any(e.required)),'[]'));
end $$;
-- PostgreSQL views bind by function OID: rebind the account export to the new top.
create or replace view public.my_ride_data_export with(security_invoker=true) as
 select auth.uid() as id,public.ride_export_my_data() as mobility where auth.uid() is not null;

-- Grants. This file first, then a sweep: no private ride function is executable by an API
-- role, and every stage-6 RPC is for a signed-in person only. The wrapped plain quote keeps
-- exactly the grants of stage 1.
revoke all on function private.purge_ride_safety_before_modes(),private.purge_ride_safety(),private.erase_ride_modes(),
 public.ride_export_before_modes(),public.ride_export_my_data() from public,anon,authenticated,service_role;
grant execute on function public.ride_export_my_data() to authenticated;
do $$ declare f regprocedure; begin
 for f in select p.oid::regprocedure from pg_catalog.pg_proc p where p.pronamespace='private'::regnamespace
    and p.proname ~ '(^|_)(ride|shuttle)(_|$)' loop
   execute format('revoke all on function %s from public,anon,authenticated',f);
 end loop;
 foreach f in array array[
   'public.ride_market_catalog(text,text,timestamptz)','public.ride_request_modality(text,text,text,timestamptz)',
   'public.ride_class_menu(uuid,timestamptz,jsonb)','public.ride_validate_vehicle_features(uuid,int,text,text,boolean,text)',
   'public.ride_access_options(uuid,timestamptz)','public.ride_quote_accessible(uuid,uuid,timestamptz,jsonb,text,boolean)',
   'public.ride_verify_access_equipment(uuid,text,text,text,timestamptz)',
   'public.ride_shift_reservation(uuid,timestamptz,text,uuid)','public.driver_decide_shift(uuid,boolean)',
   'public.ride_reserve_contingency(uuid,text,timestamptz,uuid)','public.ride_reserve_flight(uuid,text)','public.ride_reserve_state(uuid)',
   'public.driver_mode_tasks()','public.ride_shuttle_board(text,text)','public.ride_book_shuttle_seat(uuid,int,int,uuid)',
   'public.ride_cancel_shuttle_seat(uuid,uuid)','public.ride_rebook_shuttle_seat(uuid,uuid,uuid)',
   'public.admin_cancel_shuttle_departure(uuid,text,uuid)','public.admin_shuttle_departures()','public.driver_shuttle_manifest(uuid)',
   'public.ride_block_options(text,timestamptz)','public.ride_quote_block(uuid,timestamptz,text,text,text,uuid)',
   'public.ride_intercity_options()','public.ride_quote_intercity(uuid,timestamptz,jsonb)',
   'public.ride_propose_extension(uuid,int,int,uuid)','public.ride_decide_extension(uuid,boolean)','public.ride_block_state(uuid)']::regprocedure[] loop
   execute format('revoke all on function %s from public,anon,service_role',f);
   execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
revoke all on function public.ride_quote(uuid,uuid,timestamptz,jsonb) from public,anon;
