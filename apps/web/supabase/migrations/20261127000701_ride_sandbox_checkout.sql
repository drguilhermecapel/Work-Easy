-- Dedicated PSP sandbox. A test payer must be provisioned explicitly. No grants on the
-- underlying bindings or accounts and no path to production service payments.
create table private.ride_sandbox_psp (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false
);
insert into private.ride_sandbox_psp default values;
create table private.ride_sandbox_customers (
  payer_id uuid primary key references public.profiles(id),
  customer_ref text not null unique check (customer_ref ~ '^cus_[a-zA-Z0-9_-]{1,100}$')
);
create table private.ride_sandbox_charges (
  leg_id uuid primary key references public.ride_legs(id),
  operation_id uuid not null unique default gen_random_uuid(),
  payer_id uuid not null references public.profiles(id),
  customer_ref text not null,
  amount_cents integer not null check (amount_cents>0),
  extras_cents integer not null check (extras_cents between 0 and amount_cents),
  external_id text unique,
  state text not null default 'unknown' check(state in ('unknown','pending','paid','partial_refund','refunded','cancelled','review')),
  refunded_cents integer not null default 0 check(refunded_cents between 0 and amount_cents),
  captured boolean not null default false,
  send_claimed boolean not null default false,
  invoice_url text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
revoke all on private.ride_sandbox_psp,private.ride_sandbox_customers,private.ride_sandbox_charges from public,anon,authenticated,service_role;

create function public.ride_sandbox_payment_view(p_leg uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c private.ride_sandbox_charges; l public.ride_legs;
begin
 select * into l from public.ride_legs where id=p_leg and payer_id=auth.uid() and status='completed' and environment='simulation';
 if not found or private.ride_env()<>'simulation' or not exists(select from public.profiles where id=auth.uid() and deleted_at is null) then return null; end if;
 select * into c from private.ride_sandbox_charges where leg_id=p_leg;
 if not found and not (exists(select from private.ride_sandbox_psp where enabled)
   and exists(select from private.ride_network where environment='simulation' and module_enabled)
   and exists(select from private.ride_sandbox_customers where payer_id=auth.uid())) then return null; end if;
 return jsonb_build_object('state',coalesce(c.state,'available'),'amount_cents',l.fare_cents,'refunded_cents',coalesce(c.refunded_cents,0),
   'invoice_url',case when c.state='pending' then c.invoice_url end);
end $$;

-- The caller of this service-role-only RPC has verified the session with Auth. Lock the
-- leg before binding it to this PSP. The separate send lease is claimed after GET.
create function public.ride_sandbox_prepare_charge(p_leg uuid,p_user uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.ride_sandbox_charges; l public.ride_legs; account jsonb; customer text;
begin
 if private.ride_env()<>'simulation' then raise exception 'not_allowed'; end if;
 select * into l from public.ride_legs where id=p_leg and payer_id=p_user and status='completed' and environment='simulation' for update;
 if not found or not exists(select from public.profiles where id=p_user and deleted_at is null) then raise exception 'not_allowed'; end if;
 select * into c from private.ride_sandbox_charges where leg_id=p_leg;
 if not found then
   if not exists(select from private.ride_sandbox_psp where enabled) then raise exception 'ride_feature_disabled'; end if;
   select customer_ref into customer from private.ride_sandbox_customers where payer_id=p_user;
   if not found then raise exception 'not_allowed'; end if;
   account:=public.claim_ride_sandbox_account(p_leg);
   insert into private.ride_sandbox_charges(leg_id,payer_id,customer_ref,amount_cents,extras_cents)
    values(p_leg,p_user,customer,(account->>'fare_cents')::int,(account->>'extras_cents')::int) returning * into c;
 end if;
 return jsonb_build_object('leg_id',c.leg_id,'customer',c.customer_ref,'amount_cents',c.amount_cents,'payment_id',c.external_id,'create',not c.send_claimed and c.external_id is null);
end $$;

-- An unsuccessful read-only lookup therefore consumes no POST attempt. Once
-- acquired, the lease is never auto-reset after a timeout or process restart.
create function public.ride_sandbox_claim_send(p_leg uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if private.ride_env()<>'simulation' or not exists(select from private.ride_sandbox_psp where enabled)
    or not exists(select from private.ride_network where environment='simulation' and module_enabled) then return false; end if;
 update private.ride_sandbox_charges c set send_claimed=true,updated_at=now()
  where c.leg_id=p_leg and not c.send_claimed and c.external_id is null and private.ride_active_user(c.payer_id)
    and exists(select from private.ride_sandbox_customers cust where cust.payer_id=c.payer_id and cust.customer_ref=c.customer_ref);
 return found;
end $$;

-- Webhook lookup requires an existing locally committed intent.
create function public.ride_sandbox_find_charge(p_leg uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('leg_id',leg_id,'customer',customer_ref,'amount_cents',amount_cents,'payment_id',external_id,'create',false)
 from private.ride_sandbox_charges where private.ride_env()='simulation' and leg_id=p_leg
$$;

-- Both webhook delivery and payer refresh enter this transaction after a GET from
-- the sandbox. Cumulative amounts survive replay and out-of-order reads.
create function public.ride_sandbox_observe_charge(p_leg uuid,p_payment text,p_customer text,p_amount integer,
 p_status text,p_refunded integer,p_invoice text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.ride_sandbox_charges; delta integer; extra integer; next_state text;
begin
 select * into c from private.ride_sandbox_charges where leg_id=p_leg for update;
 if not found or private.ride_env()<>'simulation' or p_payment is null or p_payment !~ '^pay_[a-zA-Z0-9_-]{1,100}$'
   or p_customer is distinct from c.customer_ref or p_amount is distinct from c.amount_cents
   or (c.external_id is not null and c.external_id<>p_payment) or p_refunded is null or p_refunded not between 0 and c.amount_cents then raise exception 'payment_mismatch'; end if;
 if p_invoice is not null and p_invoice !~ '^https://sandbox\.asaas\.com/i/[a-zA-Z0-9_-]+$' then raise exception 'payment_mismatch'; end if;
 if p_status not in ('unknown','pending','paid','cancelled','review') or p_status is null then raise exception 'invalid_input'; end if;
 if (p_status='paid' or p_refunded>0) and not c.captured then
   perform public.record_ride_sandbox_financial_event(p_leg,c.operation_id,'capture',c.amount_cents,0);
   c.captured:=true;
 end if;
 delta:=greatest(0,p_refunded-c.refunded_cents);
 if delta>0 then
   -- Partial refunds with extras require classification by finance. Keep the
   -- discrepancy open instead of assigning extras by an arbitrary proportion.
   if c.extras_cents>0 and p_refunded<c.amount_cents then next_state:='review';
   else
     extra:=case when p_refunded=c.amount_cents then c.extras_cents else 0 end;
     perform public.record_ride_sandbox_financial_event(p_leg,gen_random_uuid(),'refund',delta,extra);
     c.refunded_cents:=p_refunded;
   end if;
 end if;
 next_state:=coalesce(next_state,case when c.refunded_cents=c.amount_cents then 'refunded'
   when c.refunded_cents>0 then 'partial_refund' when p_status='review' then 'review'
   when c.captured then 'paid' when c.state='cancelled' and p_status='pending' then 'cancelled' else p_status end);
 update private.ride_sandbox_charges set external_id=p_payment,state=next_state,refunded_cents=c.refunded_cents,
  captured=c.captured,invoice_url=coalesce(p_invoice,invoice_url),updated_at=now() where leg_id=p_leg;
 return jsonb_build_object('state',next_state,'refunded_cents',c.refunded_cents,'amount_cents',c.amount_cents);
end $$;
revoke all on function public.ride_sandbox_payment_view(uuid) from public,anon,service_role;
grant execute on function public.ride_sandbox_payment_view(uuid) to authenticated;
revoke all on function public.ride_sandbox_prepare_charge(uuid,uuid),public.ride_sandbox_find_charge(uuid),public.ride_sandbox_claim_send(uuid),
  public.ride_sandbox_observe_charge(uuid,text,text,integer,text,integer,text) from public,anon,authenticated;
grant execute on function public.ride_sandbox_prepare_charge(uuid,uuid),public.ride_sandbox_find_charge(uuid),public.ride_sandbox_claim_send(uuid),
  public.ride_sandbox_observe_charge(uuid,text,text,integer,text,integer,text) to service_role;
