-- Platform settings are changed only through admin_set_setting() (an admin-only security
-- definer function with range checks and an audit row) and by the service role. The API
-- role `authenticated` keeps reading the settings the RLS read policies allow, but no longer
-- holds table-level insert, update or delete. The admin write policies stay in place as a
-- second layer, so a grant added later still cannot be used by a signed-in user.

revoke insert, update, delete on public.platform_settings from authenticated;
