-- Quote limits: each item description is at most 500 characters (the form enforces the same), and a
-- provider can have at most 30 quotes in draft or sent, created on the same São Paulo day.
-- The total function is the same as before, with the description limit added.

create or replace function private.compute_quote_total()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_item jsonb;
  v_total numeric := 0;
begin
  if jsonb_typeof(new.items) <> 'array' or jsonb_array_length(new.items) > 200 then
    raise exception 'quote_items_invalid' using errcode = 'P0001', detail = 'items must be an array of at most 200';
  end if;
  for v_item in select value from jsonb_array_elements(new.items) loop
    -- is distinct from: a missing key (jsonb_typeof null) is invalid too
    if jsonb_typeof(v_item) is distinct from 'object'
       or jsonb_typeof(v_item -> 'description') is distinct from 'string'
       or char_length(v_item ->> 'description') > 500
       or jsonb_typeof(v_item -> 'quantity') is distinct from 'number'
       or jsonb_typeof(v_item -> 'unit_price_cents') is distinct from 'number'
       or (v_item ->> 'quantity')::numeric <= 0
       or (v_item ->> 'unit_price_cents')::numeric < 0
       or (v_item ->> 'unit_price_cents')::numeric <> trunc((v_item ->> 'unit_price_cents')::numeric) then
      raise exception 'quote_items_invalid' using errcode = 'P0001', detail = v_item::text;
    end if;
    v_total := v_total + round((v_item ->> 'quantity')::numeric * (v_item ->> 'unit_price_cents')::numeric);
  end loop;
  new.total_cents := v_total::int;
  return new;
end;
$$;

-- Statement-level, over the transition table: a row-level check would not see the rows that the
-- same statement inserts before it, so one insert of many rows could pass the limit. The lock
-- serializes two statements of one provider, so the second one counts the first one's rows.
create function private.limit_quotes_per_day()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider uuid;
begin
  for v_provider in select distinct n.provider_id from new_rows n loop
    perform pg_advisory_xact_lock(hashtextextended('quote-day:' || v_provider::text, 0));
    if (select count(*) from public.quotes q
         where q.provider_id = v_provider
           and q.status in ('draft', 'sent')
           and private.sp_date(q.created_at) = private.sp_date(now())) > 30 then
      raise exception 'quote_daily_limit' using errcode = 'P0001';
    end if;
  end loop;
  return null;
end;
$$;

revoke all on function private.limit_quotes_per_day() from public, anon, authenticated;

create trigger quotes_07_daily_limit
  after insert on public.quotes
  referencing new table as new_rows
  for each statement execute function private.limit_quotes_per_day();
