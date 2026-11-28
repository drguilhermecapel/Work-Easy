-- O17 · transferência de titularidade de família, empresa e frota (20261128100301, DD118 de 28/11/2026).
-- A titular nomeia outra administradora e transfere a conta; a antiga titular continua administradora.
-- Na exclusão do perfil da titular, a administradora ativa mais antiga recebe a conta; sem outra
-- administradora a conta fecha como antes. Nenhum registro financeiro muda. Dados fictícios, sem rede.
begin;
select no_plan();
select tests.setup_fixture();
select tests.create_user(k) from unnest(array['t_fam_owner','t_fam_admin','t_fam_member','t_org_owner','t_org_admin','t_org_admin2',
 't_fleet_owner','t_fleet_mgr','t_solo_owner','t_solo_member','t_outsider']) k;
update private.ride_network set module_enabled=true,quote_enabled=true,dispatch_enabled=true where environment='simulation';
create temp table t(k text primary key,v text not null);
grant select,insert on t to authenticated,anon;
create function pg_temp.g(p text) returns text language sql stable as $$select t.v from t where t.k=p$$;
create function pg_temp.u(p text) returns uuid language sql stable as $$select t.v::uuid from t where t.k=p$$;
create function pg_temp.n(p text) returns int language sql stable as $$select t.v::int from t where t.k=p$$;
create function pg_temp.trip() returns jsonb language sql immutable as $$select '[{"origin":"Saúde","destination":"Jabaquara","payer":"passenger"}]'::jsonb$$;
create function pg_temp.account(p uuid) returns jsonb language sql as $$select a from jsonb_array_elements(public.ride_my_accounts()) a where a->>'id'=p::text$$;
-- Tudo o que é financeiro da conta, numa impressão digital: trechos, financiamento, ordens e faturas.
create function pg_temp.money(p uuid) returns text language sql stable security definer as $$
 select md5(coalesce((select string_agg(f::text,'|' order by f.leg_id) from private.ride_leg_funding f where f.account_id=p),'')
  ||coalesce((select string_agg(l.id::text||l.payer_id::text||l.fare_cents::text||l.status,'|' order by l.id) from public.ride_legs l
     join private.ride_leg_funding f on f.leg_id=l.id where f.account_id=p),'')
  ||coalesce((select string_agg(o::text,'|' order by o.id) from private.ride_payment_orders o join private.ride_leg_funding f on f.leg_id=o.leg_id where f.account_id=p),'')
  ||coalesce((select string_agg(i::text,'|' order by i.id) from private.ride_invoices i where i.account_id=p),''))
$$;
grant execute on function pg_temp.g(text),pg_temp.u(text),pg_temp.n(text),pg_temp.trip(),pg_temp.account(uuid),pg_temp.money(uuid) to authenticated,anon;
insert into t select k,tests.uid(k)::text from unnest(array['t_fam_owner','t_fam_admin','t_fam_member','t_org_owner','t_org_admin','t_org_admin2',
 't_fleet_owner','t_fleet_mgr','t_solo_owner','t_solo_member','t_outsider']) k;
insert into t select 'k'||i,gen_random_uuid()::text from generate_series(1,9) i;
insert into public.ride_drivers(id,environment,vehicle,status,valid_until,reviewed_by,online)
 values(tests.uid('provider_c'),'simulation','sedan','approved',private.sp_date(now())+30,tests.uid('admin'),true);
insert into private.ride_method_releases(environment,origin,destination,method,evidence_ref,validity,card_brands,acquirer_profile_ref)
 select 'simulation','Saúde','Jabaquara',m,'ensaio 207c',tstzrange(now()-interval '1 day',now()+interval '1 day'),
  case when m='card' then array['VISA'] else '{}'::text[] end,case when m='card' then 'conta hospedada TESTE' end from unnest(array['card','pix','benefit']) m;

select tests.authenticate_as('t_outsider');
insert into t select 'q_x',public.ride_quote(gen_random_uuid(),null,null,pg_temp.trip())->>'id';
select tests.clear_authentication();
insert into t select 'x',total_cents::text from private.ride_quotes where id=pg_temp.u('q_x');
select ok(pg_temp.n('x')>0,'o ensaio tem tarifa para o trecho de referência');

-- ─── Família: nomear administradora e transferir ───────────────────────────────────────────
select tests.authenticate_as('t_fam_owner');
insert into t select 'fam',public.ride_create_family('Família 207c',pg_temp.n('x')*10,'pix',pg_temp.u('k1'))::text;
insert into t select 'tok_a',public.ride_invite_member(pg_temp.u('fam'),'t_fam_admin@test.local','member',60,gen_random_uuid())->>'token';
insert into t select 'tok_m',public.ride_invite_member(pg_temp.u('fam'),'t_fam_member@test.local','member',60,gen_random_uuid())->>'token';
select tests.authenticate_as('t_fam_admin');
select is(public.ride_join_account(pg_temp.g('tok_a'),true),'accepted','a futura administradora entra na família');
select tests.authenticate_as('t_fam_member');
select is(public.ride_join_account(pg_temp.g('tok_m'),true),'accepted','a participante entra na família');
insert into t select 'm_old',pg_temp.account(pg_temp.u('fam'))->>'mandate_id';
insert into t select 'q_paid',public.ride_quote_sponsored(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('m_old'))->>'id';
insert into t select 'r_paid',public.ride_consent(pg_temp.u('q_paid'),true)->>'ride_id';
insert into t select 'q_wait',public.ride_quote_sponsored(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('m_old'))->>'id';
select tests.clear_authentication();
insert into t select 'leg',id::text from public.ride_legs where ride_id=pg_temp.u('r_paid');
select is((select payer_id from public.ride_legs where id=pg_temp.u('leg')),pg_temp.u('t_fam_owner'),'o trecho da participante é pago pela titular');
update private.ride_account_members set joined_at=joined_at-interval '2 days' where account_id=pg_temp.u('fam') and member_id=pg_temp.u('t_fam_owner');
insert into t select 'money_fam',pg_temp.money(pg_temp.u('fam'));
insert into t select 'name_fam_admin',full_name from public.profiles where id=pg_temp.u('t_fam_admin');

-- Permissões de nomear administradora.
select tests.authenticate_as('t_fam_member');
select throws_ok($$select public.ride_set_account_admin(pg_temp.u('fam'),pg_temp.u('t_fam_admin'),true)$$,'P0001','ride_account_role_required','participante não nomeia administradora');
select throws_ok($$select public.ride_transfer_account(pg_temp.u('fam'),pg_temp.u('t_fam_member'),gen_random_uuid())$$,'P0001','ride_account_role_required','participante não transfere a conta');
select tests.authenticate_as('t_outsider');
select throws_ok($$select public.ride_set_account_admin(pg_temp.u('fam'),pg_temp.u('t_outsider'),true)$$,'P0001','ride_account_role_required','quem é de fora não nomeia ninguém');
select throws_ok($$select public.ride_transfer_account(pg_temp.u('fam'),pg_temp.u('t_outsider'),gen_random_uuid())$$,'P0001','ride_account_role_required','quem é de fora não transfere');
select tests.authenticate_as('t_fam_owner');
select throws_ok($$select public.ride_transfer_account(pg_temp.u('fam'),pg_temp.u('t_fam_admin'),gen_random_uuid())$$,'P0001','ride_transfer_target_invalid',
 'a conta só vai para uma administradora ativa');
select is(pg_temp.account(pg_temp.u('fam'))->'owner_candidates','[]'::jsonb,'sem outra administradora, ninguém pode receber a conta');
select is(pg_temp.account(pg_temp.u('fam'))->>'successor_id',null,'sem outra administradora, a exclusão fecharia a conta');
select throws_ok($$select public.ride_set_account_admin(pg_temp.u('fam'),pg_temp.u('t_fam_owner'),false)$$,'P0001','invalid_input','a titular não deixa de ser administradora');
select throws_ok($$select public.ride_set_account_admin(pg_temp.u('fam'),pg_temp.u('t_outsider'),true)$$,'P0001','invalid_input','só quem participa vira administradora');
select ok(public.ride_set_account_admin(pg_temp.u('fam'),pg_temp.u('t_fam_admin'),true),'a titular nomeia outra administradora');
select ok(public.ride_set_account_admin(pg_temp.u('fam'),pg_temp.u('t_fam_admin'),true),'nomear de novo não muda nada');
select tests.clear_authentication();
select is((select role from private.ride_account_members where account_id=pg_temp.u('fam') and member_id=pg_temp.u('t_fam_admin')),'admin','o papel passa a ser de administradora');
select tests.authenticate_as('t_fam_owner');
select is((select jsonb_agg(c->>'member_id') from jsonb_array_elements(pg_temp.account(pg_temp.u('fam'))->'owner_candidates') c),
 jsonb_build_array(pg_temp.g('t_fam_admin')),'a lista de quem pode receber a conta traz só a administradora');
select is(pg_temp.account(pg_temp.u('fam'))->>'successor_id',pg_temp.g('t_fam_admin'),'a exclusão passaria a conta para ela');
select is(public.ride_erasure_account_plan(),jsonb_build_array(jsonb_build_object('id',pg_temp.g('fam'),'kind','family','name','Família 207c',
 'outcome','transfer','successor_id',pg_temp.g('t_fam_admin'),'successor_name',pg_temp.g('name_fam_admin'))),
 'o plano da exclusão diz para quem a família vai');
select tests.clear_authentication();
select ok(exists(select from public.audit_log where action='ride.account_admin' and entity_id=pg_temp.g('fam')),'a nomeação fica na auditoria');
select tests.authenticate_as('t_fam_admin');
select tests.authenticate_as('t_fam_admin');
select throws_ok($$select public.ride_transfer_account(pg_temp.u('fam'),pg_temp.u('t_fam_admin'),gen_random_uuid())$$,'P0001','ride_account_owner_required',
 'administradora que não é titular não transfere');
select throws_ok($$select public.ride_set_account_admin(pg_temp.u('fam'),pg_temp.u('t_fam_member'),true)$$,'P0001','ride_account_owner_required',
 'administradora que não é titular não nomeia outra');
select is(pg_temp.account(pg_temp.u('fam'))->'owner_candidates','[]'::jsonb,'quem não é titular não recebe a lista');
-- DD116: a administradora que não é titular não cadastra dependente nem vira responsável.
select throws_ok($$select public.ride_register_dependent(pg_temp.u('fam'),'Lia','13-15','parental_authority',gen_random_uuid())$$,'P0001','ride_account_owner_required',
 'administradora que não é titular não cadastra dependente');
select tests.clear_authentication();
select is((select count(*)::int from private.ride_dependents where account_id=pg_temp.u('fam')),0,'nenhum dependente ficou com a administradora como responsável');
select tests.authenticate_as('t_fam_owner');
select throws_ok($$select public.ride_transfer_account(pg_temp.u('fam'),pg_temp.u('t_fam_owner'),gen_random_uuid())$$,'P0001','ride_transfer_target_invalid','a titular não transfere para si');
select throws_ok($$select public.ride_transfer_account(pg_temp.u('fam'),pg_temp.u('t_fam_admin'),null)$$,'P0001','invalid_input','transferência sem chave é recusada');
select tests.authenticate_anon();
select throws_ok($$select public.ride_transfer_account(pg_temp.u('fam'),pg_temp.u('t_fam_admin'),gen_random_uuid())$$,'42501',null,'visitante não chama a transferência');
select throws_ok($$select public.ride_set_account_admin(pg_temp.u('fam'),pg_temp.u('t_fam_admin'),true)$$,'42501',null,'visitante não nomeia administradora');
select throws_ok($$select public.ride_erasure_account_plan()$$,'42501',null,'visitante não lê o plano da exclusão');

-- A responsabilidade por dependente não muda de mãos: com dependente aberto, a família não é transferida.
select tests.authenticate_as('t_fam_owner');
insert into t select 'dep_own',public.ride_register_dependent(pg_temp.u('fam'),'Téo','16-17','parental_authority',gen_random_uuid())::text;
select throws_ok($$select public.ride_transfer_account(pg_temp.u('fam'),pg_temp.u('t_fam_admin'),gen_random_uuid())$$,'P0001','ride_transfer_dependents_open',
 'a titular que responde por dependente do grupo não transfere a família');
select ok(public.ride_withdraw_dependent(pg_temp.u('dep_own')),'a titular retira o dependente');

-- A transferência e as repetições.
insert into t select 'tr',public.ride_transfer_account(pg_temp.u('fam'),pg_temp.u('t_fam_admin'),pg_temp.u('k2'))::text;
select is((pg_temp.g('tr')::jsonb)->>'owner_id',pg_temp.g('t_fam_admin'),'a família passa para a administradora');
select is(public.ride_transfer_account(pg_temp.u('fam'),pg_temp.u('t_fam_admin'),pg_temp.u('k2')),pg_temp.g('tr')::jsonb,'repetir a mesma chave devolve a mesma transferência');
select throws_ok($$select public.ride_transfer_account(pg_temp.u('fam'),pg_temp.u('t_fam_member'),pg_temp.u('k2'))$$,'P0001','idempotency_conflict','mesma chave para outra pessoa é conflito');
select throws_ok($$select public.ride_transfer_account(pg_temp.u('fam'),pg_temp.u('t_fam_admin'),gen_random_uuid())$$,'P0001','ride_account_owner_required',
 'quem deixou de ser titular não transfere de novo');
select is(public.ride_create_family('Família 207c',pg_temp.n('x')*10,'pix',pg_temp.u('k1')),pg_temp.u('fam'),'repetir a criação depois da transferência devolve a mesma família');
select throws_ok($$select public.ride_create_family('Outra família',pg_temp.n('x')*10,'pix',pg_temp.u('k1'))$$,'P0001','idempotency_conflict',
 'mesma chave de criação com outro nome continua conflito');
select is(pg_temp.account(pg_temp.u('fam'))->>'owner','false','a antiga titular deixa de ser titular');
select is(pg_temp.account(pg_temp.u('fam'))->>'role','admin','e continua administradora');
select tests.clear_authentication();
select is((select owner_id from private.ride_accounts where id=pg_temp.u('fam')),pg_temp.u('t_fam_admin'),'a titular registrada é a nova');
select is((select count(*)::int from private.ride_accounts where request_key=pg_temp.u('k1')),1,'nenhuma família nova foi aberta pela repetição');
select is((select status||'/'||role from private.ride_account_members where account_id=pg_temp.u('fam') and member_id=pg_temp.u('t_fam_owner')),'active/admin',
 'a antiga titular fica como administradora ativa');
select is((select monthly_limit_cents||'/'||default_method||'/'||status from private.ride_accounts where id=pg_temp.u('fam')),pg_temp.n('x')*10||'/pix/active',
 'a família mantém limite, forma de pagamento e situação');
select is((select status from private.ride_payer_mandates where id=pg_temp.u('m_old')),'revoked','o mandato pago pela antiga titular é revogado');
select is((select payer_id from private.ride_payer_mandates where account_id=pg_temp.u('fam') and rider_id=pg_temp.u('t_fam_member') and status='active'),
 pg_temp.u('t_fam_admin'),'a participante ganha um mandato pago pela nova titular');
select is((select payer_id from private.ride_payer_mandates where account_id=pg_temp.u('fam') and rider_id=pg_temp.u('t_fam_owner') and status='active'),
 pg_temp.u('t_fam_admin'),'a antiga titular, agora administradora, viaja pelo grupo com mandato pago pela nova titular');
select is((select count(*)::int from private.ride_payer_mandates where account_id=pg_temp.u('fam') and status='active'),2,
 'só a participante e a antiga titular têm mandato ativo');
select is((select status from private.ride_quotes where id=pg_temp.u('q_wait')),'superseded','a cotação que dependia do mandato antigo perde a validade');
select is((select payer_id from public.ride_legs where id=pg_temp.u('leg')),pg_temp.u('t_fam_owner'),'o trecho já pedido continua pago pela antiga titular');
select is(pg_temp.money(pg_temp.u('fam')),pg_temp.g('money_fam'),'nenhum registro financeiro da família muda');
select is((select reason||'/'||from_owner||'/'||to_owner from private.ride_account_transfers where account_id=pg_temp.u('fam')),
 'owner/'||pg_temp.g('t_fam_owner')||'/'||pg_temp.g('t_fam_admin'),'a transferência fica registrada');
select ok(exists(select from public.audit_log where action='ride.account_transfer' and entity_id=pg_temp.g('fam') and actor_id=pg_temp.u('t_fam_owner')
 and data->>'reason'='owner' and data->>'to'=pg_temp.g('t_fam_admin')),'a transferência fica na auditoria');
-- Dependente que ficou com quem deixou de ser titular não viaja pela família (DD116).
insert into private.ride_dependents(environment,account_id,guardian_id,label,age_band,legal_basis_ref,evidence_ref,verified_by,valid_until,status,
  request_key,request_hash,reviewed_at)
 values('simulation',pg_temp.u('fam'),pg_temp.u('t_fam_owner'),'Nina','13-15','parental_authority','EVID-207C',tests.uid('admin'),private.sp_date(now())+30,'verified',
  gen_random_uuid(),'\x00'::bytea,now());
insert into t select 'dep_old',id::text from private.ride_dependents where account_id=pg_temp.u('fam') and label='Nina';
select tests.authenticate_as('t_fam_owner');
insert into t select 'q_dep',public.ride_quote_for_dependent(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('dep_old'),true)->>'id';
select throws_ok($$select public.ride_consent(pg_temp.u('q_dep'),true)$$,'P0001','ride_minor_unavailable',
 'a antiga titular não leva o dependente pela família que deixou de ser dela');
select tests.clear_authentication();
delete from private.ride_dependents where id=pg_temp.u('dep_old');
insert into t select 'm_new',id::text from private.ride_payer_mandates where account_id=pg_temp.u('fam') and rider_id=pg_temp.u('t_fam_member') and status='active';
select tests.authenticate_as('t_fam_admin');
select is(pg_temp.account(pg_temp.u('fam'))->>'owner','true','a nova titular vê a família como sua');
select is(pg_temp.account(pg_temp.u('fam'))#>>'{transferred,reason}','owner','e o aviso de que a família passou para ela');
select is((select jsonb_agg(c->>'member_id') from jsonb_array_elements(pg_temp.account(pg_temp.u('fam'))->'owner_candidates') c),
 jsonb_build_array(pg_temp.g('t_fam_owner')),'a antiga titular pode receber a família de volta');
select tests.authenticate_as('t_fam_member');
select is(pg_temp.account(pg_temp.u('fam'))->>'mandate_id',pg_temp.g('m_new'),
 'a participante vê o novo mandato');
select tests.clear_authentication();

-- Exclusão da nova titular: a família volta para a administradora mais antiga, a antiga titular.
select lives_ok($$select public.anonymize_user(pg_temp.u('t_fam_admin'))$$,'a nova titular exclui a conta');
select is((select status||'/'||owner_id from private.ride_accounts where id=pg_temp.u('fam')),'active/'||pg_temp.g('t_fam_owner'),
 'a família continua aberta, com a administradora mais antiga como titular');
select is((select name from private.ride_accounts where id=pg_temp.u('fam')),'Família 207c','a família mantém o nome');
select is((select status from private.ride_account_members where account_id=pg_temp.u('fam') and member_id=pg_temp.u('t_fam_admin')),'removed','a participação de quem saiu é encerrada');
select is((select status from private.ride_account_members where account_id=pg_temp.u('fam') and member_id=pg_temp.u('t_fam_member')),'active','a participante continua no grupo');
select is((select payer_id from private.ride_payer_mandates where account_id=pg_temp.u('fam') and rider_id=pg_temp.u('t_fam_member') and status='active'),
 pg_temp.u('t_fam_owner'),'a participante passa a ter mandato pago pela titular de agora');
select is((select count(*)::int from private.ride_payer_mandates where account_id=pg_temp.u('fam') and rider_id=pg_temp.u('t_fam_owner') and status='active'),0,
 'de volta à titularidade, ela deixa de ter mandato pago por outra pessoa');
select is((select count(*)::int from private.ride_account_transfers where account_id=pg_temp.u('fam') and reason='erasure' and from_owner=pg_temp.u('t_fam_admin')
 and to_owner=pg_temp.u('t_fam_owner')),1,'a passagem por exclusão fica registrada');
select ok(exists(select from public.audit_log where action='ride.account_transfer' and entity_id=pg_temp.g('fam') and data->>'reason'='erasure'),'e na auditoria');
select is(pg_temp.money(pg_temp.u('fam')),pg_temp.g('money_fam'),'a exclusão também não muda registro financeiro');

-- ─── Empresa: a exclusão escolhe a administradora mais antiga e mantém a conferência ──────────
select tests.authenticate_as('t_org_owner');
insert into t select 'org',public.ride_create_organization('Empresa 207c',pg_temp.u('k3'))::text;
select tests.authenticate_as('admin');
select ok(public.admin_verify_ride_account(pg_temp.u('org'),'ficticio-o17-207c contrato',now()+interval '30 days'),'a operação confere a empresa');
select tests.authenticate_as('t_org_owner');
insert into t select 'tok_o1',public.ride_invite_member(pg_temp.u('org'),'t_org_admin@test.local','manager',60,gen_random_uuid())->>'token';
insert into t select 'tok_o2',public.ride_invite_member(pg_temp.u('org'),'t_org_admin2@test.local','approver',60,gen_random_uuid())->>'token';
select tests.authenticate_as('t_org_admin');
select is(public.ride_join_account(pg_temp.g('tok_o1'),true),'accepted','o gestor entra na empresa');
select tests.authenticate_as('t_org_admin2');
select is(public.ride_join_account(pg_temp.g('tok_o2'),true),'accepted','a aprovadora entra na empresa');
select tests.authenticate_as('t_org_owner');
select ok(public.ride_set_account_admin(pg_temp.u('org'),pg_temp.u('t_org_admin'),true),'o gestor vira administrador');
select ok(public.ride_set_account_admin(pg_temp.u('org'),pg_temp.u('t_org_admin2'),true),'a aprovadora vira administradora');
select tests.clear_authentication();
-- A aprovadora entrou antes do gestor.
update private.ride_account_members set joined_at=now()-interval '3 days' where account_id=pg_temp.u('org') and member_id=pg_temp.u('t_org_admin2');
update private.ride_account_members set joined_at=now()-interval '1 day' where account_id=pg_temp.u('org') and member_id=pg_temp.u('t_org_admin');
insert into t select 'org_ver',(select verification_ref||'/'||verified_until::text from private.ride_accounts where id=pg_temp.u('org'));
select tests.authenticate_as('t_org_owner');
select is(pg_temp.account(pg_temp.u('org'))->>'successor_id',pg_temp.g('t_org_admin2'),'com várias administradoras, a mais antiga receberia a empresa');
select is(jsonb_array_length(pg_temp.account(pg_temp.u('org'))->'owner_candidates'),2,'as duas administradoras podem receber a empresa');
select tests.authenticate_as('t_org_admin');
select ok(public.ride_set_account_admin(pg_temp.u('org'),pg_temp.u('t_org_admin'),false),'o administrador que não é titular pode deixar de administrar');
select tests.clear_authentication();
select is((select role from private.ride_account_members where account_id=pg_temp.u('org') and member_id=pg_temp.u('t_org_admin')),'member','e volta a colaborador');
select tests.authenticate_as('t_org_admin');
select throws_ok($$select public.ride_set_account_admin(pg_temp.u('org'),pg_temp.u('t_org_admin'),true)$$,'P0001','ride_account_role_required','e não se nomeia de novo');
select tests.authenticate_as('t_org_owner');
select ok(public.ride_set_account_admin(pg_temp.u('org'),pg_temp.u('t_org_admin'),true),'a titular o nomeia de novo');
-- Só a titular tira alguém da administração, por qualquer caminho.
select tests.authenticate_as('t_org_admin2');
select throws_ok($$select public.ride_set_account_admin(pg_temp.u('org'),pg_temp.u('t_org_admin'),false)$$,'P0001','ride_account_owner_required',
 'administradora que não é titular não tira outra da administração');
select throws_ok($$select public.ride_set_member_role(pg_temp.u('org'),pg_temp.u('t_org_admin'),'member',null)$$,'P0001','ride_account_owner_required',
 'nem trocando o papel dela na empresa');
select throws_ok($$select public.ride_remove_member(pg_temp.u('org'),pg_temp.u('t_org_admin'),gen_random_uuid())$$,'P0001','ride_account_owner_required',
 'nem removendo da empresa');
select tests.clear_authentication();
select is((select role||'/'||status from private.ride_account_members where account_id=pg_temp.u('org') and member_id=pg_temp.u('t_org_admin')),'admin/active',
 'o administrador continua como estava');
select ok(not has_function_privilege('authenticated','private.ride_set_member_role_before_transfer(uuid,uuid,text,text)','execute')
 and not has_function_privilege('authenticated','private.ride_remove_member_before_transfer(uuid,uuid,uuid)','execute')
 and not has_function_privilege('authenticated','private.ride_register_dependent_before_transfer(uuid,text,text,text,uuid)','execute'),
 'as versões anteriores não são chamadas pelo app');
select lives_ok($$select public.anonymize_user(pg_temp.u('t_org_owner'))$$,'a titular da empresa exclui a conta');
select is((select status||'/'||owner_id from private.ride_accounts where id=pg_temp.u('org')),'active/'||pg_temp.g('t_org_admin2'),
 'a empresa continua aberta com a administradora mais antiga como titular');
select is((select verification_ref||'/'||verified_until::text from private.ride_accounts where id=pg_temp.u('org')),pg_temp.g('org_ver'),'a empresa mantém a conferência');
select is((select name from private.ride_accounts where id=pg_temp.u('org')),'Empresa 207c','a empresa mantém o nome');
select is((select role||'/'||status from private.ride_account_members where account_id=pg_temp.u('org') and member_id=pg_temp.u('t_org_admin')),'admin/active',
 'o outro administrador continua como está');
select is((select status from private.ride_account_members where account_id=pg_temp.u('org') and member_id=pg_temp.u('t_org_owner')),'removed','a antiga titular sai da empresa');
select tests.authenticate_as('t_org_admin2');
select is(pg_temp.account(pg_temp.u('org'))#>>'{transferred,reason}','erasure','a nova titular vê que recebeu a empresa pela exclusão');
select is(pg_temp.account(pg_temp.u('org'))->>'verified','true','a empresa continua operando para ela');
select tests.clear_authentication();

-- ─── Frota: transferência manual mantém a conferência ─────────────────────────────────────
select tests.authenticate_as('t_fleet_owner');
insert into t select 'fleet',public.ride_create_fleet('Frota 207c',pg_temp.u('k4'))::text;
select tests.authenticate_as('admin');
select ok(public.admin_verify_ride_account(pg_temp.u('fleet'),'ficticio-o17-207c frota',now()+interval '30 days'),'a operação confere a frota');
select tests.authenticate_as('t_fleet_owner');
insert into t select 'tok_f',public.ride_invite_member(pg_temp.u('fleet'),'t_fleet_mgr@test.local','manager',60,gen_random_uuid())->>'token';
select tests.authenticate_as('t_fleet_mgr');
select is(public.ride_join_account(pg_temp.g('tok_f'),true),'accepted','o gestor entra na frota');
select tests.authenticate_as('t_fleet_owner');
select ok(public.ride_set_account_admin(pg_temp.u('fleet'),pg_temp.u('t_fleet_mgr'),true),'o gestor vira administrador da frota');
select is(public.ride_transfer_account(pg_temp.u('fleet'),pg_temp.u('t_fleet_mgr'),pg_temp.u('k5'))->>'owner_id',pg_temp.g('t_fleet_mgr'),'a frota passa para o gestor');
select tests.clear_authentication();
select is((select owner_id from private.ride_accounts where id=pg_temp.u('fleet')),pg_temp.u('t_fleet_mgr'),'o novo titular da frota está registrado');
select is((select verification_ref from private.ride_accounts where id=pg_temp.u('fleet')),'ficticio-o17-207c frota','a frota mantém a conferência');
select tests.authenticate_as('t_fleet_mgr');
select ok(public.ride_set_account_admin(pg_temp.u('fleet'),pg_temp.u('t_fleet_owner'),false),'o novo titular tira a antiga titular da administração');
select tests.clear_authentication();
select is((select role from private.ride_account_members where account_id=pg_temp.u('fleet') and member_id=pg_temp.u('t_fleet_owner')),'manager','ela volta a gestora da frota');
select tests.authenticate_as('t_fleet_mgr');
select tests.clear_authentication();

-- ─── Sem outra administradora, a exclusão fecha como antes ────────────────────────────────
select tests.authenticate_as('t_solo_owner');
insert into t select 'solo',public.ride_create_family('Família sem outra administradora',pg_temp.n('x')*10,'pix',pg_temp.u('k6'))::text;
insert into t select 'tok_s',public.ride_invite_member(pg_temp.u('solo'),'t_solo_member@test.local','member',60,gen_random_uuid())->>'token';
select tests.authenticate_as('t_solo_member');
select is(public.ride_join_account(pg_temp.g('tok_s'),true),'accepted','a participante entra na família');
select tests.authenticate_as('t_solo_owner');
select is(public.ride_erasure_account_plan()->0->>'outcome','close','o plano da exclusão avisa que a família fecharia');
select tests.clear_authentication();
select lives_ok($$select public.anonymize_user(pg_temp.u('t_solo_owner'))$$,'a titular sem outra administradora exclui a conta');
select ok(not exists(select from private.ride_accounts where id=pg_temp.u('solo') and status='active'),'a família sem outra administradora é fechada ou apagada');
select is((select count(*)::int from private.ride_account_transfers where account_id=pg_temp.u('solo')),0,'nada é transferido');

-- ─── Invariantes ──────────────────────────────────────────────────────────────────────────
select ok(exists(select from pg_trigger where tgrelid='public.profiles'::regclass and tgname='erase_ride_owner_handover')
 and 'erase_ride_owner_handover'<'erase_ride_parties','a passagem por exclusão roda antes do encerramento das participações');
select tests.authenticate_as('t_outsider');
select throws_ok($$select private.ride_handover_on_erasure()$$,'42501',null,'o gatilho de passagem não é chamado direto');
select tests.clear_authentication();
select ok(not has_function_privilege('authenticated','private.ride_handover_account(uuid,uuid,text,uuid,bytea)','execute')
 and not has_function_privilege('authenticated','private.ride_account_successor(uuid,uuid)','execute'),'os auxiliares não são chamados pelo app');
select ok(not exists(select from private.ride_account_transfers where environment='live'),'nenhuma transferência em produção');

select * from finish();
rollback;
