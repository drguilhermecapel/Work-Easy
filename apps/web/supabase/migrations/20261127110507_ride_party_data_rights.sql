-- O17 stage 5 data rights (PAR-501..508): what happens to accounts, mandates, invites,
-- companions and funding when a person leaves, what the retention job removes and what
-- the person's own export shows. No new cron job: the existing five-minute retention
-- entry point is wrapped. Financial history is never rewritten: legs, orders, frozen
-- funding, vouchers and invoices keep the opaque subject key of 20261127000901.
create index ride_leg_funding_mandate on private.ride_leg_funding(mandate_id) where mandate_id is not null;
-- A corporate funding declaration always names its program, so the reservation at leg
-- creation can never be skipped and leave the rider with a personal payment.
alter table private.ride_quote_funding add constraint ride_quote_funding_voucher_program check(kind<>'voucher' or program_id is not null);
alter table private.ride_leg_funding add constraint ride_leg_funding_voucher_program check(kind<>'voucher' or program_id is not null);

-- Erasure. Standing authorizations end on both sides, memberships are left, invites and
-- companion links disappear. An account the person owns is closed, which already blocks
-- new legs, releases the fleet's cessions and ends every mandate it pays; it is removed
-- altogether only when no leg, voucher, invoice or fleet trip ever depended on it.
create function private.erase_ride_parties() returns trigger language plpgsql security definer set search_path='' as $$
declare acct private.ride_accounts; link record;
begin
 update private.ride_payer_mandates set status='revoked',revoked_at=now() where status='active' and new.id in (rider_id,payer_id);
 for link in delete from private.ride_companions where new.id in (owner_id,companion_id) returning owner_id,companion_id,status loop
   -- The copies of the owner's notices leave with the link; a leg the companion pays keeps the payer's own.
   if link.status='active' then
     delete from private.ride_passenger_notices n using public.ride_legs l,public.rides r
      where n.owner_id=link.companion_id and l.id=n.leg_id and r.id=l.ride_id and r.passenger_id=link.owner_id and l.payer_id<>link.companion_id;
   end if;
 end loop;
 delete from private.ride_companion_invites where new.id in (owner_id,companion_id);
 delete from private.ride_rider_invites where new.id in (sponsor_id,rider_id);
 with gone as (delete from private.ride_guest_invites where new.id in (issued_by,guest_id) returning grant_id,status)
  update private.ride_trip_grants g set status='rejected',decided_at=now() from gone where g.id=gone.grant_id and gone.status='pending' and g.status='approved';
 delete from private.ride_account_invites where new.id in (issued_by,member_id);
 -- A funding declaration on a quote that can no longer become a ride says nothing about money,
 -- and neither does the standing consent a mandate recorded on it for the payer.
 delete from private.ride_consents c using private.ride_quote_funding f,private.ride_quotes q
  where f.quote_id=c.quote_id and q.id=f.quote_id and q.status not in ('requested','awaiting_consent') and f.kind='payer' and f.payer_id=new.id and c.actor_id=new.id;
 delete from private.ride_quote_funding f using private.ride_quotes q
  where q.id=f.quote_id and q.status not in ('requested','awaiting_consent') and new.id in (f.member_id,f.payer_id);
 delete from private.ride_trip_grants g where g.beneficiary_id=new.id and g.status<>'used'
   and not exists(select from private.ride_quote_funding f where f.grant_id=g.id) and not exists(select from private.ride_leg_funding f where f.grant_id=g.id)
   and not exists(select from private.ride_guest_invites i where i.grant_id=g.id);
 for acct in select * from private.ride_accounts where owner_id=new.id order by id for update loop
   update private.ride_accounts set status='closed' where id=acct.id and status<>'closed';
   update private.ride_payer_mandates set status='revoked',revoked_at=now() where account_id=acct.id and status='active';
   update private.ride_account_invites set status='revoked',answered_at=now() where account_id=acct.id and status='pending';
   -- A pending quote that counted on the account must not survive as a personal one.
   update private.ride_quotes q set status='superseded' from private.ride_quote_funding f where f.quote_id=q.id and f.account_id=acct.id and q.status='awaiting_consent';
   if not exists(select from private.ride_leg_funding where account_id=acct.id) and not exists(select from private.ride_voucher_grants where account_id=acct.id)
     and not exists(select from private.ride_invoices where account_id=acct.id) and not exists(select from private.ride_leg_vehicles where account_id=acct.id) then
     begin
       delete from private.ride_quote_funding where account_id=acct.id;
       delete from private.ride_guest_invites where account_id=acct.id;
       delete from private.ride_trip_grants where account_id=acct.id;
       delete from private.ride_voucher_programs where account_id=acct.id;
       delete from private.ride_cost_centers where account_id=acct.id;
       delete from private.ride_fleet_assignments where account_id=acct.id;
       delete from private.ride_fleet_vehicles where account_id=acct.id;
       delete from private.ride_payer_mandates where account_id=acct.id;
       delete from private.ride_account_invites where account_id=acct.id;
       delete from private.ride_account_members where account_id=acct.id;
       delete from private.ride_accounts where id=acct.id;
     exception when foreign_key_violation then
       -- Some record still depends on the account: it stays closed and keeps the opaque key.
       null;
     end;
   end if;
 end loop;
 update private.ride_account_members set status='removed',removed_at=now(),removed_by=new.id where member_id=new.id and status='active';
 return null;
end $$;
create trigger erase_ride_parties after update of deleted_at on public.profiles for each row when(new.deleted_at is not null and old.deleted_at is null)
 execute function private.erase_ride_parties();

-- Retention. An invite that reached a final state leaves after 24 hours, and so do a
-- revoked companion link and a mandate that ended without ever funding a quote or a leg.
-- Dependents and the access log keep the periods of private.purge_ride_minors().
create function private.purge_ride_parties() returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.purge_ride_delegation_invites();
 update private.ride_account_invites set status='expired',answered_at=expires_at where status='pending' and expires_at<=now();
 with gone as (update private.ride_guest_invites set status='expired',answered_at=expires_at where status='pending' and expires_at<=now() returning grant_id)
  update private.ride_trip_grants g set status='expired' from gone where g.id=gone.grant_id and g.status='approved';
 delete from private.ride_account_invites where status<>'pending' and coalesce(answered_at,expires_at)<=now()-interval '24 hours';
 delete from private.ride_rider_invites where status<>'pending' and coalesce(answered_at,expires_at)<=now()-interval '24 hours';
 delete from private.ride_companion_invites where status<>'pending' and coalesce(answered_at,expires_at)<=now()-interval '24 hours';
 delete from private.ride_guest_invites where status<>'pending' and coalesce(answered_at,expires_at)<=now()-interval '24 hours';
 delete from private.ride_companions where status='revoked' and coalesce(revoked_at,created_at)<=now()-interval '24 hours';
 delete from private.ride_payer_mandates m where (m.status<>'active' or m.valid_until<=now())
   and coalesce(m.revoked_at,m.valid_until,m.created_at)<=now()-interval '24 hours'
   and not exists(select from private.ride_quote_funding f where f.mandate_id=m.id) and not exists(select from private.ride_leg_funding f where f.mandate_id=m.id);
end $$;
alter function private.purge_ride_safety() rename to purge_ride_safety_before_parties;
create function private.purge_ride_safety() returns void language sql security definer set search_path='' as $$
 select private.purge_ride_safety_before_parties();
 select private.purge_ride_parties();
$$;

-- Export. The person's own side of every relation: role, limits, authorizations and
-- which of their legs somebody else funds. Never the counterpart's identity, and the
-- price only for who pays it.
alter function public.ride_export_my_data() rename to ride_export_before_parties;
revoke all on function public.ride_export_before_parties() from public,anon,authenticated,service_role;
create function public.ride_export_my_data() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare data jsonb:=public.ride_export_before_parties(); me uuid:=auth.uid();
begin
 return data||jsonb_build_object(
  'accounts',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'environment',a.environment,'kind',a.kind,'name',a.name,'account_status',a.status,
      'owner',a.owner_id=me,'role',m.role,'status',m.status,'joined_at',m.joined_at,'removed_at',m.removed_at,'member_limit_cents',m.member_limit_cents,
      'group_tag',m.group_tag)||case when a.owner_id=me then jsonb_build_object('monthly_limit_cents',a.monthly_limit_cents,'default_method',a.default_method,
      'verified_until',a.verified_until,'created_at',a.created_at) else '{}'::jsonb end order by m.joined_at,a.id)
    from private.ride_account_members m join private.ride_accounts a on a.id=m.account_id where m.member_id=me),'[]'::jsonb),
  'mandates',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'environment',m.environment,'kind',m.kind,'role',case when m.rider_id=me then 'rider' else 'payer' end,
      'account_id',m.account_id,'ceiling_cents',case when m.payer_id=me or m.kind='companion' then m.ceiling_cents end,'uses_max',m.uses_max,'status',m.status,
      'valid_until',m.valid_until,'created_at',m.created_at,'revoked_at',m.revoked_at) order by m.created_at,m.id)
    from private.ride_payer_mandates m where me in (m.rider_id,m.payer_id)),'[]'::jsonb),
  'companions',coalesce((select jsonb_agg(jsonb_build_object('role',case when c.owner_id=me then 'owner' else 'companion' end,'environment',c.environment,
      'notices',to_jsonb(c.notices),'pays',c.pays,'status',c.status,'since',c.created_at,'revoked_at',c.revoked_at) order by c.created_at,(c.owner_id=me) desc)
    from private.ride_companions c where me in (c.owner_id,c.companion_id)),'[]'::jsonb),
  'dependents',private.ride_dependents_view(me),
  'rider_invites',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',i.id,'environment',i.environment,
      'role',case when i.sponsor_id=me then 'sponsor' else 'rider' end,'status',case when i.status='pending' and i.expires_at<=now() then 'expired' else i.status end,
      'legs',(select jsonb_agg(jsonb_build_object('seq',x.n,'origin',x.leg->>'origin','destination',x.leg->>'destination') order by x.n)
        from jsonb_array_elements(i.request_legs) with ordinality x(leg,n)),
      'scheduled_at',i.scheduled_at,'ceiling_cents',case when i.sponsor_id=me then i.ceiling_cents end,'instructions',i.instructions,
      'expires_at',i.expires_at,'answered_at',i.answered_at,'created_at',i.created_at)) order by i.created_at,i.id)
    from private.ride_rider_invites i where me in (i.sponsor_id,i.rider_id)),'[]'::jsonb),
  'funded_legs',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('leg',f.leg_id,'kind',f.kind,'mandate_kind',m.kind,'rider',f.member_id=me,
      'payer',f.payer_id=me,'account_id',f.account_id,'account_name',a.name,'month',f.month,'cost_center',c.code,
      'voucher_cents',case when f.payer_id=me then (f.planned->>'voucher_cents')::int end,
      'excess_cents',case when f.payer_id=me then (f.planned->>'excess_cents')::int end)) order by f.month,f.leg_id)
    from private.ride_leg_funding f left join private.ride_payer_mandates m on m.id=f.mandate_id left join private.ride_accounts a on a.id=f.account_id
    left join private.ride_cost_centers c on c.id=f.cost_center_id where me in (f.member_id,f.payer_id)),'[]'::jsonb),
  'fleet_assignments',private.ride_fleet_assignments_view(me),
  'trip_grants',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'account_id',g.account_id,'purpose',g.purpose,
      'status',case when g.status in ('requested','approved') and upper(g.validity)<=now() then 'expired' else g.status end,'from',lower(g.validity),
      'until',upper(g.validity),'guest',g.guest,'mine',coalesce(g.beneficiary_id=me,false),'created_at',g.created_at) order by g.created_at,g.id)
    from private.ride_trip_grants g where g.beneficiary_id=me or g.issued_by=me),'[]'::jsonb));
end $$;
create or replace view public.my_ride_data_export with(security_invoker=true) as
 select auth.uid() as id,public.ride_export_my_data() as mobility where auth.uid() is not null;
revoke all on function public.ride_export_my_data() from public,anon,authenticated,service_role;
grant execute on function public.ride_export_my_data() to authenticated;
revoke all on function private.erase_ride_parties(),private.purge_ride_parties(),private.purge_ride_safety_before_parties(),private.purge_ride_safety()
 from public,anon,authenticated,service_role;

-- Grants sweep. Every ride routine in private stays out of reach of the API roles and no
-- ride RPC in public is open to visitors, whatever file created it. Tables of the ride
-- network in private carry no privilege for the API roles either.
do $$ declare f regprocedure; t regclass; begin
 for f in select p.oid::regprocedure from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
   where n.nspname='private' and p.prokind='f' and p.proname ~ '(^|_)rides?(_|$)' loop
   execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
 end loop;
 for f in select p.oid::regprocedure from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.prokind='f' and (p.proname ~ '(^|_)rides?(_|$)'
     or p.proname in ('admin_decide_invoice_dispute','admin_review_dependent','admin_review_fleet_assignment','admin_set_minor_driver_clearance')) loop
   execute format('revoke all on function %s from public,anon',f);
 end loop;
 for t in select c.oid::regclass from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
   where n.nspname='private' and c.relkind='r' and c.relname ~ '(^|_)rides?(_|$)' loop
   execute format('revoke all on table %s from public,anon,authenticated,service_role',t);
 end loop;
end $$;
