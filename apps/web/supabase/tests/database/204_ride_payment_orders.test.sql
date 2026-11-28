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
insert into refs values('declined',public.ride_invite_fare_code(pg_temp.ref('card'),pg_temp.ref('code'),300,gen_random_uuid()));
select tests.authenticate_as('client_b');
select is(public.ride_answer_fare_share(pg_temp.ref('declined'),false),'declined','Refusal transfers no obligation');
select tests.authenticate_as('client_a');
insert into refs values('expired',public.ride_invite_fare_code(pg_temp.ref('card'),pg_temp.ref('code'),300,gen_random_uuid()));
select tests.clear_authentication();
update private.ride_share_invites set expires_at=now()-interval '1 minute' where id=pg_temp.ref('expired');
select tests.authenticate_as('client_b');
select is(public.ride_answer_fare_share(pg_temp.ref('expired'),true),'expired','An expired invitation cannot allocate a share');
select tests.authenticate_as('client_a');
select is((public.ride_order_desk(pg_temp.ref('leg2'))->'orders'->0->>'total')::int,3309,'The original accepted fare survives refusals and expiry');
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
-- The grade uses the archived quote, even when the tariff has since changed.
update public.ride_legs set source_quote_id=pg_temp.ref('demand'),quote_seq=1 where id=pg_temp.ref('leg2');
insert into private.ride_pickup_arrivals(leg_id,arrived_at) values(pg_temp.ref('leg2'),now()-interval '13 minutes');
insert into private.ride_events(actor_id,operation_key,leg_id,action,from_status,to_status,at)
 values(tests.uid('provider_c'),gen_random_uuid(),pg_temp.ref('leg2'),'board','arriving','boarded',now()-interval '1 minute');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_add_order_component(pg_temp.ref('leg2'),'wait',701,'pix',gen_random_uuid())$$,
 'P0001','ride_financial_mismatch','An unapproved extra cent cannot be charged for waiting');
insert into refs values('wait',public.ride_add_order_component(pg_temp.ref('leg2'),'wait',700,'pix',gen_random_uuid()));
select tests.clear_authentication();
select results_eq($$select amount_cents,commission_cents from private.ride_payment_orders where id=pg_temp.ref('wait')$$,
 $$select 700,70$$,'Twelve measured minutes less five included minutes generates one accepted R$7 service component');
update private.ride_method_releases set acquirer_profile_ref=null where method='card';
select is((select private.ride_method(l,'card') from public.ride_legs l where l.id=pg_temp.ref('leg2')),null::uuid,'A missing hosted acquiring profile prevents a new card emission');
-- Refund exclusivity: one approved case leaves through exactly one path (provider, benefit or issuer).
update private.ride_method_releases set acquirer_profile_ref='hosted account TEST' where method='card';
create function pg_temp.more_legs(first int) returns void language sql as $$
 with q as (
  insert into private.ride_quotes(environment,actor_id,request_key,passenger_id,request_legs,legs,required_users,tariff_id,expires_at,status,total_cents)
  select 'simulation',tests.uid('client_a'),gen_random_uuid(),tests.uid('client_a'),'[]','[]',array[tests.uid('client_a')],id,now()+interval '10 min','requested',3309
  from private.ride_tariffs where environment='simulation' limit 1 returning id,tariff_id
 ), r as (
  insert into public.rides(quote_id,environment,passenger_id) select id,'simulation',tests.uid('client_a') from q returning id,quote_id
 ), l as (
  insert into public.ride_legs(ride_id,seq,origin,destination,pickup_at,duration_minutes,slot,fare_cents,fee_cents,extras_cents,driver_cents,
  payer_id,driver_id,tariff_id,status,environment)
  select r.id,i,'Saúde','Jabaquara',now()+make_interval(hours=>i+first-1),18,tstzrange(now()+make_interval(hours=>i+first-1),now()+make_interval(hours=>i+first-1,mins=>18)),
  3309,300,300,3009,tests.uid('client_a'),tests.uid('provider_c'),q.tariff_id,'accepted','simulation'
  from q join r on q.id=r.quote_id cross join generate_series(1,3) i returning id,seq
 ) insert into refs select 'leg'||seq+first-1,id from l;
$$;
select pg_temp.more_legs(4);
select pg_temp.more_legs(7);
create function pg_temp.paid(payment text,amount int,split int,fee int,reversed int) returns jsonb language sql as $$
 select jsonb_build_object('status','paid','payment',payment,'customer','cus_204a','amount',amount,'splitCents',split,'pspFee',fee,
   'paidToDriver',split,'returnedByDriver',0,'refunded',reversed);
$$;
create function pg_temp.chargeback(payment text) returns jsonb language sql as $$
 select jsonb_build_object('payment',payment,'reason','card_chargeback','customer','cus_204a','amount',3309);
$$;
create function pg_temp.refund_events(leg text) returns bigint language sql stable as $$
 select count(*) from private.ride_financial_events where leg_id=pg_temp.ref(leg) and kind='refund';
$$;
-- Books of one order: refund events, refunded to the payer, counter shared with the issuer, case status.
create function pg_temp.books(leg text,ord text,c text) returns table(refunds bigint,refunded int,reversed int,settled text) language sql stable as $$
 select pg_temp.refund_events(leg),o.refunded_cents,s.reversed_cents,(select status from private.ride_order_cases where id=pg_temp.ref(c))
 from private.ride_payment_orders o join private.ride_order_psp s on s.order_id=o.id where o.id=pg_temp.ref(ord);
$$;
grant execute on function pg_temp.paid(text,int,int,int,int),pg_temp.chargeback(text) to authenticated,service_role;
select tests.authenticate_as('client_a');
insert into refs values('mix',public.ride_open_payment_order(pg_temp.ref('leg4'),'pix')),('sent',public.ride_open_payment_order(pg_temp.ref('leg5'),'card')),
 ('unsent',public.ride_open_payment_order(pg_temp.ref('leg6'),'card')),('late',public.ride_open_payment_order(pg_temp.ref('leg7'),'card')),
 ('direct',public.ride_open_payment_order(pg_temp.ref('leg8'),'card')),('retry',public.ride_open_payment_order(pg_temp.ref('leg9'),'card'));
select tests.clear_authentication();
update public.ride_legs set status='completed' where id in(select id from refs where k in('leg4','leg5','leg6','leg7','leg8','leg9'));
select tests.authenticate_as('client_a');
select is(public.ride_apply_order_benefit(pg_temp.ref('mix'),pg_temp.ref('benefit'),700),700,'Mixed order: the benefit funds part of the fare');
select tests.authenticate_service();
select is((public.ride_prepare_order_payment(pg_temp.ref('mix'),tests.uid('client_a'),'simulation')->>'amount_cents')::int,2609,'Mixed order: Pix collects only the balance');
select is(public.ride_observe_order_payment(pg_temp.ref('mix'),'simulation',pg_temp.paid('pay_mix',2609,2372,20,0)),'paid','Mixed order: Pix balance is captured');
select tests.authenticate_as('client_a');
insert into refs values('same',public.ride_request_order_review(pg_temp.ref('mix'),500,'Cobrada a mais',gen_random_uuid()));
select tests.authenticate_as('admin');
select is(public.ride_decide_order_review(pg_temp.ref('same'),true,'Conferido'),'approved','Request of R$5 approved before any refund');
select tests.authenticate_service();
select is(public.ride_observe_order_payment(pg_temp.ref('mix'),'simulation',pg_temp.paid('pay_mix',2609,2372,20,500)),'review','A provider refund nobody reserved and sent parks the order');
select tests.clear_authentication();
select results_eq($$select refunds,refunded,reversed from pg_temp.books('leg4','mix','same')$$,$$select 0::bigint,0,0$$,'An unrequested provider refund posts nothing');
select is((select string_agg(reason,',') from private.ride_order_provider_reviews where order_id=pg_temp.ref('mix')),'unrequested_refund','The review names the unrequested refund');
select tests.authenticate_as('client_a');
select throws_ok($$select public.admin_accept_provider_refund(pg_temp.ref('mix'),500,0,'PSP statement 1')$$,'P0001',null,'A payer cannot accept a provider refund');
select throws_ok($$select public.admin_void_order_refund(gen_random_uuid(),'x')$$,'P0001',null,'A payer cannot void a refund attempt');
select tests.authenticate_as('admin');
select throws_ok($$select public.ride_refund_order_source(pg_temp.ref('same'),'benefit',0,'TEST-MIX-S')$$,'P0001','ride_operation_conflict','A parked provider refund blocks the benefit path of the same order');
select tests.clear_authentication();
select is((select available_cents from private.ride_benefits where id=pg_temp.ref('benefit')),300,'The benefit is not restored on top of the parked provider refund');
select tests.authenticate_as('admin');
select throws_ok($$select public.admin_accept_provider_refund(pg_temp.ref('mix'),400,0,'PSP statement 1')$$,'P0001','ride_financial_state','Only the observed cumulative refund can be accepted');
select is(public.admin_accept_provider_refund(pg_temp.ref('mix'),500,0,'PSP statement 1'),pg_temp.ref('same'),'The refund is bound to the approved request of the same amount, not to a second case');
select is(public.admin_accept_provider_refund(pg_temp.ref('mix'),500,0,'PSP statement 1'),pg_temp.ref('same'),'Accepting again keeps the same case');
select throws_ok($$select public.admin_accept_provider_refund(pg_temp.ref('mix'),500,1,'PSP statement 1')$$,'P0001','ride_operation_conflict','Accepted terms cannot change on replay');
select tests.authenticate_service();
select is(public.ride_prepare_order_refund(pg_temp.ref('same'),tests.uid('admin'),'simulation',0,'PSP statement 1')->>'create','false','The accepted terms re-query the charge and never send a refund');
select is(public.ride_claim_order_refund(pg_temp.ref('same'),'simulation'),false,'An accepted provider refund is never sent again');
select is(public.ride_observe_order_payment(pg_temp.ref('mix'),'simulation',pg_temp.paid('pay_mix',2609,2372,20,500)),'paid','The same observation books the accepted refund');
select is(public.ride_observe_order_payment(pg_temp.ref('mix'),'simulation',pg_temp.paid('pay_mix',2609,2372,20,500)),'paid','Replaying it books nothing more');
select tests.clear_authentication();
select results_eq($$select refunds,refunded,settled,(select count(*) from private.ride_order_cases where order_id=pg_temp.ref('mix')) from pg_temp.books('leg4','mix','same')$$,
 $$select 1::bigint,500,'settled',1::bigint$$,'Exactly one refund event settles the accepted case by id');
select tests.authenticate_as('client_a');
insert into refs values('benefitonly',public.ride_request_order_review(pg_temp.ref('mix'),100,'Devolver parte do benefício',gen_random_uuid()));
select tests.authenticate_as('admin');
select is(public.ride_decide_order_review(pg_temp.ref('benefitonly'),true,'Conferido'),'approved','Benefit-only case approved');
select is(public.ride_refund_order_source(pg_temp.ref('benefitonly'),'benefit',0,'TEST-MIX-B'),'settled','Benefit-only case settles at its source');
select tests.authenticate_service();
select throws_ok($$select public.ride_prepare_order_refund(pg_temp.ref('benefitonly'),tests.uid('admin'),'simulation',0,'provider evidence')$$,
 'P0001','ride_financial_state','A benefit-settled case cannot reserve a provider refund');
select tests.authenticate_as('client_a');
insert into refs values('both',public.ride_request_order_review(pg_temp.ref('mix'),600,'Corrida cobrada a mais',gen_random_uuid()));
select tests.authenticate_as('admin');
select is(public.ride_decide_order_review(pg_temp.ref('both'),true,'Conferido'),'approved','Case that either source could refund is approved');
select tests.authenticate_service();
select is((public.ride_prepare_order_refund(pg_temp.ref('both'),tests.uid('admin'),'simulation',0,'provider evidence')->>'target')::int,1100,'Provider refund reserved on top of the booked one');
select tests.authenticate_as('admin');
select throws_ok($$select public.ride_refund_order_source(pg_temp.ref('both'),'benefit',0,'TEST-MIX-A')$$,'P0001','ride_operation_conflict','A reserved provider refund blocks the benefit path');
select tests.clear_authentication();
select is((select available_cents from private.ride_benefits where id=pg_temp.ref('benefit')),400,'Blocked benefit path leaves the balance unchanged');
select tests.authenticate_as('admin');
select is(public.admin_void_order_refund(pg_temp.ref('both'),'provider refused the refund'),'voided','Operator voids the provider attempt');
select is(public.admin_void_order_refund(pg_temp.ref('both'),'provider refused the refund'),'voided','Void replay is idempotent');
select throws_ok($$select public.admin_void_order_refund(pg_temp.ref('both'),'another reason')$$,'P0001','ride_operation_conflict','A void cannot be rewritten');
select tests.authenticate_service();
select is(public.ride_claim_order_refund(pg_temp.ref('both'),'simulation'),false,'A voided attempt can no longer be sent');
select is(public.ride_prepare_order_refund(pg_temp.ref('both'),tests.uid('admin'),'simulation',0,'second evidence')->>'create','true','A voided attempt that never left can be reserved again');
select tests.authenticate_as('admin');
select throws_ok($$select public.ride_refund_order_source(pg_temp.ref('both'),'benefit',0,'TEST-MIX-A')$$,'P0001','ride_operation_conflict','The attempt reserved again owns the case again');
select is(public.admin_void_order_refund(pg_temp.ref('both'),'provider refused it again'),'voided','The second attempt is voided too');
select is(public.ride_refund_order_source(pg_temp.ref('both'),'benefit',0,'TEST-MIX-A'),'settled','After the void the benefit path settles the case');
select is(public.ride_refund_order_source(pg_temp.ref('both'),'benefit',0,'TEST-MIX-A'),'settled','Benefit settlement replay');
select tests.authenticate_service();
select throws_ok($$select public.ride_prepare_order_refund(pg_temp.ref('both'),tests.uid('admin'),'simulation',0,'third evidence')$$,
 'P0001','ride_financial_state','A case settled by benefit cannot reserve a provider refund after its void');
select tests.clear_authentication();
select results_eq($$select b.available_cents,u.restored_cents,(select count(*) from private.ride_order_events where operation_id=pg_temp.ref('both') and action='benefit_refund')
  from private.ride_benefits b join private.ride_benefit_uses u on u.benefit_id=b.id and u.order_id=pg_temp.ref('mix') where b.id=pg_temp.ref('benefit')$$,
 $$select 1000,700,1::bigint$$,'Benefit balance is restored exactly once');
select tests.authenticate_service();
select is(public.ride_observe_order_payment(pg_temp.ref('mix'),'simulation',pg_temp.paid('pay_mix',2609,2372,20,1100)),'review','A late provider refund for the voided target is parked');
select tests.clear_authentication();
select results_eq($$select refunds,refunded,reversed from pg_temp.books('leg4','mix','both')$$,$$select 1::bigint,1200,500$$,'The late refund posts nothing over the benefit settlement');
-- Issuer debit against a sent and against an unsent refund.
select tests.authenticate_service();
select is((public.ride_prepare_order_payment(pg_temp.ref('sent'),tests.uid('client_a'),'simulation')->>'driver_cents')::int,3009,'Card order with a sent refund');
select is((public.ride_prepare_order_payment(pg_temp.ref('unsent'),tests.uid('client_a'),'simulation')->>'driver_cents')::int,3009,'Card order with an unsent refund');
select is(public.ride_observe_order_payment(pg_temp.ref('sent'),'simulation',pg_temp.paid('pay_sent',3309,3009,45,0)),'paid','First card order captured');
select is(public.ride_observe_order_payment(pg_temp.ref('unsent'),'simulation',pg_temp.paid('pay_unsent',3309,3009,45,0)),'paid','Second card order captured');
select tests.authenticate_as('client_a');
insert into refs values('sentcase',public.ride_request_order_review(pg_temp.ref('sent'),500,'Cobrança a mais',gen_random_uuid())),
 ('unsentcase',public.ride_request_order_review(pg_temp.ref('unsent'),400,'Cobrança a mais',gen_random_uuid()));
select tests.authenticate_as('admin');
select is(public.ride_decide_order_review(pg_temp.ref('sentcase'),true,'Conferido'),'approved','Case with a sent refund approved');
select is(public.ride_decide_order_review(pg_temp.ref('unsentcase'),true,'Conferido'),'approved','Case with an unsent refund approved');
select tests.authenticate_service();
select is((public.ride_prepare_order_refund(pg_temp.ref('sentcase'),tests.uid('admin'),'simulation',0,'provider evidence')->>'target')::int,500,'Refund reserved for the first card order');
select is((public.ride_prepare_order_refund(pg_temp.ref('unsentcase'),tests.uid('admin'),'simulation',0,'provider evidence')->>'target')::int,400,'Refund reserved for the second card order');
select is(public.ride_claim_order_refund(pg_temp.ref('sentcase'),'simulation'),true,'Only the first refund is sent');
select is(public.ride_observe_order_payment(pg_temp.ref('sent'),'simulation',pg_temp.chargeback('pay_sent')),'review','Issuer signal on the order with a sent refund');
select is(public.ride_observe_order_payment(pg_temp.ref('unsent'),'simulation',pg_temp.chargeback('pay_unsent')),'review','Issuer signal on the order with an unsent refund');
select tests.authenticate_as('admin');
select throws_ok($$select public.admin_resolve_ride_issuer(pg_temp.ref('sent'),true,2000,200,'issuer debit sent')$$,'P0001','ride_operation_conflict','Issuer loss waits while a sent refund is unbooked');
select is(public.admin_void_order_refund(pg_temp.ref('sentcase'),'provider cancelled the refund'),'voided','A sent attempt the provider cancelled can be voided');
select is(public.admin_resolve_ride_issuer(pg_temp.ref('sent'),true,500,0,'issuer debit sent'),'debited','Issuer loss proceeds after the void');
select is(public.admin_resolve_ride_issuer(pg_temp.ref('unsent'),true,2000,200,'issuer debit unsent'),'debited','Issuer loss with an unsent refund');
select tests.clear_authentication();
select is((select status from private.ride_order_cases where id=pg_temp.ref('sentcase')),'settled','The debit of the exact approved amount closes that case');
select results_eq($$select r.void_ref,r.sent,c.status,(select count(*) from private.ride_order_refund_allocation a where a.order_id=r.order_id)
  from private.ride_order_refunds r join private.ride_order_cases c on c.id=r.case_id where r.case_id=pg_temp.ref('unsentcase')$$,
 $$select 'issuer:issuer debit unsent',false,'approved',0::bigint$$,'Issuer loss voids the unsent refund and a case of another amount stays open');
select tests.authenticate_service();
select is(public.ride_claim_order_refund(pg_temp.ref('unsentcase'),'simulation'),false,'The refund voided by the issuer decision is never sent');
-- The provider reports only its own refunds: the issuer debit must not hide one of them.
select is(public.ride_observe_order_payment(pg_temp.ref('sent'),'simulation',pg_temp.paid('pay_sent',3309,3009,45,500)),'review','A voided refund the provider executes after the issuer debit is parked');
select tests.clear_authentication();
select results_eq($$select b.refunds,b.refunded,b.reversed,(select string_agg(reason,',' order by reason) from private.ride_order_provider_reviews where order_id=pg_temp.ref('sent'))
  from pg_temp.books('leg5','sent','sentcase') b$$,$$select 0::bigint,500,500,'card_chargeback,unrequested_refund'$$,'The late refund is named in review and posts nothing beside the issuer debit');
select tests.authenticate_as('admin');
insert into refs values('sentlate',public.admin_accept_provider_refund(pg_temp.ref('sent'),500,0,'PSP statement sent'));
select tests.authenticate_service();
select is(public.ride_observe_order_payment(pg_temp.ref('sent'),'simulation',pg_temp.paid('pay_sent',3309,3009,45,500)),'paid','The accepted late refund is booked beside the issuer debit');
select is(public.ride_observe_order_payment(pg_temp.ref('sent'),'simulation',pg_temp.paid('pay_sent',3309,3009,45,500)),'paid','Its replay books nothing more');
select is((public.ride_prepare_order_refund(pg_temp.ref('unsentcase'),tests.uid('admin'),'simulation',0,'provider evidence 2')->>'target')::int,400,
 'After the issuer debit the never-sent attempt is reserved again on the provider total');
select is(public.ride_claim_order_refund(pg_temp.ref('unsentcase'),'simulation'),true,'The fresh attempt can be sent');
select is(public.ride_observe_order_payment(pg_temp.ref('unsent'),'simulation',pg_temp.paid('pay_unsent',3309,3009,45,400)),'paid','The provider refund sent after the issuer debit is booked');
select tests.clear_authentication();
select results_eq($$select * from pg_temp.books('leg5','sent','sentlate') union all select * from pg_temp.books('leg6','unsent','unsentcase')$$,
 $$values (1::bigint,1000,1000,'settled'),(1::bigint,2400,2400,'settled')$$,'Issuer debit and provider refund are each booked once on both card orders');
-- A provider refund parked before the issuer decision stays in review, and recovered split does not hide it.
select tests.authenticate_service();
select is((public.ride_prepare_order_payment(pg_temp.ref('late'),tests.uid('client_a'),'simulation')->>'driver_cents')::int,3009,'Card order refunded at the provider before the issuer decision');
select is(public.ride_observe_order_payment(pg_temp.ref('late'),'simulation',pg_temp.paid('pay_late',3309,3009,45,0)),'paid','Third card order captured');
select is(public.ride_observe_order_payment(pg_temp.ref('late'),'simulation',pg_temp.paid('pay_late',3309,3009,45,1000)),'review','Direct provider refund parked before the issuer signal');
select is(public.ride_observe_order_payment(pg_temp.ref('late'),'simulation',pg_temp.chargeback('pay_late')),'review','Issuer signal on the parked order');
select tests.authenticate_as('admin');
select is(public.admin_resolve_ride_issuer(pg_temp.ref('late'),true,2000,200,'issuer debit late'),'debited','Issuer loss on the parked order');
select is(public.admin_record_issuer_split_return(pg_temp.ref('late'),900,'bank proof late',md5('late issuer return')::uuid),md5('late issuer return')::uuid,'Part of the split is recovered from the driver');
select tests.clear_authentication();
select is((select status from private.ride_payment_orders where id=pg_temp.ref('late')),'review','The issuer decision does not release an order with a parked provider refund');
select tests.authenticate_service();
select is(public.ride_observe_order_payment(pg_temp.ref('late'),'simulation',pg_temp.paid('pay_late',3309,3009,45,1000)),'review','The same refund is still parked after the debit');
select tests.authenticate_as('admin');
insert into refs values('lateaccept',public.admin_accept_provider_refund(pg_temp.ref('late'),1000,0,'PSP statement late'));
select tests.authenticate_service();
select is(public.ride_observe_order_payment(pg_temp.ref('late'),'simulation',pg_temp.paid('pay_late',3309,3009,45,1000)),'paid','The accepted refund is booked after the debit and the recovered split');
select tests.clear_authentication();
select results_eq($$select b.*,s.refunded_split_cents,o.driver_returned from pg_temp.books('leg7','late','lateaccept') b,private.ride_order_psp s
  join private.ride_payment_orders o on o.id=s.order_id where s.order_id=pg_temp.ref('late')$$,
 $$select 1::bigint,3000,3000,'settled',900,900$$,'Debit, recovered split and provider refund keep separate bases on shared counters');
-- A direct provider refund of another amount than the pending request, then a provider total that moves.
select tests.authenticate_service();
select is((public.ride_prepare_order_payment(pg_temp.ref('direct'),tests.uid('client_a'),'simulation')->>'driver_cents')::int,3009,'Card order refunded directly for another amount');
select is(public.ride_observe_order_payment(pg_temp.ref('direct'),'simulation',pg_temp.paid('pay_direct',3309,3009,45,0)),'paid','Fourth card order captured');
select tests.authenticate_as('client_a');
insert into refs values('directcase',public.ride_request_order_review(pg_temp.ref('direct'),300,'Cobrança a mais',gen_random_uuid()));
select tests.authenticate_as('admin');
select is(public.ride_decide_order_review(pg_temp.ref('directcase'),true,'Conferido'),'approved','Request of R$3 approved');
select tests.authenticate_service();
select is(public.ride_observe_order_payment(pg_temp.ref('direct'),'simulation',pg_temp.paid('pay_direct',3309,3009,45,500)),'review','The provider reports R$5 refunded directly');
select tests.authenticate_as('admin');
select throws_ok($$select public.admin_accept_provider_refund(pg_temp.ref('direct'),500,0,'PSP statement 500')$$,'P0001','ride_operation_conflict','A pending request of another amount is never replaced silently');
select is(public.ride_decide_order_review(pg_temp.ref('directcase'),false,'Devolvida por outro valor direto no provedor'),'declined','An approval nothing was sent for can be withdrawn');
select is(public.ride_decide_order_review(pg_temp.ref('directcase'),false,'Devolvida por outro valor direto no provedor'),'declined','Withdrawal replay');
insert into refs values('p500',public.admin_accept_provider_refund(pg_temp.ref('direct'),500,0,'PSP statement 500'));
select tests.authenticate_service();
select is(public.ride_observe_order_payment(pg_temp.ref('direct'),'simulation',pg_temp.paid('pay_direct',3309,3009,45,500)),'paid','The direct refund is booked under its own case');
select tests.clear_authentication();
select results_eq($$select b.*,(select status from private.ride_order_cases where id=pg_temp.ref('directcase')) from pg_temp.books('leg8','direct','p500') b$$,
 $$select 1::bigint,500,500,'settled','declined'$$,'The order leaves review with the real outflow posted once');
select tests.authenticate_service();
select is(public.ride_observe_order_payment(pg_temp.ref('direct'),'simulation',pg_temp.paid('pay_direct',3309,3009,45,700)),'review','A second direct refund is parked');
select tests.authenticate_as('admin');
insert into refs values('p700',public.admin_accept_provider_refund(pg_temp.ref('direct'),700,0,'PSP statement 700'));
select tests.authenticate_service();
select is(public.ride_observe_order_payment(pg_temp.ref('direct'),'simulation',pg_temp.paid('pay_direct',3309,3009,45,900)),'review','The provider total moves before the accepted one is booked');
select tests.authenticate_as('admin');
select throws_ok($$select public.admin_accept_provider_refund(pg_temp.ref('direct'),800,0,'PSP statement 800')$$,'P0001','ride_financial_state','Only the latest parked provider total is accepted');
insert into refs values('p900',public.admin_accept_provider_refund(pg_temp.ref('direct'),900,0,'PSP statement 900'));
select tests.authenticate_service();
select is(public.ride_observe_order_payment(pg_temp.ref('direct'),'simulation',pg_temp.paid('pay_direct',3309,3009,45,900)),'paid','The moved total is booked under the case that replaced the stale one');
select tests.clear_authentication();
select results_eq($$select b.*,c.status,r.void_ref from pg_temp.books('leg8','direct','p900') b,private.ride_order_cases c join private.ride_order_refunds r on r.case_id=c.id
  where c.id=pg_temp.ref('p700')$$,$$select 2::bigint,900,900,'settled','declined','superseded:PSP statement 900'$$,'The stale provider case is declined and its attempt voided');
-- A sent attempt voided by the operator that the provider executes anyway is reinstated on its own case.
select tests.authenticate_as('client_a');
insert into refs values('reinstated',public.ride_request_order_review(pg_temp.ref('direct'),200,'Cobrança a mais',gen_random_uuid()));
select tests.authenticate_as('admin');
select is(public.ride_decide_order_review(pg_temp.ref('reinstated'),true,'Conferido'),'approved','A later request on the same order is approved');
select tests.authenticate_service();
select is((public.ride_prepare_order_refund(pg_temp.ref('reinstated'),tests.uid('admin'),'simulation',0,'provider evidence')->>'target')::int,1100,'Its refund is reserved on the booked provider total');
select is(public.ride_claim_order_refund(pg_temp.ref('reinstated'),'simulation'),true,'And sent');
select tests.authenticate_as('admin');
select is(public.admin_void_order_refund(pg_temp.ref('reinstated'),'provider reported a failure'),'voided','The operator voids it on a provider failure notice');
select tests.authenticate_service();
select is(public.ride_observe_order_payment(pg_temp.ref('direct'),'simulation',pg_temp.paid('pay_direct',3309,3009,45,1100)),'review','The provider executes the voided refund after all');
select tests.authenticate_as('admin');
select is(public.admin_accept_provider_refund(pg_temp.ref('direct'),1100,0,'PSP statement 1100'),pg_temp.ref('reinstated'),'Accepting reinstates the voided attempt on its own case');
select tests.authenticate_service();
select is(public.ride_observe_order_payment(pg_temp.ref('direct'),'simulation',pg_temp.paid('pay_direct',3309,3009,45,1100)),'paid','The reinstated refund is booked');
select tests.clear_authentication();
select results_eq($$select * from pg_temp.books('leg8','direct','reinstated')$$,$$select 3::bigint,1100,1100,'settled'$$,'Three provider refunds, each booked once under its own case');
-- Card-only order: a failed provider refund has an exit, and a refund made before the send is adopted.
select tests.authenticate_service();
select is((public.ride_prepare_order_payment(pg_temp.ref('retry'),tests.uid('client_a'),'simulation')->>'driver_cents')::int,3009,'Card order with no other refund source');
select is(public.ride_observe_order_payment(pg_temp.ref('retry'),'simulation',pg_temp.paid('pay_retry',3309,3009,45,0)),'paid','Fifth card order captured');
select tests.authenticate_as('client_a');
insert into refs values('failed',public.ride_request_order_review(pg_temp.ref('retry'),500,'Cobrança a mais',gen_random_uuid()));
select tests.authenticate_as('admin');
select is(public.ride_decide_order_review(pg_temp.ref('failed'),true,'Conferido'),'approved','Request approved on the card-only order');
select tests.authenticate_service();
select is(public.ride_prepare_order_refund(pg_temp.ref('failed'),tests.uid('admin'),'simulation',0,'provider evidence')->>'create','true','Refund reserved on the card-only order');
select is(public.ride_claim_order_refund(pg_temp.ref('failed'),'simulation'),true,'The refund is sent');
select tests.authenticate_as('admin');
select throws_ok($$select public.ride_decide_order_review(pg_temp.ref('failed'),false,'Sem fonte')$$,'P0001','ride_operation_conflict','An approval whose refund reached the provider cannot be withdrawn');
select is(public.admin_void_order_refund(pg_temp.ref('failed'),'provider failed the refund'),'voided','The failed attempt is voided');
select throws_ok($$select public.ride_refund_order_source(pg_temp.ref('failed'),'benefit',0,'TEST-RETRY')$$,'P0001','ride_financial_mismatch','A card-only order has no benefit to restore');
select tests.authenticate_service();
select throws_ok($$select public.ride_prepare_order_refund(pg_temp.ref('failed'),tests.uid('admin'),'simulation',0,'provider evidence')$$,
 'P0001','ride_financial_state','A voided attempt that reached the provider is final');
select tests.authenticate_as('admin');
select is(public.ride_decide_order_review(pg_temp.ref('failed'),false,'Estorno falhou e a ordem não tem outra fonte'),'declined','With no source left the approval is withdrawn');
select tests.authenticate_as('client_a');
insert into refs values('adopted',public.ride_request_order_review(pg_temp.ref('retry'),300,'Cobrança a mais',gen_random_uuid()));
select tests.authenticate_as('admin');
select is(public.ride_decide_order_review(pg_temp.ref('adopted'),true,'Conferido'),'approved','The payer can open a new request after the withdrawal');
select tests.authenticate_service();
select is(public.ride_prepare_order_refund(pg_temp.ref('adopted'),tests.uid('admin'),'simulation',0,'operator evidence')->>'create','true','The operator reserves a refund the provider already made by hand');
select is(public.ride_observe_order_payment(pg_temp.ref('retry'),'simulation',pg_temp.paid('pay_retry',3309,3009,45,300)),'review','An unsent reservation does not book the provider refund');
select tests.authenticate_as('admin');
select is(public.admin_accept_provider_refund(pg_temp.ref('retry'),300,0,'PSP statement retry'),pg_temp.ref('adopted'),'Accepting adopts the reserved attempt of the same case');
select tests.authenticate_service();
select is(public.ride_observe_order_payment(pg_temp.ref('retry'),'simulation',pg_temp.paid('pay_retry',3309,3009,45,300)),'paid','The adopted refund is booked');
select tests.clear_authentication();
select results_eq($$select b.*,(select status from private.ride_order_cases where id=pg_temp.ref('failed')) from pg_temp.books('leg9','retry','adopted') b$$,
 $$select 1::bigint,300,300,'settled','declined'$$,'One refund event settles the adopted case and nothing was posted for the failed one');
select is((select sum(cash_delta::bigint+receivable_delta+processing_expense_delta+benefit_delta-driver_delta-fee_delta) from private.ride_financial_events),0::numeric,'Ledger still balances after every refund path');
select * from finish();
rollback;
