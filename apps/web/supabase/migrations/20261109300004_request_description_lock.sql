-- Once a provider has answered a request with a proposal (sent or accepted), the client cannot change
-- its description: the provider priced the job as it was written.
create or replace function private.guard_request()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_client_context() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'open';
    new.expires_at := least(coalesce(new.expires_at, now() + interval '7 days'), now() + interval '30 days');
    return new;
  end if;

  if new.client_id is distinct from old.client_id
     or new.occupation_slug is distinct from old.occupation_slug
     or new.neighborhood_id is distinct from old.neighborhood_id
     or new.expires_at is distinct from old.expires_at then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  if new.description is distinct from old.description
     and exists (select 1 from public.proposals p where p.request_id = old.id and p.status in ('sent', 'accepted')) then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;

  if new.status is distinct from old.status
     and not (old.status = 'open' and new.status = 'canceled') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
