// Ocupação regulamentada contra o Supabase real: o registro profissional e os
// documentos da política decidem se o prestador aparece e recebe pedidos.
//
// O que este arquivo assume:
//  * A stack local está de pé, com o seed carregado (ver marketplace-flow.test.ts).
//  * Há ao menos uma ocupação cuja política pede `registro_profissional` entre as
//    verificações; ela é escolhida pela política, não por slug.
//  * Há ao menos um bairro. O registro usado ("123456", SP) é de teste e nunca é
//    conferido com conselho nenhum: o produto mostra o status "informado" até um
//    admin confirmar.
//  * Cada arquivo cria os próprios usuários e os remove no fim.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  expectDenied,
  expectRule,
  loadPolicies,
  must,
  pickNeighborhood,
  pickRegulated,
  registerProvider,
  REGISTRY_STEP,
  submitDocument,
  visibleIds,
  type Neighborhood,
  type PolicyRow,
  type UploadedDocument,
} from './support/domain';
import { World, type TestUser } from './support/world';

describe('ocupação regulamentada contra o Supabase real', () => {
  const world = new World();
  let policy: PolicyRow;
  let hood: Neighborhood;
  let admin: TestUser;
  let provider: TestUser;
  let client: TestUser;
  let slug = '';
  const documents: UploadedDocument[] = [];

  const search = async () =>
    must(await world.anon.rpc('search_providers', { p_occupation: policy.occupation_slug, p_neighborhood: hood.id }), 'search_providers');

  const occupationRow = async () =>
    must(
      await world.service
        .from('provider_occupations')
        .select('approved, registry_status, registry_number')
        .eq('provider_id', provider.id)
        .eq('occupation_slug', policy.occupation_slug)
        .single(),
      'ocupação do prestador',
    );

  beforeAll(async () => {
    policy = pickRegulated(await loadPolicies(world.anon));
    hood = await pickNeighborhood(world.anon);
    admin = await world.createAdmin('admin');
    provider = await world.createUser('regulado');
    client = await world.createUser('cliente');
  });

  afterAll(async () => {
    await world.cleanup();
  });

  it('sem número de registro o cadastro é recusado; com número, nasce "informado" e sem aprovação', async () => {
    await expectRule(
      provider.client.rpc('become_provider', {
        p_display_name: 'Profissional regulado',
        p_slug: world.unique('sem-registro'),
        p_occupation: policy.occupation_slug,
      }),
      'registry_required',
    );
    expect(visibleIds(await provider.client.from('providers').select('id'))).toEqual([]);

    slug = await registerProvider(world, provider, {
      occupation: policy.occupation_slug,
      neighborhood: hood.id,
      registry: { number: '123456', uf: 'SP' },
    });
    expect(await occupationRow()).toMatchObject({ approved: false, registry_status: 'informed', registry_number: '123456' });
  });

  it('a política manda: entra em análise só com todos os documentos enviados', async () => {
    const steps = policy.verification;
    expect(steps).toContain(REGISTRY_STEP);

    const missing = await expectRule(provider.client.rpc('submit_provider_for_review'), 'documents_missing');
    for (const step of steps) expect(missing.details).toContain(step);

    // todos menos o último: a análise continua fechada e o erro nomeia o que falta
    for (const step of steps.slice(0, -1)) documents.push(await submitDocument(world, provider, step));
    const last = steps[steps.length - 1];
    if (steps.length > 1) {
      const partial = await expectRule(provider.client.rpc('submit_provider_for_review'), 'documents_missing');
      expect(partial.details).toBe(last);
    }
    documents.push(await submitDocument(world, provider, last));

    expect(must(await provider.client.rpc('submit_provider_for_review'), 'submit_provider_for_review')).toBe('pending_review');
    // em análise, o prestador não inclui outra ocupação
    await expectRule(
      provider.client.from('provider_occupations').insert({ provider_id: provider.id, occupation_slug: policy.occupation_slug, registry_number: '999' }),
      'not_allowed',
    );
  });

  it('o admin não aprova a ocupação sem o documento aceito; o dono nunca aprova a si mesmo', async () => {
    await expectRule(
      admin.client.rpc('admin_set_occupation_approval', { p_provider: provider.id, p_occupation: policy.occupation_slug, p_approved: true }),
      'documents_missing',
    );
    await expectRule(provider.client.from('provider_occupations').update({ approved: true }).eq('provider_id', provider.id), 'not_allowed');
    await expectRule(
      provider.client.from('provider_occupations').update({ registry_status: 'confirmed' }).eq('provider_id', provider.id),
      'not_allowed',
    );
    await expectDenied(provider.client.from('provider_documents').update({ status: 'accepted' }).eq('id', documents[0].id));
    await expectRule(provider.client.rpc('admin_set_provider_status', { p_provider: provider.id, p_status: 'approved' }), 'not_allowed');
  });

  it('com os documentos aceitos e o registro confirmado, o prestador é aprovado e aparece na busca', async () => {
    for (const document of documents) {
      must(await admin.client.rpc('admin_review_document', { p_document: document.id, p_accept: true }), 'aceite');
    }
    must(
      await admin.client.rpc('admin_set_registry_status', {
        p_provider: provider.id,
        p_occupation: policy.occupation_slug,
        p_status: 'confirmed',
        p_reason: 'teste de integração',
      }),
      'registro',
    );
    must(await admin.client.rpc('admin_set_provider_status', { p_provider: provider.id, p_status: 'approved' }), 'aprovação');
    // a primeira aprovação já aprova a ocupação cujos documentos estão aceitos
    expect(await occupationRow()).toMatchObject({ approved: true, registry_status: 'confirmed' });

    const found = (await search()).find(row => row.provider_id === provider.id);
    expect(found?.registry_status).toBe('confirmed');
    if (!policy.rating_ranking) {
      expect(found?.rating_avg).toBeNull();
      expect(found?.rating_count).toBeNull();
    }
  });

  it('recebe pedidos da ocupação, e só dos bairros que atende', async () => {
    const request = must(
      await client.client
        .from('requests')
        .insert({
          occupation_slug: policy.occupation_slug,
          neighborhood_id: hood.id,
          description: `Preciso de atendimento profissional (teste de integração ${world.runId})`,
        })
        .select('id')
        .single(),
      'pedido',
    );
    const mine = must(await provider.client.rpc('open_requests_for_me'), 'open_requests_for_me');
    expect(mine.map(row => row.id)).toContain(request.id);

    const proposal = await provider.client.from('proposals').insert({ request_id: request.id, price_cents: 25000 });
    expect(proposal.error).toBeNull();

    // sem o bairro na área atendida, o pedido some para ele
    must(await provider.client.from('provider_neighborhoods').delete().eq('provider_id', provider.id).select('provider_id'), 'sair do bairro');
    expect(must(await provider.client.rpc('open_requests_for_me'), 'open_requests_for_me').map(row => row.id)).not.toContain(request.id);
    must(
      await provider.client.from('provider_neighborhoods').insert({ provider_id: provider.id, neighborhood_id: hood.id }).select('provider_id'),
      'voltar ao bairro',
    );
  });

  it('rejeitar um documento tira a aprovação, a ocupação sai da busca e só o admin devolve', async () => {
    const [victim] = documents;
    await expectRule(admin.client.rpc('admin_review_document', { p_document: victim.id, p_accept: false }), 'not_allowed'); // motivo obrigatório
    expect(must(await admin.client.rpc('admin_review_document', { p_document: victim.id, p_accept: false, p_reason: 'ilegível' }), 'rejeição')).toBe('rejected');

    expect((await occupationRow()).approved).toBe(false);
    expect((await search()).map(row => row.provider_id)).not.toContain(provider.id);
    expect(must(await world.anon.rpc('get_provider_page', { p_slug: slug }), 'get_provider_page')).toMatchObject({ occupations: [] });
    expect(must(await provider.client.rpc('open_requests_for_me'), 'open_requests_for_me')).toEqual([]);

    // aceitar o documento de novo não devolve a aprovação sozinho
    must(await admin.client.rpc('admin_review_document', { p_document: victim.id, p_accept: true }), 'aceite de novo');
    expect((await occupationRow()).approved).toBe(false);
    must(
      await admin.client.rpc('admin_set_occupation_approval', { p_provider: provider.id, p_occupation: policy.occupation_slug, p_approved: true }),
      'aprovação de novo',
    );
    expect((await search()).map(row => row.provider_id)).toContain(provider.id);

    const trail = must(
      await admin.client.from('audit_log').select('action').eq('action', 'occupation.approval_revoked').eq('entity_id', `${provider.id}:${policy.occupation_slug}`),
      'auditoria',
    );
    expect(trail.length).toBeGreaterThan(0);
  });

  it('registro rejeitado tira a ocupação de circulação e impede nova aprovação', async () => {
    must(
      await admin.client.rpc('admin_set_registry_status', {
        p_provider: provider.id,
        p_occupation: policy.occupation_slug,
        p_status: 'rejected',
        p_reason: 'número não confere',
      }),
      'registro rejeitado',
    );
    expect((await search()).map(row => row.provider_id)).not.toContain(provider.id);
    expect(must(await provider.client.rpc('open_requests_for_me'), 'open_requests_for_me')).toEqual([]);
    await expectRule(
      admin.client.rpc('admin_set_occupation_approval', { p_provider: provider.id, p_occupation: policy.occupation_slug, p_approved: true }),
      'not_allowed',
    );
  });
});
