-- Trigger functions run when their trigger fires; no role calls them, so no role needs EXECUTE on
-- them. These two were callable by PUBLIC, anon and authenticated. The revoke takes EXECUTE away
-- from those roles only: the triggers keep firing for the API roles, because PostgreSQL checks
-- the privilege when the trigger is created, not when it fires.

revoke all on function private.guard_proposal_timestamps() from public, anon, authenticated;
revoke all on function private.notify_booking_requested() from public, anon, authenticated;
