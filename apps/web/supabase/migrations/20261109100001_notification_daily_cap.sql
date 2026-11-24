-- 01 Notification daily cap (DB-03, SEC-FN-03): one destination (a WhatsApp number or an
-- e-mail address) receives at most notification_daily_cap messages per Sao Paulo day. The
-- count is one atomic upsert per message and keeps a SHA-256 of the destination, never the
-- address. The confirmed-contact rule of private.notify is unchanged; the sign-in
-- confirmations that make those contacts proven are set in supabase/config.toml.

insert into public.platform_settings (key, value) values ('notification_daily_cap', '50')
on conflict (key) do nothing;

create table private.notification_daily_counts (
  day date not null,
  recipient_key text not null,
  sent int not null default 0 check (sent >= 0),
  primary key (day, recipient_key)
);

alter table private.notification_daily_counts enable row level security;
revoke all on table private.notification_daily_counts from public, anon, authenticated, service_role;

create function private.purge_notification_counts()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.notification_daily_counts
   where day < (now() at time zone 'America/Sao_Paulo')::date - 7;
$$;

revoke all on function private.purge_notification_counts() from public, anon, authenticated;

select cron.schedule('notification-counts-retention', '23 3 * * *', 'select private.purge_notification_counts()');

-- Queues one message for a user: WhatsApp when the account has a confirmed phone, e-mail
-- when it has a confirmed address; nothing otherwise. Only the contacts confirmed by Auth
-- (one-time code) are used: profiles.phone is typed by the user and is informative only.
-- A destination that already got notification_daily_cap messages today gets nothing more.
create or replace function private.notify(
  p_user uuid,
  p_template text,
  p_params jsonb,
  p_scheduled_for timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text;
  v_email text;
  v_channel public.notification_channel;
  v_destination text;
begin
  if p_user is null then
    return;
  end if;
  select case when u.phone_confirmed_at is not null then nullif(u.phone, '') end,
         case when u.email_confirmed_at is not null then nullif(u.email, '') end
    into v_phone, v_email
    from public.profiles p
    join auth.users u on u.id = p.id
   where p.id = p_user and p.deleted_at is null;

  if v_phone is null and v_email is null then
    return;
  end if;

  if private.setting_int('notification_daily_cap', 50) <= 0 then
    return;
  end if;

  v_channel := case when v_phone is not null then 'whatsapp' else 'email' end::public.notification_channel;
  v_destination := v_channel::text || ':' || lower(coalesce(v_phone, v_email));

  -- Count and check in one statement: two concurrent writers cannot both pass the cap.
  insert into private.notification_daily_counts as c (day, recipient_key, sent)
  values ((now() at time zone 'America/Sao_Paulo')::date, encode(sha256(convert_to(v_destination, 'UTF8')), 'hex'), 1)
  on conflict (day, recipient_key) do update set sent = c.sent + 1
  where c.sent < private.setting_int('notification_daily_cap', 50);
  if not found then
    return;
  end if;

  insert into public.notifications (user_id, phone, email, channel, template, params, scheduled_for)
  values (p_user, v_phone, v_email, v_channel, p_template,
          coalesce(p_params, '{}'), coalesce(p_scheduled_for, now()));
end;
$$;
