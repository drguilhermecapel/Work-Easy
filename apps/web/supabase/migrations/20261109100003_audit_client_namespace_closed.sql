-- 03 Audit writes by app users (PRIV-03, DB-04): public.log_event is no longer callable by
-- authenticated users. The app never calls it (the Edge Functions use the service role), and
-- an app user could otherwise write up to 4 KB of free text per entry, 60 a minute, into the
-- append-only audit log. The service role keeps the function and its checks.
revoke execute on function public.log_event(text, text, text, jsonb) from authenticated;
