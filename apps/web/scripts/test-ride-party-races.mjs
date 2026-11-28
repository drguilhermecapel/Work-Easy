/** O17 stage 5 (PAR-501..508): family limit, vouchers, invoices, invites and fleet cessions under
 * real concurrency. Local PostgreSQL only; same environment as test-ride-payment-races.mjs:
 *   RIDE_TEST_DB_CONTAINER=supabase_db_workeasy PGHOST=127.0.0.1 PGPORT=5432 npm run test:races
 * A race is two independent sessions released at the same instant (race() in the harness); where
 * the two orders have different right answers, each order runs with the transactions overlapping
 * (overlap()). Every assertion reads the answers and the final state of the disposable database. */
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { act, overlap, race, run, withRaceDatabase } from './ride-race-harness.mjs';

// Configuration seeded by the migrations. The schema-only clone has no rows, and the party
// routines quote through the product's own route, tariff and gate tables.
const referenceTables = [
  'ride_deployment',
  'ride_network',
  'ride_tariffs',
  'ride_extra_prices',
  'ride_routes',
  'ride_approach_routes',
  'ride_dispatch_rules',
  'ride_party_rules',
  'ride_companion_terms',
].map((table) => 'private.' + table);

await withRaceDatabase(
  { prefix: 'ride_party_test_', fixture: './fixtures/205_ride_parties.sql', referenceTables },
  async (database) => {
    // Sessions print one empty line per void call; the answer is the last line with content.
    const last = (out) => out.split('\n').filter(Boolean).at(-1) ?? '';
    const state = async (sql) => last(await run(database, sql));
    const row = async (sql) => (await state(sql)).split('|');
    const as = async (role, sql) => last(await act(database, role, sql));
    const answers = (settled) => settled.map((x) => (x.status === 'fulfilled' ? { ...x, value: last(x.value) } : x));
    const compete = async (...sessions) => answers(await race(database, sessions));
    const won = (settled) => settled.filter((x) => x.status === 'fulfilled');
    const lost = (settled) => settled.filter((x) => x.status === 'rejected');
    const fare = Number(await state("select tests.ref('x');"));
    assert.ok(fare > 0, 'a tarifa de referência do ensaio existe');

    // (a) PAR-502. Two members ask for the last slice of the family's monthly limit.
    const sponsored = (member) =>
      "select public.ride_quote_sponsored('" +
      randomUUID() +
      "',tests.ref('family_at')::timestamptz,tests.trip(),tests.ref('mandate_" +
      member +
      "')::uuid)->>'id'";
    const members = ['fam_m1', 'fam_m2'];
    const slice = await compete(...members.map((member) => [member, sponsored(member)]));
    assert.equal(won(slice).length, 1, 'só um familiar cota a última fatia do limite');
    assert.match(lost(slice)[0].reason.message, /ride_limit_exceeded/);
    assert.equal(
      await state(
        "select count(*) from private.ride_quote_funding f join private.ride_quotes q on q.id=f.quote_id where f.account_id=tests.ref('family')::uuid and q.status='awaiting_consent';",
      ),
      '1',
      'a cotação recusada não fica no banco',
    );
    // The member who holds the slice quotes it again (a rider's own pending quote does not block
    // a new one) and accepts both at once: the limit is checked again where the leg is born.
    const holder = members[slice.findIndex((x) => x.status === 'fulfilled')];
    const twice = [won(slice)[0].value, await as(holder, sponsored(holder))];
    const accepted = await compete(
      ...twice.map((quote) => [holder, "select public.ride_consent('" + quote + "',true)->>'status'"]),
    );
    assert.deepEqual(
      won(accepted).map((x) => x.value),
      ['requested'],
      'só um aceite vira corrida',
    );
    assert.match(lost(accepted)[0].reason.message, /ride_limit_exceeded/);
    const [familyLegs, familyCents, familyLimit] = await row(
      "select count(*),sum(l.fare_cents),(select monthly_limit_cents from private.ride_accounts where id=tests.ref('family')::uuid)" +
        " from private.ride_leg_funding f join public.ride_legs l on l.id=f.leg_id where f.account_id=tests.ref('family')::uuid and l.status<>'cancelled';",
    );
    assert.deepEqual([familyLegs, familyCents], ['2', String(2 * fare)], 'a fatia anterior e uma única corrida nova');
    assert.ok(Number(familyCents) <= Number(familyLimit), 'os trechos da família cabem no limite');
    const statement = JSON.parse(
      await as(
        'fam_owner',
        "select public.ride_account_statement(tests.ref('family')::uuid,tests.ref('family_month')::date)",
      ),
    );
    assert.equal(statement.total_cents, 2 * fare, 'o extrato soma os dois trechos');
    assert.ok(statement.total_cents <= statement.monthly_limit_cents, 'o extrato nunca passa do limite');

    // (b) PAR-506. Two riders accept quotes funded by the last balance of one voucher program.
    const funded = [];
    for (const member of ['org_m1', 'org_m2'])
      funded.push(
        await as(
          member,
          "select public.ride_quote_funded('" +
            randomUUID() +
            "',null,tests.trip(),tests.ref('p_last')::uuid,tests.ref('cc')::uuid)->>'id'",
        ),
      );
    const reserved = await compete(
      ...['org_m1', 'org_m2'].map((member, i) => [
        member,
        "select public.ride_consent('" + funded[i] + "',true)->>'status'",
      ]),
    );
    assert.deepEqual(
      won(reserved).map((x) => x.value),
      ['requested'],
      'só um aceite reserva o último saldo',
    );
    assert.match(lost(reserved)[0].reason.message, /ride_voucher_unavailable/);
    const refused = funded[reserved.findIndex((x) => x.status === 'rejected')];
    const pair = "('" + funded.join("','") + "')";
    assert.deepEqual(
      await row(
        'select (select count(*) from private.ride_voucher_grants g join public.ride_legs l on l.id=g.leg_id where l.source_quote_id in ' +
          pair +
          "),(select count(*) from public.ride_legs where source_quote_id='" +
          refused +
          "'),(select count(*) from public.rides where quote_id='" +
          refused +
          "'),(select status from private.ride_quotes where id='" +
          refused +
          "');",
      ),
      ['1', '0', '0', 'awaiting_consent'],
      'uma reserva de voucher; o aceite recusado não deixa trecho nem corrida',
    );
    const [programGrants, programBenefits, committed, budget] = await row(
      "select (select count(*) from private.ride_voucher_grants where program_id=p.id),(select count(*) from private.ride_benefits where funding_ref='voucher:'||p.id)," +
        "private.ride_voucher_commitment(p.id,null),p.budget_cents from private.ride_voucher_programs p where p.id=tests.ref('p_last')::uuid;",
    );
    assert.deepEqual([programGrants, programBenefits, committed], ['2', '2', String(2 * fare)]);
    assert.ok(Number(committed) <= Number(budget), 'o comprometido nunca passa da verba do programa');

    // (c) PAR-506. Two sessions of the rider use the same voucher on the same completed leg.
    const redeem = ['org_m3', "select public.ride_redeem_voucher(tests.ref('leg_redeem')::uuid,'pix')"];
    const redeemed = await compete(redeem, redeem);
    assert.equal(won(redeemed).length, 2, 'as duas sessões recebem a resposta do uso do voucher');
    assert.equal(redeemed[0].value, redeemed[1].value, 'e a resposta é a mesma');
    assert.deepEqual(
      [JSON.parse(redeemed[0].value).applied_cents, JSON.parse(redeemed[0].value).remainder_cents],
      [fare, 0],
    );
    assert.deepEqual(
      await row(
        'select (select count(*) from private.ride_payment_orders where leg_id=l.id),' +
          '(select count(*) from private.ride_benefit_uses u join private.ride_payment_orders o on o.id=u.order_id where o.leg_id=l.id),' +
          "(select count(*) from private.ride_financial_events where leg_id=l.id and kind='benefit')," +
          "(select count(*) from private.ride_order_events e join private.ride_payment_orders o on o.id=e.order_id where o.leg_id=l.id and e.action='benefit')," +
          '(select b.available_cents from private.ride_voucher_grants g join private.ride_benefits b on b.id=g.benefit_id where g.leg_id=l.id)' +
          " from public.ride_legs l where l.id=tests.ref('leg_redeem')::uuid;",
      ),
      ['1', '1', '1', '1', '0'],
      'uma ordem, um uso do benefício, um lançamento e nenhum saldo sobrando',
    );

    // (d) PAR-507. Two finance sessions, each with its own key, close the same month of the company.
    const close = () =>
      "select public.admin_close_ride_invoice(tests.ref('org')::uuid,tests.ref('month')::date,'" + randomUUID() + "')";
    const invoices = await compete(['admin', close()], ['finance_b', close()]);
    assert.equal(won(invoices).length, 2, 'as duas sessões recebem a fatura do mês');
    assert.equal(invoices[0].value, invoices[1].value, 'e é a mesma fatura');
    const lines =
      "(select count(*)||'|'||count(distinct event_id)||'|'||sum(cents)||'|'||md5(string_agg(x::text,';' order by x.id)) from private.ride_invoice_lines x)";
    const closed = await row(
      'select count(*),min(id::text),sum(total_cents),' +
        lines +
        ",(select count(*) from public.audit_log where action='ride.invoice_close') from private.ride_invoices;",
    );
    assert.deepEqual(
      closed.slice(0, 6),
      ['1', invoices[0].value, String(2 * fare), '2', '2', String(2 * fare)],
      'uma fatura, uma linha por voucher usado, e o total é a soma delas',
    );
    assert.equal(closed[7], '1', 'um único registro de fechamento na trilha');
    assert.equal(await as('admin', close()), invoices[0].value, 'fechar de novo devolve a mesma fatura');
    assert.equal((await row('select ' + lines + ';'))[3], closed[6], 'e as linhas são as mesmas');

    // (e) PAR-501. The invited adult answers the same invite twice at once.
    const answer = (rider, token) => [
      rider,
      "select public.ride_answer_rider_invite(tests.ref('" + token + "'),true,'" + randomUUID() + "')",
    ];
    const rides = (passenger) =>
      "(select count(*) from public.rides where passenger_id=tests.uid('" + passenger + "'))";
    const riders = await compete(answer('rider_1', 'token_1'), answer('rider_1', 'token_1'));
    assert.equal(won(riders).length, 2, 'as duas respostas ao convite são atendidas');
    const invited = riders.map((x) => JSON.parse(x.value));
    assert.deepEqual([invited[0].status, invited[1].status], ['accepted', 'accepted']);
    assert.ok(
      invited[0].ride_id && invited[0].ride_id === invited[1].ride_id,
      'as duas respostas apontam a mesma corrida',
    );
    assert.deepEqual(
      await row(
        'select ' +
          rides('rider_1') +
          ",(select count(*) from public.ride_legs l join public.rides r on r.id=l.ride_id where r.passenger_id=tests.uid('rider_1') and l.payer_id=tests.uid('sponsor'))," +
          "(select count(*)||'/'||min(status) from private.ride_payer_mandates where rider_id=tests.uid('rider_1'))," +
          "(select status from private.ride_rider_invites where id=tests.ref('invite_1')::uuid);",
      ),
      ['1', '1', '1/used', 'accepted'],
      'uma corrida, um trecho pago por quem pediu, um mandato usado',
    );
    // The recipient accepts while who asked withdraws the invite. Each order has one right answer:
    // an invite already withdrawn refuses the acceptance, and one already accepted is not withdrawn.
    for (const [n, first] of [
      [2, 'revoke'],
      [3, 'answer'],
    ]) {
      const sessions = {
        answer: answer('rider_' + n, 'token_' + n),
        revoke: ['sponsor', "select public.ride_revoke_rider_invite(tests.ref('invite_" + n + "')::uuid)"],
      };
      const [led, followed] = answers(
        await overlap(database, sessions[first], sessions[first === 'revoke' ? 'answer' : 'revoke']),
      );
      const [taken, revoked] = first === 'revoke' ? [followed, led] : [led, followed];
      assert.equal(revoked.status, 'fulfilled', 'a retirada do convite nunca falha');
      if (first === 'revoke') {
        assert.equal(taken.status, 'rejected', 'convite já retirado não é aceito');
        assert.match(taken.reason.message, /ride_invite_unavailable/);
      } else assert.equal(JSON.parse(taken.value).status, 'accepted', 'o aceite que chegou antes vale');
      assert.deepEqual(
        [
          revoked.value,
          ...(await row(
            "select (select status from private.ride_rider_invites where id=tests.ref('invite_" +
              n +
              "')::uuid)," +
              rides('rider_' + n) +
              ",(select count(*) from private.ride_payer_mandates where rider_id=tests.uid('rider_" +
              n +
              "'));",
          )),
        ],
        first === 'revoke' ? ['t', 'revoked', '0', '0'] : ['f', 'accepted', '1', '1'],
        'convite retirado sem corrida nem mandato, ou aceito com uma corrida',
      );
    }
    // PAR-505. The company's guest answers the desk's invite twice at once.
    const guest = () => [
      'guest',
      "select public.ride_answer_guest_invite(tests.ref('guest_token'),true,'" + randomUUID() + "')",
    ];
    const guests = (await compete(guest(), guest())).map((x) => {
      assert.equal(x.status, 'fulfilled', 'as duas respostas do convidado são atendidas');
      return JSON.parse(x.value);
    });
    assert.ok(guests[0].ride_id && guests[0].ride_id === guests[1].ride_id, 'o convidado tem uma única corrida');
    assert.deepEqual(
      await row(
        'select ' +
          rides('guest') +
          ",(select count(*) from private.ride_voucher_grants where program_id=tests.ref('p_guest')::uuid)," +
          "(select status from private.ride_trip_grants where id=tests.ref('guest_key')::uuid)," +
          "(select status from private.ride_guest_invites where id=tests.ref('guest_key')::uuid);",
      ),
      ['1', '1', 'used', 'accepted'],
      'uma corrida, uma reserva de voucher e a autorização usada uma vez',
    );

    // (f) PAR-508. The operation withdraws a cession while its driver accepts an offer. Each order
    // has one right answer, so each runs once with the second session meeting the first one's
    // uncommitted work: a withdrawal already made refuses the acceptance, and an acceptance already
    // made keeps the leg tied to the cession it saw, which is then withdrawn for the next offers.
    for (const [n, first] of [
      [1, 'review'],
      [2, 'offer'],
    ]) {
      const rider = 'rider_f' + n;
      const driver = 'fleet_d' + n;
      const quote = await as(rider, "select public.ride_quote('" + randomUUID() + "',null,null,tests.trip())->>'id'");
      assert.equal(await as(rider, "select public.ride_consent('" + quote + "',true)->>'status'"), 'requested');
      const leg = await state("select id from public.ride_legs where source_quote_id='" + quote + "';");
      assert.equal(
        await state(
          "select private.ride_offer_eligible(tests.uid('" +
            driver +
            "'),l) from public.ride_legs l where l.id='" +
            leg +
            "';",
        ),
        't',
        'com a cessão aprovada o motorista da frota pode aceitar',
      );
      const sessions = {
        offer: [driver, "select public.ride_accept_offer('" + leg + "','" + randomUUID() + "')->>'status'"],
        review: [
          'admin',
          "select public.admin_review_fleet_assignment(tests.ref('cession_" +
            n +
            "')::uuid,false,'DOSSIE-RETIRADA-" +
            n +
            "')",
        ],
      };
      const [led, followed] = answers(
        await overlap(database, sessions[first], sessions[first === 'review' ? 'offer' : 'review']),
      );
      const [offer, review] = first === 'review' ? [followed, led] : [led, followed];
      assert.deepEqual(
        [review.status, review.value],
        ['fulfilled', 'f'],
        'a operação sempre consegue retirar a cessão',
      );
      if (first === 'review') {
        assert.equal(offer.status, 'rejected', 'cessão já retirada não aceita oferta');
        assert.match(offer.reason.message, /ride_fleet_review_required|offer_unavailable/);
      } else assert.deepEqual([offer.status, offer.value], ['fulfilled', 'accepted'], 'o aceite que chegou antes vale');
      assert.deepEqual(
        await row(
          "select (select status from private.ride_fleet_assignments where id=tests.ref('cession_" +
            n +
            "')::uuid),l.status,coalesce((l.driver_id=tests.uid('" +
            driver +
            "'))::text,'none'),(select count(*) from private.ride_leg_vehicles v where v.leg_id=l.id)," +
            "(select count(*) from private.ride_leg_vehicles v where v.leg_id=l.id and v.assignment_id=tests.ref('cession_" +
            n +
            "')::uuid and v.driver_id=tests.uid('" +
            driver +
            "')) from public.ride_legs l where l.id='" +
            leg +
            "';",
        ),
        first === 'review' ? ['rejected', 'requested', 'none', '0', '0'] : ['rejected', 'accepted', 'true', '1', '1'],
        'trecho sem motorista e sem vínculo, ou trecho aceito e preso à cessão vista no aceite',
      );
    }
    console.log(
      '11 corridas concorrentes verificadas: limite da família (cotação e aceite), último saldo do voucher, uso do voucher, ' +
        'fechamento da fatura, convite de corrida (duas respostas; retirada antes e depois do aceite), convite de convidado, ' +
        'cessão de frota retirada antes e depois do aceite da oferta.',
    );
  },
);
