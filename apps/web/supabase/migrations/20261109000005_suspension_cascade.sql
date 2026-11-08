-- When a provider stops being approved (suspended, or back to draft or review) or loses the approval
-- of an occupation (not approved, or its registry rejected), the offers they still hold stop:
--   * proposals in 'sent' are withdrawn;
--   * booking requests in 'requested' are canceled (the agenda is freed);
--   * quotes in 'sent' go back to draft, so the public link stops showing them;
--   * care shift offers in 'offered' expire, and a shift left with no open offer is open again.
-- Jobs already accepted are not touched here: they are the admin's to resolve.

create function private.withdraw_unapproved_offers(p_provider uuid, p_occupation text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.proposals p
     set status = 'withdrawn'
    from public.requests r
   where r.id = p.request_id
     and p.provider_id = p_provider
     and p.status = 'sent'
     and (p_occupation is null or r.occupation_slug = p_occupation);

  update public.bookings
     set status = 'canceled',
         canceled_reason = 'provider_not_approved'
   where provider_id = p_provider
     and status = 'requested'
     and (p_occupation is null or occupation_slug = p_occupation);
end;
$$;

create function private.on_provider_unapproved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.withdraw_unapproved_offers(new.id, null);
  update public.quotes set status = 'draft' where provider_id = new.id and status = 'sent';
  -- Two statements on purpose: the second must see the offers the first one expired.
  update public.shift_offers set status = 'expired' where provider_id = new.id and status = 'offered';
  update public.shifts s set status = 'open'
   where s.status = 'offered'
     and lower(s.period) > now()
     and exists (select 1 from public.shift_offers o
                  where o.shift_id = s.id and o.provider_id = new.id and o.status = 'expired')
     and not exists (select 1 from public.shift_offers o where o.shift_id = s.id and o.status = 'offered');
  return new;
end;
$$;

create trigger providers_80_unapproved
  after update of status on public.providers
  for each row
  when (old.status is distinct from new.status and new.status <> 'approved')
  execute function private.on_provider_unapproved();

create function private.on_occupation_unapproved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.withdraw_unapproved_offers(new.provider_id, new.occupation_slug);
  return new;
end;
$$;

create trigger provider_occupations_90_unapproved
  after update of approved, registry_status on public.provider_occupations
  for each row
  when ((old.approved and not new.approved)
     or (new.registry_status = 'rejected' and old.registry_status is distinct from 'rejected'))
  execute function private.on_occupation_unapproved();

revoke all on function private.withdraw_unapproved_offers(uuid, text) from public;
revoke all on function private.on_provider_unapproved() from public;
revoke all on function private.on_occupation_unapproved() from public;
