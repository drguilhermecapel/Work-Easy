-- 20261023100000 Booking reminders, about 24 h and 2 h before an appointment starts.
--
-- 08_notifications already queues the 24 h reminder when a booking becomes accepted (trigger
-- bookings_50_notify) and skips the queued ones when it is canceled. What it cannot do is the
-- 2 h reminder, or catch a 24 h reminder the trigger did not queue. This migration adds a sweep
-- that pg_cron runs every 15 minutes. It uses the same outbox, template and contact rules:
--   * who: the client and the provider of an accepted or paid booking, each through
--     private.notify(), which only uses a phone or e-mail confirmed by Auth (one-time code) and
--     queues nothing for an account without one. A provider's own client has no account
--     (client_id is null) and is never messaged: the CRM phone is typed by the provider.
--   * when: the moment of an offset is start - 24 h or start - 2 h (absolute durations; Brazil has
--     had no daylight saving time since 2019, and the dispatcher shows the start in São Paulo
--     time). A run queues the reminders whose moment is at most 30 minutes ahead, scheduled for
--     the exact moment, so the every-minute dispatcher sends them on time. A moment missed by up
--     to 30 minutes (the scheduler was down) is still sent, right away; an older one is dropped.
--   * once: one reminder per recipient, booking and offset. The dedupe key (booking_id and
--     reminder_hours in params) is a partial unique index; the sweep also checks before it
--     inserts and runs under an advisory lock, so a race ends as a no-op instead of an error. The
--     24 h reminders queued by the trigger carry no reminder_hours; the sweep recognizes them by
--     their time (start - 24 h).
--   * a booking accepted after the moment of an offset gets no reminder for it: the confirmation
--     sent on acceptance already told the client and the provider the date and time.
--   * canceling skips the queued reminders (08), these included. A booking that is no longer
--     accepted or paid (started, completed, disputed) is not selected.
--   * no quiet hours: a reminder for an early appointment can land early in the morning. That is a
--     product decision, not made here.
-- The sweep only fills the outbox, so the job needs no Vault secret and runs the same locally.

-- Dedupe key of a sweep reminder.
create unique index notifications_booking_reminder_once_idx
  on public.notifications (user_id, (params ->> 'booking_id'), (params ->> 'reminder_hours'))
  where template = 'lembrete_atendimento' and (params ->> 'reminder_hours') is not null;

-- The sweep reads accepted and paid bookings by start time.
create index bookings_reminder_scan_idx
  on public.bookings ((lower(period)))
  where status in ('accepted', 'paid');

-- True when this reminder (user, booking, offset) is already in the outbox, whatever its status:
-- a sent, failed or skipped reminder is never queued a second time. The second branch is the
-- 24 h reminder queued by the acceptance trigger, which has no reminder_hours.
create function private.booking_reminder_queued(
  p_user uuid,
  p_booking uuid,
  p_hours int,
  p_moment timestamptz
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.notifications n
     where n.template = 'lembrete_atendimento'
       and n.user_id = p_user
       and n.params ->> 'booking_id' = p_booking::text
       and (n.params ->> 'reminder_hours' = p_hours::text or n.scheduled_for = p_moment)
  );
$$;

-- Queues the reminders due around p_now and returns how many were queued. p_now is a parameter
-- so the rules can be exercised at any instant; the job always passes the current time.
create function private.enqueue_booking_reminders(p_now timestamptz default now())
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- How far ahead of its moment a reminder is queued, how late it is still sent, and the least
  -- time left before the start for a reminder to be worth sending.
  c_ahead constant interval := interval '30 minutes';
  c_grace constant interval := interval '30 minutes';
  c_min_left constant interval := interval '30 minutes';
  v_hours int;
  v_lead interval;
  v_booking record;
  v_moment timestamptz;
  v_params jsonb;
  v_user uuid;
  v_queued int := 0;
begin
  -- One sweep at a time: the job is serial, but a manual call may overlap it.
  perform pg_advisory_xact_lock(hashtextextended('booking_reminders', 0));

  foreach v_hours in array array[24, 2] loop
    v_lead := make_interval(hours => v_hours);
    for v_booking in
      select b.id, b.client_id, b.provider_id, b.occupation_slug, lower(b.period) as starts_at,
             coalesce((select max(e.at) from public.booking_events e
                        where e.booking_id = b.id and e.to_status = 'accepted'), b.created_at) as accepted_at,
             (select p.display_name from public.providers p where p.id = b.provider_id) as provider_name
        from public.bookings b
       where b.status in ('accepted', 'paid')
         -- the bounds move instead of the column, so bookings_reminder_scan_idx applies
         and lower(b.period) between p_now - c_grace + v_lead and p_now + c_ahead + v_lead
         and lower(b.period) > p_now + c_min_left
       order by lower(b.period), b.id
    loop
      v_moment := v_booking.starts_at - v_lead;
      -- Accepted after the moment: the confirmation was the reminder.
      continue when v_booking.accepted_at >= v_moment;

      -- The keys the dispatcher reads (notification-context.ts), plus the dedupe key.
      v_params := jsonb_build_object(
        'booking_id', v_booking.id,
        'starts_at', v_booking.starts_at,
        'occupation_slug', v_booking.occupation_slug,
        'provider_name', v_booking.provider_name,
        'reminder_hours', v_hours);

      foreach v_user in array array[v_booking.client_id, v_booking.provider_id] loop
        continue when v_user is null
                   or private.booking_reminder_queued(v_user, v_booking.id, v_hours, v_moment);
        begin
          perform private.notify(v_user, 'lembrete_atendimento', v_params, greatest(v_moment, p_now));
        exception when unique_violation then
          continue;
        end;
        -- private.notify queues nothing for an account without a confirmed contact
        if private.booking_reminder_queued(v_user, v_booking.id, v_hours, v_moment) then
          v_queued := v_queued + 1;
        end if;
      end loop;
    end loop;
  end loop;

  return v_queued;
end;
$$;

revoke all on function private.booking_reminder_queued(uuid, uuid, int, timestamptz) from public;
revoke all on function private.enqueue_booking_reminders(timestamptz) from public;

select cron.schedule('workeasy-booking-reminders', '*/15 * * * *', 'select private.enqueue_booking_reminders()');
