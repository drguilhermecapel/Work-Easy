-- Accepting a quote takes the total the client was shown. A page that still shows an older total is
-- refused instead of accepting the changed price. A provider cannot accept its own quote.
drop function public.respond_quote(uuid, boolean);

create function public.respond_quote(p_token uuid, p_accept boolean, p_expected_total_cents int default null)
returns public.quote_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes;
  v_status public.quote_status := case when p_accept then 'accepted' else 'declined' end;
begin
  select * into v_quote from public.quotes where public_token = p_token and status <> 'draft' for update;
  if not found or p_accept is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if v_quote.status = 'expired'
     or (v_quote.status = 'sent' and v_quote.valid_until < private.sp_date(now())) then
    raise exception 'quote_expired' using errcode = 'P0001';
  end if;
  if v_quote.status <> 'sent' then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  if auth.uid() is not null and auth.uid() = v_quote.provider_id then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if p_accept then
    if p_expected_total_cents is null then
      raise exception 'not_allowed' using errcode = 'P0001', detail = 'expected total required';
    end if;
    if p_expected_total_cents <> v_quote.total_cents then
      raise exception 'quote_total_changed' using errcode = 'P0001';
    end if;
  end if;

  update public.quotes set status = v_status where id = v_quote.id;
  perform private.audit('quote.' || v_status::text, 'quote', v_quote.id::text, '{}'::jsonb);
  return v_status;
end;
$$;

revoke all on function public.respond_quote(uuid, boolean, int) from public;
grant execute on function public.respond_quote(uuid, boolean, int) to anon, authenticated;
