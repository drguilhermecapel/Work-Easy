-- CPF and CNPJ check digits, checked by the database. Both functions are pure: they read no data.
-- A number with the right length but wrong check digits is refused, and so is one number repeated.

create function private.is_valid_cpf(p text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_sum int := 0;
  v_rest int;
  v_first int;
  v_second int;
begin
  -- Eleven digits, not one digit repeated (those add up but are never issued)
  if p is null or p !~ '^[0-9]{11}$' or p ~ '^([0-9])\1{10}$' then
    return false;
  end if;
  for i in 1..9 loop
    v_sum := v_sum + substr(p, i, 1)::int * (11 - i);
  end loop;
  v_rest := v_sum % 11;
  v_first := case when v_rest < 2 then 0 else 11 - v_rest end;
  v_sum := 0;
  for i in 1..10 loop
    v_sum := v_sum + substr(p, i, 1)::int * (12 - i);
  end loop;
  v_rest := v_sum % 11;
  v_second := case when v_rest < 2 then 0 else 11 - v_rest end;
  return substr(p, 10, 1)::int = v_first and substr(p, 11, 1)::int = v_second;
end;
$$;

create function private.is_valid_cnpj(p text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_w1 int[] := array[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  v_w2 int[] := array[6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  v_sum int := 0;
  v_rest int;
  v_first int;
  v_second int;
begin
  -- Fourteen digits, not one digit repeated
  if p is null or p !~ '^[0-9]{14}$' or p ~ '^([0-9])\1{13}$' then
    return false;
  end if;
  for i in 1..12 loop
    v_sum := v_sum + substr(p, i, 1)::int * v_w1[i];
  end loop;
  v_rest := v_sum % 11;
  v_first := case when v_rest < 2 then 0 else 11 - v_rest end;
  v_sum := 0;
  for i in 1..13 loop
    v_sum := v_sum + substr(p, i, 1)::int * v_w2[i];
  end loop;
  v_rest := v_sum % 11;
  v_second := case when v_rest < 2 then 0 else 11 - v_rest end;
  return substr(p, 13, 1)::int = v_first and substr(p, 14, 1)::int = v_second;
end;
$$;

-- Runs on insert and whenever the document changes. Once an entry is linked to a platform account
-- (client_id), the provider cannot change its document: the account owns it. The server clears it
-- when the account is deleted (anonymize_user runs as the server, not as the provider).
-- Security invoker on purpose: is_client_context() tells the API roles apart by current_user.
create function private.guard_client_document()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.cpf_cnpj is not distinct from old.cpf_cnpj then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.client_id is not null and private.is_client_context() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if new.cpf_cnpj is not null
     and not ((length(new.cpf_cnpj) = 11 and private.is_valid_cpf(new.cpf_cnpj))
              or (length(new.cpf_cnpj) = 14 and private.is_valid_cnpj(new.cpf_cnpj))) then
    raise exception 'cpf_cnpj_invalid' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger provider_clients_document_guard
  before insert or update on public.provider_clients
  for each row execute function private.guard_client_document();
