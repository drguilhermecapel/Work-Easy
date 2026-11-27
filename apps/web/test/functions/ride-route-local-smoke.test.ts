// @vitest-environment node
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { expect, it } from 'vitest';
import { routeMeasure } from '../../supabase/functions/ride-route-measure/handler';

const port = process.env.WORKEASY_ROUTING_DB_PORT;
const router = process.env.WORKEASY_OSRM_URL;

it.skipIf(!port || !router)(
  'cota o percurso real entre estabelecimentos de Saúde, com passageiro e reserva de ensaio',
  async () => {
    if (!/^\d{4,5}$/.test(port!) || !['127.0.0.1', 'localhost'].includes(new URL(router!).hostname)) {
      throw new Error('Use o PostgreSQL de teste do contêiner local e um OSRM em loopback.');
    }
    const database = spawn('docker', [
      'exec',
      '-i',
      'supabase_db_workeasy',
      'psql',
      '-XAtq',
      '-v',
      'ON_ERROR_STOP=1',
      '-h',
      '/tmp',
      '-p',
      port!,
      '-U',
      'postgres',
      '-d',
      'postgres',
    ]);
    const lines = createInterface({ input: database.stdout })[Symbol.asyncIterator]();
    let errors = '';
    database.stderr.setEncoding('utf8').on('data', (text) => {
      errors += text;
    });
    const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
    async function sql(statement: string) {
      database.stdin.write(statement + ';\n\\echo SMOKE_DONE\n');
      let last = '';
      for (;;) {
        const next = await lines.next();
        if (next.done) throw new Error(errors || 'O banco local encerrou a conexão.');
        if (next.value === 'SMOKE_DONE') return last;
        if (next.value) last = next.value;
      }
    }
    try {
      await sql('begin');
      expect(await sql('select environment from private.ride_deployment where singleton')).toBe('simulation');
      await sql(
        "select tests.setup_fixture(); update private.ride_network set module_enabled=true,quote_enabled=true,dispatch_enabled=true where environment='simulation'",
      );
      await sql(`insert into private.ride_class_policies values
        ('simulation','Saúde','smoke','Veículo de ensaio',0,2,false,false,now()+interval '1 day','local-test');
        select tests.authenticate_as('client_b'); select public.ride_apply_driver('van');
        select tests.authenticate_as('admin'); select public.ride_review_driver(tests.uid('client_b'),true,current_date+3);
        select public.ride_validate_capacity(tests.uid('client_b'),2,false,false,now()+interval '1 day','local-test');
        select tests.authenticate_as('client_b'); select public.ride_configure_shift('Saúde',now(),now()+interval '2 hours');
        select public.ride_set_online(true); select tests.authenticate_as('client_a')`);
      const points = [];
      for (const name of ['Italianinho VB · Rua Miguel Estefno 316', 'Oggi Sorvetes']) {
        const result = JSON.parse(await sql('select public.ride_search_places(' + quote(name) + ",'Saúde')"));
        const place = result.find((item: { label: string }) => item.label === name);
        expect(place).toBeDefined();
        points.push(quote(JSON.stringify({ label: place.label, lat: place.lat, lng: place.lng })));
      }
      const created = JSON.parse(
        await sql(
          "select public.ride_prepare_route(gen_random_uuid(),null,'Saúde','Saúde'," +
            points.join(',') +
            ',null)',
        ),
      );
      const user = await sql('select auth.uid()');
      await sql('select tests.clear_authentication(); set local role service_role');
      const request = new Request('http://localhost/ride-route-measure', {
        method: 'POST',
        body: JSON.stringify({ route_id: created.id }),
      });
      const response = await routeMeasure(request, {
        cors: {},
        osrmBase: router,
        fetcher: fetch,
        authenticate: async () => user,
        getInput: async (id, actor) =>
          JSON.parse(await sql('select public.ride_measure_input(' + quote(id) + ',' + quote(actor) + ')')),
        commit: async (id, actor, version, result) => {
          await sql(
            'select public.ride_measure_commit(' +
              [
                quote(id),
                quote(actor),
                version,
                result.meters,
                result.minutes,
                quote(JSON.stringify(result.geometry)),
              ].join(',') +
              ')',
          );
        },
      });
      expect(response.status).toBe(200);
      await sql("reset role; select tests.authenticate_as('client_a')");
      const measured = JSON.parse(await sql('select public.ride_route_detail(' + quote(created.id) + ')'));
      expect(measured.source).toBe('osrm/car/static');
      expect(measured.meters).toBe(401);
      expect(measured.minutes).toBe(2);
      expect(measured.geometry.coordinates.length).toBeGreaterThan(2);
      expect(
        JSON.parse(await sql('select public.ride_class_options(' + quote(created.id) + ')'))[0]
          .approach_minutes,
      ).toBe(5);
      await sql('select public.ride_choose_class(' + quote(created.id) + ",'smoke')");
      const leg = [{ route_id: created.id, origin: 'Saúde', destination: 'Saúde', payer: 'passenger' }];
      const offer = JSON.parse(
        await sql('select public.ride_quote(gen_random_uuid(),null,null,' + quote(JSON.stringify(leg)) + ')'),
      );
      expect(offer.total_cents).toBeGreaterThan(0);
      const accepted = JSON.parse(await sql('select public.ride_consent(' + quote(offer.id) + ',true)'));
      expect(accepted.ride_id).toBeTruthy();
      await sql('select tests.clear_authentication()');
      expect(await sql('select status from public.ride_legs where ride_id=' + quote(accepted.ride_id))).toBe(
        'requested',
      );
    } finally {
      // The connection rolls back even when a failed assertion interrupts the transaction.
      database.stdin.end('rollback;\n\\q\n');
    }
  },
  30000,
);
