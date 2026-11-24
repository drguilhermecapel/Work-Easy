-- A review on a public provider page is reported by where it is shown. The public page
-- (get_provider_page) never sends review ids, so the handle is the provider and the instant the
-- review was written, both of which the page already shows.
create function public.report_review(p_provider uuid, p_created_at timestamptz, p_reason text, p_details text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review uuid;
begin
  select rv.id into v_review
    from public.reviews rv
   where rv.provider_id = p_provider and rv.created_at = p_created_at and rv.published
   order by rv.id
   limit 1;
  if v_review is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  return public.report_content('review', v_review, p_reason, p_details);
end;
$$;

revoke all on function public.report_review(uuid, timestamptz, text, text) from public, anon;
grant execute on function public.report_review(uuid, timestamptz, text, text) to authenticated;
