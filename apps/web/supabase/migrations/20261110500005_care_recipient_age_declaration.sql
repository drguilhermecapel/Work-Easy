-- Age declaration for care recipients: whoever adds a care recipient declares that the person is 18
-- or older, and the declaration time is stored. The check runs before an insert only. Care
-- recipients stored before this migration have no declaration and stay as they are; updating them
-- is not refused for lack of one.

alter table public.care_recipients add column adult_declared_at timestamptz;

comment on column public.care_recipients.adult_declared_at is 'When the adult declaration was made (18 or older). Required on insert.';

create function private.require_adult_declaration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.adult_declared_at is null then
    raise exception 'adult_declaration_required' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.require_adult_declaration() from public, anon, authenticated;

create trigger care_recipients_05_adult_declaration
  before insert on public.care_recipients
  for each row execute function private.require_adult_declaration();
