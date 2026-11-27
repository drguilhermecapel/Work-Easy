begin;
select no_plan();
select tests.setup_fixture();
update private.ride_network set module_enabled=true,quote_enabled=true,dispatch_enabled=true where environment='simulation';
create temp table refs(k text primary key, id uuid not null);
grant select,insert on refs to authenticated,service_role;
create function pg_temp.ref(k text) returns uuid language sql stable as $$select r.id from refs r where r.k=$1$$;
grant execute on function pg_temp.ref(text) to authenticated,service_role;
insert into public.ride_drivers(id,environment,vehicle,status,valid_until,reviewed_by)
 values(tests.uid('provider_c'),'simulation','sedan','approved',current_date+30,tests.uid('admin'));
with q as (
 insert into private.ride_quotes(environment,actor_id,request_key,passenger_id,request_legs,legs,required_users,tariff_id,expires_at,status,total_cents)
 select 'simulation',tests.uid('client_a'),gen_random_uuid(),tests.uid('client_a'),'[]','[]',array[tests.uid('client_a')],id,now()+interval '10 min','requested',3309
 from private.ride_tariffs where environment='simulation' limit 1 returning id,tariff_id
), r as (
 insert into public.rides(quote_id,environment,passenger_id) select id,'simulation',tests.uid('client_a') from q returning id,quote_id
), l as (
 insert into public.ride_legs(ride_id,seq,origin,destination,pickup_at,duration_minutes,slot,fare_cents,fee_cents,extras_cents,driver_cents,
 payer_id,driver_id,tariff_id,status,environment)
 select r.id,i,'Saúde','Jabaquara',now()+make_interval(hours=>i),18,tstzrange(now()+make_interval(hours=>i),now()+make_interval(hours=>i,mins=>18)),
 3309,300,300,3009,tests.uid('client_a'),tests.uid('provider_c'),q.tariff_id,'accepted','simulation'
 from q join r on q.id=r.quote_id cross join generate_series(1,3) i returning id,seq
) insert into refs select 'leg'||seq,id from l;
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_open_payment_order(pg_temp.ref('leg1'),'cash')$$,'P0001','ride_feature_disabled','No method opens before approval');
select tests.clear_authentication();
insert into private.ride_method_releases(environment,origin,destination,method,evidence_ref,validity,card_brands,acquirer_profile_ref)
 select 'simulation','Saúde','Jabaquara',m,'synthetic test',tstzrange(now()-interval '1 day',now()+interval '1 day'),case when m='card' then array['VISA'] else '{}'::text[] end,case when m='card' then 'hosted account TEST' end from unnest(array['card','pix','cash','benefit','tips','withdrawal'])m;
select tests.authenticate_as('client_a');
insert into refs values('cash',public.ride_open_payment_order(pg_temp.ref('leg1'),'cash')),('card',public.ride_open_payment_order(pg_temp.ref('leg2'),'card')),('issuer',public.ride_open_payment_order(pg_temp.ref('leg3'),'card'));
select is(public.ride_open_payment_order(pg_temp.ref('leg1'),'cash'),pg_temp.ref('cash'),'Retry preserves order');
select throws_ok($$select public.ride_open_payment_order(pg_temp.ref('leg1'),'card')$$,'P0001','ride_operation_conflict','Cannot switch an accepted method silently');
select tests.authenticate_as('client_b');
insert into refs values('code',public.ride_make_share_code());
select is(public.ride_order_receipt(pg_temp.ref('card')),null::jsonb,'Unrelated user cannot obtain the payer receipt');
select tests.authenticate_as('client_a');
insert into refs values('invite',public.ride_invite_fare_code(pg_temp.ref('card'),pg_temp.ref('code'),1000,gen_random_uuid()));
select tests.authenticate_as('provider_a');
select throws_ok($$select public.ride_answer_fare_share(pg_temp.ref('invite'),true)$$,'P0001','not_allowed','Only the named recipient may accept');
select tests.authenticate_as('client_b');
select is(public.ride_answer_fare_share(pg_temp.ref('invite'),true),'accepted','Recipient accepts their exact share');
select is(public.ride_answer_fare_share(pg_temp.ref('invite'),true),'accepted','Invite replay cannot allocate twice');
select is(jsonb_array_length(public.ride_order_desk(null)->'orders'),1,'Recipient sees only their installment');
select tests.clear_authentication();
insert into refs select 'guest',id from private.ride_payment_orders where leg_id=pg_temp.ref('leg2') and payer=tests.uid('client_b');
select results_eq($$select sum(amount_cents),sum(commission_cents),sum(extras_cents) from private.ride_payment_orders where leg_id=pg_temp.ref('leg2')$$,
  $$select 3309::bigint,300::bigint,300::bigint$$,'Fare shares preserve the leg D14 split and pass-through cents');
update public.ride_legs set status='completed' where id in(select id from refs where k like 'leg%');
select is((select settlement_source from private.ride_financial_accounts where leg_id=pg_temp.ref('leg2')),'orders','O16 and order collection are exclusive');
select tests.authenticate_service();
select throws_ok($$select public.claim_ride_sandbox_account(pg_temp.ref('leg2'))$$,'P0001','ride_operation_conflict','Cannot charge the leg again through O16');
select tests.authenticate_as('provider_c');
insert into refs values('bad_note',public.ride_cash_report(pg_temp.ref('cash'),2200,100,gen_random_uuid()));
select tests.authenticate_as('client_a');
select is(public.ride_cash_confirm(pg_temp.ref('bad_note'),false),'contested','Disputed tender is frozen');
select tests.authenticate_as('admin');
select is(public.admin_void_ride_cash_report(pg_temp.ref('bad_note'),'test-statement'),'voided','Operator can document the discrepancy without collecting money');
select tests.authenticate_as('provider_c');
insert into refs values('cash_note',public.ride_cash_report(pg_temp.ref('cash'),2500,500,gen_random_uuid()));
select is((public.ride_order_desk(pg_temp.ref('leg1'))->'orders'->0->>'received')::int,0,'Driver report awaits payer confirmation');
select tests.authenticate_as('client_a');
select is(public.ride_cash_confirm(pg_temp.ref('cash_note'),true),'confirmed','Payer confirms tender and change');
select is(public.ride_cash_confirm(pg_temp.ref('cash_note'),true),'confirmed','Cash confirmation replay');
select is(public.ride_cash_balance_pix(pg_temp.ref('cash')),1309,'Supplemental Pix cannot charge the full fare');
select tests.clear_authentication();
select results_eq($$select cash_cents,receivable_cents,driver_balance_cents from private.ride_financial_balances where leg_id=pg_temp.ref('leg1')$$,
 $$select 0::bigint,1309::bigint,1009::bigint$$,'Cash held by driver causes no PSP cash or second payout');
update private.ride_sandbox_psp set enabled=true;
insert into private.ride_sandbox_customers values(tests.uid('client_a'),'cus_204a'),(tests.uid('client_b'),'cus_204b');
insert into private.ride_order_test_wallets values(tests.uid('provider_c'),md5('test-wallet')::uuid,md5('test-platform')::uuid,'TEST ONLY',now()+interval '1 day');
select tests.authenticate_service();
select throws_ok($$select public.ride_prepare_order_payment(pg_temp.ref('guest'),tests.uid('client_a'),'simulation')$$,'P0001','not_allowed','Payer separation during checkout');
select is((public.ride_prepare_order_payment(pg_temp.ref('guest'),tests.uid('client_b'),'simulation')->>'method'),'CREDIT_CARD','Hosted checkout uses accepted card method');
select is(public.ride_claim_order_send(pg_temp.ref('guest'),'simulation'),true,'First POST lease');
select is(public.ride_claim_order_send(pg_temp.ref('guest'),'simulation'),false,'Timeout/retry keeps the same lease');
select tests.clear_authentication();
create function pg_temp.fact(status text,reversed int,returned int,paid int) returns jsonb language sql as $$
 select jsonb_build_object('status',status,'payment','pay_fixture204','customer','cus_204b','amount',1000,'splitCents',910,'pspFee',20,
   'paidToDriver',paid,'returnedByDriver',returned,'refunded',reversed,'invoice',case when status='pending' then 'https://sandbox.asaas.com/i/test204' end);
$$;
grant execute on function pg_temp.fact(text,int,int,int) to authenticated,service_role;
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_observe_order_payment(pg_temp.ref('guest'),'simulation',pg_temp.fact('paid',0,0,910))$$,'42501',null,'Payer cannot forge money');
select tests.authenticate_service();
select is(public.ride_observe_order_payment(pg_temp.ref('guest'),'simulation',pg_temp.fact('settling',0,0,0)),'settling','Confirmed is not liquidated');
select is(public.ride_observe_order_payment(pg_temp.ref('guest'),'simulation',pg_temp.fact('paid',0,0,910)),'paid','Canonical receipt posts charge and fixed driver split');
select is(public.ride_observe_order_payment(pg_temp.ref('guest'),'simulation',pg_temp.fact('paid',0,0,910)),'paid','Provider replay posts once');
select tests.authenticate_as('client_b');
select is((public.ride_order_desk(null)->'orders'->0->>'received')::int,1000,'Receipt reflects one captured share');
select tests.clear_authentication();
insert into private.ride_withdrawal_terms(driver_id,environment,wallet,bank_ref,evidence_ref,fee_cents,limit_cents,valid_until,pix_key_type,bank_pix_key,settlement_time)
values(tests.uid('provider_c'),'simulation',md5('test-wallet')::uuid,'fictitious bank account','fixture',0,2000,now()+interval '1 day','EVP','example.test','No mesmo dia do ensaio');
select tests.authenticate_as('provider_c');
insert into refs values('withdraw',public.ride_request_withdrawal(md5('w204')::uuid,500,0));
select is(public.ride_request_withdrawal(md5('w204')::uuid,500,0),pg_temp.ref('withdraw'),'Duplicate withdrawal reserves once');
select throws_ok($$select public.ride_request_withdrawal(gen_random_uuid(),411,0)$$,'P0001','ride_financial_state','Held balance cannot be withdrawn twice');
select tests.authenticate_service();
select is(public.ride_claim_withdrawal_send(pg_temp.ref('withdraw'),'simulation'),true,'Issue the wallet transfer once');
select is(public.ride_claim_withdrawal_send(pg_temp.ref('withdraw'),'simulation'),false,'Lost acknowledgment reserves funds and prevents second transfer');
select throws_ok($$select public.ride_record_withdrawal(pg_temp.ref('withdraw'),'simulation','paid','tx-204',md5('other wallet')::uuid,500)$$,
 'P0001','ride_financial_mismatch','Another wallet cannot acknowledge this transfer');
select is(public.ride_record_withdrawal(pg_temp.ref('withdraw'),'simulation','paid','tx-204',md5('test-wallet')::uuid,500),'paid','Verified payout confirms the reserved movement');
select is(public.ride_record_withdrawal(pg_temp.ref('withdraw'),'simulation','paid','tx-204',md5('test-wallet')::uuid,500),'paid','Replayed wallet proof has no second debit');
select tests.authenticate_as('client_b');
insert into refs values('case',public.ride_request_order_review(pg_temp.ref('guest'),1000,'Cobrada por engano',gen_random_uuid()));
select tests.authenticate_as('admin');
select is(public.ride_decide_order_review(pg_temp.ref('case'),true,'Conferido com o teste'),'approved','Decision itself is not a refund');
select tests.authenticate_service();
select is((public.ride_prepare_order_refund(pg_temp.ref('case'),tests.uid('admin'),'simulation',90,'provider evidence')->>'split_return')::int,909,'Refund specifies the accepted fixed split and residual fee');
select is(public.ride_claim_order_refund(pg_temp.ref('case'),'simulation'),true,'Issue one provider refund');
select is(public.ride_claim_order_refund(pg_temp.ref('case'),'simulation'),false,'Lost acknowledgment cannot issue another refund');
select is(public.ride_observe_order_payment(pg_temp.ref('guest'),'simulation',pg_temp.fact('paid',1000,0,910)),'paid','Refund reverses the fee with original residual rounding');
select is(public.ride_observe_order_payment(pg_temp.ref('guest'),'simulation',pg_temp.fact('paid',1000,910,0)),'paid','Returned split requires separate PSP evidence');
select tests.clear_authentication();
select is((select commission_cents from private.ride_financial_balances where leg_id=pg_temp.ref('leg2')),209::bigint,'D14 is floor of remaining original leg base, not sum of rerounded payer percentages');
select is((select count(*) from private.ride_financial_events where leg_id=pg_temp.ref('leg2') and kind='capture'),1::bigint,'One capture after re-delivery');
with c as (
 insert into private.ride_benefit_campaigns(environment,funding_ref,budget_cents,validity) values('simulation','simulated budget',1000,tstzrange(now()-interval '1 hour',now()+interval '1 hour')) returning id
), b as (
 insert into private.ride_benefits(environment,owner_id,funding_ref,source,awarded_cents,available_cents,valid_until,campaign_id)
 select 'simulation',tests.uid('client_a'),'synthetic','promotion',1000,1000,now()+interval '1 hour',id from c returning id
) insert into refs select 'benefit',id from b;
select tests.authenticate_as('client_a');
select is(public.ride_apply_order_benefit(pg_temp.ref('card'),pg_temp.ref('benefit'),700),700,'Original funding line covers part of payer share');
select is(public.ride_apply_order_benefit(pg_temp.ref('card'),pg_temp.ref('benefit'),700),700,'Redeeming again does not debit twice');
insert into refs values('benefitcase',public.ride_request_order_review(pg_temp.ref('card'),700,'Cancelar uso do benefício',gen_random_uuid()));
select tests.authenticate_as('admin');
select is(public.ride_decide_order_review(pg_temp.ref('benefitcase'),true,'Conciliação do benefício'),'approved','Approved benefit refund');
select is(public.ride_refund_order_source(pg_temp.ref('benefitcase'),'benefit',0,'TEST-204'),'settled','Return to original benefit, not customer cash');
select is(public.ride_refund_order_source(pg_temp.ref('benefitcase'),'benefit',0,'TEST-204'),'settled','Replay leaves redeemed balance unchanged');
select tests.clear_authentication();
select is((select available_cents from private.ride_benefits where id=pg_temp.ref('benefit')),1000,'Benefit balance and original campaign budget restored');
select is((select sum(cash_delta::bigint+receivable_delta+processing_expense_delta+benefit_delta-driver_delta-fee_delta) from private.ride_financial_events),0::numeric,'All journal entries balance');
select tests.authenticate_as('client_a');
insert into refs values('tip',public.ride_add_order_component(pg_temp.ref('leg2'),'tip',99,'pix',md5('204 tip')::uuid));
select is(public.ride_add_order_component(pg_temp.ref('leg2'),'tip',99,'pix',md5('204 tip')::uuid),pg_temp.ref('tip'),'A replay cannot duplicate the voluntary tip');
select throws_ok($$select public.ride_add_order_component(pg_temp.ref('leg2'),'tip',100,'pix',md5('204 tip')::uuid)$$,'P0001','ride_operation_conflict','Replaying consent cannot increase the tip by one cent');
select tests.clear_authentication();
select results_eq($$select commission_cents,extras_cents from private.ride_payment_orders where id=pg_temp.ref('tip')$$,$$select 0,99$$,'Full tip belongs to driver outside D14');
select results_eq($$select v.income,v.paid,v.extras from private.ride_financial_events e cross join lateral private.ride_driver_event_amounts(e) v
 where e.leg_id=pg_temp.ref('leg2') and e.kind='tip_earned'$$,$$select 99::bigint,0::bigint,0::bigint$$,'Driver statement treats tip as income, not a reimbursement');
insert into private.ride_demand_rates(environment,origin,destination,validity,multiplier_bps,free_wait_minutes,wait_cents_per_minute,absence_policy,evidence_ref)
 values('simulation','Saúde','Jabaquara',tstzrange(now()-interval '1 hour',now()+interval '4 hours'),15000,5,100,'Revisão de ausência pelo plantão','TEST');
select tests.authenticate_as('provider_b');
insert into refs select 'demand',(public.ride_quote(gen_random_uuid(),null,null,'[{"origin":"Saúde","destination":"Jabaquara","payer":"passenger"}]')->>'id')::uuid;
select is((public.ride_quote_payment_terms(pg_temp.ref('demand'))->0->'rule'->>'multiplier_bps')::int,15000,'Payer can inspect the exact dynamic-price version before acceptance');
select tests.authenticate_as('client_a');
select is(public.ride_quote_payment_terms(pg_temp.ref('demand')),'[]'::jsonb,'Nonpayer does not receive pricing policy or exact quote');
select tests.clear_authentication();
select ok((select (legs->0->>'fee_cents')::int=((legs->0->>'fare_cents')::int-(legs->0->>'extras_cents')::int)/10 from private.ride_quotes where id=pg_temp.ref('demand')),
 'Dynamic fare recalculates commission once at the accepted component');
update private.ride_demand_rates set multiplier_bps=20000;
select is((select (price_rules->'1'->>'multiplier_bps')::int from private.ride_quotes where id=pg_temp.ref('demand')),15000,'Subsequent rule version cannot change signed quote');
select tests.authenticate_service();
select is((public.ride_prepare_order_payment(pg_temp.ref('issuer'),tests.uid('client_a'),'simulation')->>'driver_cents')::int,3009,'Issuer example uses a separate authorized share');
select is(public.ride_observe_order_payment(pg_temp.ref('issuer'),'simulation',
  '{"status":"paid","payment":"pay_issuer","customer":"cus_204a","amount":3309,"splitCents":3009,"pspFee":45,"paidToDriver":3009,"returnedByDriver":0,"refunded":0}'),'paid','Provider records full gross and fixed split');
select tests.authenticate_as('provider_c');
insert into refs values('heldwithdraw',public.ride_request_withdrawal(md5('hold-204')::uuid,100,0));
select tests.authenticate_service();
select is(public.ride_observe_order_payment(pg_temp.ref('issuer'),'simulation',
  '{"payment":"pay_issuer","reason":"card_chargeback","customer":"cus_204a","amount":3309}'),'review','Temporary issuer signal opens a review');
select is(public.ride_claim_withdrawal_send(pg_temp.ref('heldwithdraw'),'simulation'),false,'Hold imposed after reservation blocks transport of funds');
select tests.authenticate_as('client_b');
select is(public.ride_issuer_status(pg_temp.ref('issuer')),null::jsonb,'Another payer cannot see this issuer case');
select tests.authenticate_as('admin');
select is(public.admin_resolve_ride_issuer(pg_temp.ref('issuer'),true,2000,200,'issuer final debit test'),'debited','Only final statement charges back proven principal and extras');
select is(public.admin_resolve_ride_issuer(pg_temp.ref('issuer'),true,2000,200,'issuer final debit test'),'debited','Issuer decision replay does not reverse twice');
select tests.clear_authentication();
select results_eq($$select cash_delta,driver_delta,fee_delta from private.ride_financial_events where leg_id=pg_temp.ref('leg3') and kind='chargeback'$$,
 $$select -2000,-1820,-180$$,'D14 returns only the commission on the debited base');
select tests.authenticate_as('admin');
select is(public.admin_record_issuer_split_return(pg_temp.ref('issuer'),1820,'bank transfer proof',md5('actual issuer return')::uuid),
 md5('actual issuer return')::uuid,'Driver recovery needs independent transfer evidence');
select throws_ok($$select public.admin_record_issuer_split_return(pg_temp.ref('issuer'),1,'extra',gen_random_uuid())$$,'P0001','ride_financial_mismatch','Recovery cannot exceed actual payout or backed loss');
select tests.clear_authentication();
select is((select sum(cash_delta::bigint+receivable_delta+processing_expense_delta+benefit_delta-driver_delta-fee_delta) from private.ride_financial_events),0::numeric,'Reconciled issuer ledger balances');
select * from finish();
rollback;
