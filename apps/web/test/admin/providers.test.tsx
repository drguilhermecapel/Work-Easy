import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { findOccupation } from '../../catalog';
import { DOC_ID, DOC2_ID, PROVIDER_ID } from './fake';

vi.mock('../../lib/supabase', async () => {
  const { createAdminFake, current } = await import('./fake');
  return { supabase: createAdminFake(() => current.world), backendEnabled: true };
});

const { callsOf, fake, renderAdmin, resetWorld } = await import('./harness');

describe('fila de prestadores', () => {
  beforeEach(() => {
    resetWorld();
  });

  it('lists the queue with what is pending and links to the provider', async () => {
    renderAdmin('/admin/prestadores');
    const link = await screen.findByRole('link', { name: /Dr\. Paulo Cardio/ });
    expect(link).toHaveAttribute('href', `/admin/prestadores/${PROVIDER_ID}`);
    expect(within(link).getByText('Em análise')).toBeInTheDocument();
    expect(within(link).getByText(/1 documento a revisar/)).toBeInTheDocument();
    expect(within(link).getByText(/1 registro a conferir/)).toBeInTheDocument();
    expect(within(link).getByText(/1 ocupação a aprovar/)).toBeInTheDocument();
    expect(within(link).getByText(/Cardiologista/)).toBeInTheDocument();
  });

  it('says the queue is empty', async () => {
    resetWorld();
    const world = (await import('./fake')).current.world;
    world.tables.admin_provider_queue = [];
    renderAdmin('/admin/prestadores');
    expect(await screen.findByText('Nenhum prestador esperando análise.')).toBeInTheDocument();
  });

  it('shows a translated error when the queue cannot be read', async () => {
    const world = resetWorld();
    world.errors.admin_provider_queue = { code: '42501', message: 'permission denied for view admin_provider_queue' };
    renderAdmin('/admin/prestadores');
    expect(await screen.findByRole('alert')).toHaveTextContent('Você não tem permissão para acessar ou alterar estes dados.');
  });
});

describe('lista de prestadores', () => {
  const user = userEvent.setup();
  const OTHER_ID = 'b0000000-0000-4000-8000-000000000010';
  const THIRD_ID = 'b0000000-0000-4000-8000-000000000011';

  /** Two more providers that are in no queue: an approved one with two occupations, and a suspended one. */
  const addProviders = async () => {
    const world = (await import('./fake')).current.world;
    world.tables.profiles.push({ id: OTHER_ID, full_name: 'Joana Silva' }, { id: THIRD_ID, full_name: 'Carlos Souza' });
    world.tables.providers.push(
      { id: OTHER_ID, display_name: 'Joana Diarista', slug: 'joana', bio: null, status: 'approved', plan: 'free', created_at: '2026-09-01T10:00:00Z' },
      { id: THIRD_ID, display_name: 'Carlos 100% Pinturas', slug: 'carlos', bio: null, status: 'suspended', plan: 'pro', created_at: '2026-09-02T10:00:00Z' },
    );
    world.tables.provider_occupations.push(
      { provider_id: OTHER_ID, occupation_slug: 'diarista', is_primary: true, registry_number: null, registry_uf: null, registry_status: 'not_required', approved: true },
      { provider_id: OTHER_ID, occupation_slug: 'passadeira', is_primary: false, registry_number: null, registry_uf: null, registry_status: 'not_required', approved: false },
      { provider_id: THIRD_ID, occupation_slug: 'so-no-banco', is_primary: true, registry_number: null, registry_uf: null, registry_status: 'not_required', approved: true },
    );
    world.tables.occupations = [{ slug: 'so-no-banco', name: 'Pintor de interiores' }];
    return world;
  };

  beforeEach(() => {
    resetWorld();
  });

  const rowLinks = () => screen.getAllByRole('link').filter(link => link.getAttribute('href')?.startsWith('/admin/prestadores/'));
  const names = (): string[] => rowLinks().map(link => link.querySelector('p.font-bold')?.textContent ?? '');

  it('opens on the queue, which is the work to do', async () => {
    await addProviders();
    renderAdmin('/admin/prestadores');
    await screen.findByRole('link', { name: /Dr\. Paulo Cardio/ });
    expect(screen.getByLabelText('Situação')).toHaveValue('queue');
    expect(names()).toEqual(['Dr. Paulo Cardio']);
  });

  it('lists every provider with name, status and occupations, and filters by status', async () => {
    await addProviders();
    renderAdmin('/admin/prestadores');
    await user.selectOptions(await screen.findByLabelText('Situação'), 'all');
    await waitFor(() => expect(names()).toEqual(['Carlos 100% Pinturas', 'Dr. Paulo Cardio', 'Joana Diarista']));

    const joana = screen.getByRole('link', { name: /Joana Diarista/ });
    expect(joana).toHaveAttribute('href', `/admin/prestadores/${OTHER_ID}`);
    expect(within(joana).getByText('Aprovado')).toBeInTheDocument();
    // Names come from the catalog (so they follow it when it grows)
    expect(within(joana).getByText(`${findOccupation('diarista')!.name}, ${findOccupation('passadeira')!.name}`)).toBeInTheDocument();
    expect(within(joana).getByText(/1 ocupação a aprovar/)).toBeInTheDocument();
    // An occupation that exists only in the database shows its name, not the slug
    expect(within(screen.getByRole('link', { name: /Carlos/ })).getByText('Pintor de interiores')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Situação'), 'suspended');
    await waitFor(() => expect(names()).toEqual(['Carlos 100% Pinturas']));
    expect(within(screen.getByRole('link', { name: /Carlos/ })).getByText('Suspenso')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Situação'), 'approved');
    await waitFor(() => expect(names()).toEqual(['Joana Diarista']));
  });

  it('searches by part of the name, ignoring case, and treats % as a character', async () => {
    await addProviders();
    renderAdmin('/admin/prestadores');
    await user.selectOptions(await screen.findByLabelText('Situação'), 'all');
    await screen.findByRole('link', { name: /Joana/ });
    await user.type(screen.getByLabelText('Buscar pelo nome'), 'dIaRi');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() => expect(names()).toEqual(['Joana Diarista']));

    await user.clear(screen.getByLabelText('Buscar pelo nome'));
    await user.type(screen.getByLabelText('Buscar pelo nome'), '100%');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() => expect(names()).toEqual(['Carlos 100% Pinturas']));

    await user.clear(screen.getByLabelText('Buscar pelo nome'));
    await user.type(screen.getByLabelText('Buscar pelo nome'), 'zzz');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(await screen.findByText('Nenhum prestador encontrado para "zzz" neste filtro.')).toBeInTheDocument();
  });

  it('searches the queue too, by the name of the account as well', async () => {
    renderAdmin('/admin/prestadores');
    await screen.findByRole('link', { name: /Dr\. Paulo Cardio/ });
    await user.type(screen.getByLabelText('Buscar pelo nome'), 'prestador');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(await screen.findByRole('link', { name: /Dr\. Paulo Cardio/ })).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Buscar pelo nome'));
    await user.type(screen.getByLabelText('Buscar pelo nome'), 'nada');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(await screen.findByText('Nenhum prestador encontrado para "nada" neste filtro.')).toBeInTheDocument();
  });

  it('pages the list of all providers', async () => {
    const world = (await import('./fake')).current.world;
    for (let i = 0; i < 30; i += 1) {
      const id = `b0000000-0000-4000-8000-${String(100 + i).padStart(12, '0')}`;
      world.tables.providers.push({ id, display_name: `Prestador ${String(i).padStart(2, '0')}`, slug: `p-${i}`, bio: null, status: 'approved', plan: 'free', created_at: '2026-09-01T10:00:00Z' });
    }
    renderAdmin('/admin/prestadores');
    await user.selectOptions(await screen.findByLabelText('Situação'), 'all');
    await screen.findByRole('link', { name: /Prestador 00/ });
    expect(rowLinks()).toHaveLength(25);
    await user.click(screen.getByRole('button', { name: 'Próxima página' }));
    await screen.findByText('Página 2');
    expect(rowLinks()).toHaveLength(6);
  });

  it('says when a status has nobody', async () => {
    renderAdmin('/admin/prestadores');
    await user.selectOptions(await screen.findByLabelText('Situação'), 'suspended');
    expect(await screen.findByText('Nenhum prestador suspenso.')).toBeInTheDocument();
  });
});

describe('detalhe do prestador', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    resetWorld();
  });

  const open = async () => {
    renderAdmin(`/admin/prestadores/${PROVIDER_ID}`);
    await screen.findByRole('heading', { name: 'Dr. Paulo Cardio' });
  };

  it('shows the data, the informed registry (not confirmed) and the council lookup', async () => {
    await open();
    expect(screen.getByText('Paulo Prestador')).toBeInTheDocument();
    expect(screen.getByText('+5511999990000')).toBeInTheDocument();
    const occupation = screen.getByRole('heading', { name: 'Cardiologista' }).closest('div') as HTMLElement;
    expect(within(occupation.parentElement as HTMLElement).getByText('Registro informado')).toBeInTheDocument();
    expect(screen.getByText('123456/SP')).toBeInTheDocument();
    expect(screen.getByText('CFM/CRM')).toBeInTheDocument();
    expect(screen.getByText('Lei 3.268/1957')).toBeInTheDocument();
    const lookup = screen.getByRole('link', { name: /Buscar a consulta pública do CRM/ });
    expect(lookup).toHaveAttribute('target', '_blank');
    expect(lookup).toHaveAttribute('rel', expect.stringContaining('noopener'));
    // The registry number and the state stay out of the search engine
    const search = decodeURIComponent(lookup.getAttribute('href') ?? '');
    expect(search).toContain('consulta pública CRM CFM/CRM');
    expect(search).not.toContain('123456');
    expect(search).not.toMatch(/\bSP\b/);
  });

  it('shows no council link for an occupation without a registry', async () => {
    const world = (await import('./fake')).current.world;
    Object.assign(world.tables.provider_occupations[0], { occupation_slug: 'diarista', registry_status: 'not_required', registry_number: null, registry_uf: null });
    world.tables.occupation_policies = [
      { occupation_slug: 'diarista', regulated: false, regulator_body: '', registry_name: '', legal_basis: 'LC 150/2015', verification: ['documento_selfie'], sources: [] },
    ];
    await open();
    expect(screen.getByRole('heading', { name: 'Diarista' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /consulta pública/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmar registro' })).not.toBeInTheDocument();
  });

  it('opens a document by a signed address of the private bucket', async () => {
    await open();
    await user.click(screen.getByRole('button', { name: 'Ver arquivo: Documento com foto e selfie' }));
    const link = await screen.findByRole('link', { name: /Abrir em nova aba/ });
    expect(link).toHaveAttribute('href', `https://storage.test/provider-documents/${PROVIDER_ID}/rg-frente.jpg?token=abc`);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(fake.signedUrlCalls).toEqual([{ bucket: 'provider-documents', path: `${PROVIDER_ID}/rg-frente.jpg`, seconds: 300 }]);
    expect(screen.getByText(/vale por 5 minutos/)).toBeInTheDocument();
  });

  it('explains when the file cannot be opened', async () => {
    (await import('./fake')).current.world.storageError = { name: 'StorageApiError', message: 'Object not found', status: 404 };
    await open();
    await user.click(screen.getByRole('button', { name: 'Ver arquivo: Documento com foto e selfie' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não encontramos o que você procurou.');
    expect(screen.queryByRole('link', { name: /Abrir em nova aba/ })).not.toBeInTheDocument();
  });

  it('offers review only for submitted documents', async () => {
    await open();
    expect(screen.getAllByRole('button', { name: 'Aceitar documento' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Rejeitar documento' })).toHaveLength(1);
  });

  it('refuses to reject a document without a reason, in the interface', async () => {
    await open();
    await user.click(screen.getByRole('button', { name: 'Rejeitar documento' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar rejeição' }));
    expect(await screen.findByText('Informe o motivo. Ele fica no histórico da ação.')).toBeInTheDocument();
    expect(callsOf('admin_review_document')).toHaveLength(0);

    // Spaces are not a reason either
    await user.type(screen.getByLabelText('Motivo (obrigatório)'), '   ');
    await user.click(screen.getByRole('button', { name: 'Confirmar rejeição' }));
    expect(callsOf('admin_review_document')).toHaveLength(0);
  });

  it('rejects a document with the reason and updates the list', async () => {
    await open();
    await user.click(screen.getByRole('button', { name: 'Rejeitar documento' }));
    await user.type(screen.getByLabelText('Motivo (obrigatório)'), '  Foto cortada, não dá para ler o número.  ');
    await user.click(screen.getByRole('button', { name: 'Confirmar rejeição' }));

    await waitFor(() => expect(callsOf('admin_review_document')).toHaveLength(1));
    expect(callsOf('admin_review_document')[0].args).toEqual({
      p_document: DOC_ID,
      p_accept: false,
      p_reason: 'Foto cortada, não dá para ler o número.',
    });
    expect((await screen.findAllByText(/Motivo da rejeição: Foto cortada/)).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Rejeitar documento' })).not.toBeInTheDocument();
  });

  it('accepts a document, with an optional note', async () => {
    await open();
    await user.click(screen.getByRole('button', { name: 'Aceitar documento' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar aceite' }));
    await waitFor(() => expect(callsOf('admin_review_document')).toHaveLength(1));
    expect(callsOf('admin_review_document')[0].args).toEqual({ p_document: DOC_ID, p_accept: true, p_reason: null });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Aceitar documento' })).not.toBeInTheDocument());
  });

  it('lets the administrator cancel a confirmation without calling the server', async () => {
    await open();
    await user.click(screen.getByRole('button', { name: 'Rejeitar documento' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('button', { name: 'Rejeitar documento' })).toBeInTheDocument();
    expect(callsOf('admin_review_document')).toHaveLength(0);
  });

  it('shows the server refusal in pt-BR when the review fails', async () => {
    const world = (await import('./fake')).current.world;
    world.isAdmin = true;
    fake.rpcs.admin_review_document = () => ({ data: null, error: { code: 'P0001', message: 'not_allowed' } });
    await open();
    await user.click(screen.getByRole('button', { name: 'Aceitar documento' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar aceite' }));
    expect(await screen.findByText('Você não tem permissão para fazer isso.')).toBeInTheDocument();
    // The confirmation stays open to try again
    expect(screen.getByRole('button', { name: 'Confirmar aceite' })).toBeInTheDocument();
  });

  it('confirms the registry only with a reason', async () => {
    await open();
    await user.click(screen.getByRole('button', { name: 'Confirmar registro' }));
    await user.click(screen.getAllByRole('button', { name: 'Confirmar registro' })[0]);
    expect(await screen.findByText('Informe o motivo. Ele fica no histórico da ação.')).toBeInTheDocument();
    expect(callsOf('admin_set_registry_status')).toHaveLength(0);

    await user.type(screen.getByLabelText('Como foi conferido (obrigatório)'), 'Consulta no portal do CRM-SP em 22/10, ativo.');
    await user.click(screen.getAllByRole('button', { name: 'Confirmar registro' })[0]);
    await waitFor(() => expect(callsOf('admin_set_registry_status')).toHaveLength(1));
    expect(callsOf('admin_set_registry_status')[0].args).toEqual({
      p_provider: PROVIDER_ID,
      p_occupation: 'cardiologista',
      p_status: 'confirmed',
      p_reason: 'Consulta no portal do CRM-SP em 22/10, ativo.',
    });
    expect(await screen.findByText('Registro confirmado pelo WorkEasy')).toBeInTheDocument();
  });

  it('rejects the registry with a reason', async () => {
    await open();
    await user.click(screen.getByRole('button', { name: 'Rejeitar registro' }));
    const form = screen.getByRole('form', { name: 'Rejeitar o CRM' });
    await user.click(within(form).getByRole('button', { name: 'Rejeitar registro' }));
    expect(within(form).getByText('Informe o motivo. Ele fica no histórico da ação.')).toBeInTheDocument();
    expect(callsOf('admin_set_registry_status')).toHaveLength(0);

    await user.type(within(form).getByLabelText('Motivo (obrigatório)'), 'Número não consta no conselho.');
    await user.click(within(form).getByRole('button', { name: 'Rejeitar registro' }));
    await waitFor(() => expect(callsOf('admin_set_registry_status')).toHaveLength(1));
    expect(callsOf('admin_set_registry_status')[0].args).toMatchObject({ p_status: 'rejected', p_reason: 'Número não consta no conselho.' });
    expect(await screen.findByText('Registro rejeitado')).toBeInTheDocument();
  });

  it('approves the provider with a reason', async () => {
    await open();
    await user.click(screen.getByRole('button', { name: 'Aprovar prestador' }));
    const form = screen.getByRole('form', { name: 'Aprovar este prestador' });
    await user.click(within(form).getByRole('button', { name: 'Confirmar' }));
    expect(within(form).getByText('Informe o motivo. Ele fica no histórico da ação.')).toBeInTheDocument();
    expect(callsOf('admin_set_provider_status')).toHaveLength(0);

    await user.type(within(form).getByLabelText('Motivo (obrigatório)'), 'Documentos e registro conferidos.');
    await user.click(within(form).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(callsOf('admin_set_provider_status')).toHaveLength(1));
    expect(callsOf('admin_set_provider_status')[0].args).toEqual({
      p_provider: PROVIDER_ID,
      p_status: 'approved',
      p_reason: 'Documentos e registro conferidos.',
    });
    expect(await screen.findByText('Aprovado')).toBeInTheDocument();
    // Approved providers are offered the suspension instead
    expect(screen.getByRole('button', { name: 'Suspender prestador' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprovar prestador' })).not.toBeInTheDocument();
  });

  it('suspends the provider only with a reason', async () => {
    await open();
    await user.click(screen.getByRole('button', { name: 'Suspender prestador' }));
    const form = screen.getByRole('form', { name: 'Suspender este prestador' });
    await user.click(within(form).getByRole('button', { name: 'Suspender' }));
    expect(callsOf('admin_set_provider_status')).toHaveLength(0);
    await user.type(within(form).getByLabelText('Motivo (obrigatório)'), 'Denúncia de cobrança fora do app.');
    await user.click(within(form).getByRole('button', { name: 'Suspender' }));
    await waitFor(() => expect(callsOf('admin_set_provider_status')).toHaveLength(1));
    expect(callsOf('admin_set_provider_status')[0].args).toMatchObject({ p_status: 'suspended' });
  });

  it('lists each document the policy asks for, with where it stands', async () => {
    await open();
    const list = screen.getByRole('heading', { name: 'Documentos que a política exige' }).parentElement as HTMLElement;
    const row = (label: string) => within(list).getByText(label).closest('li') as HTMLElement;
    expect(within(row('Documento com foto e selfie')).getByText('Enviado, a revisar')).toBeInTheDocument();
    expect(within(row('CPF ou CNPJ (MEI, Simples ou empresa)')).getByText('Aceito')).toBeInTheDocument();
    expect(within(row('Registro no conselho ou órgão da profissão')).getByText('Faltando')).toBeInTheDocument();
  });

  it('shows a rejected step with its reason', async () => {
    const world = (await import('./fake')).current.world;
    Object.assign(world.tables.provider_documents[0], { status: 'rejected', rejection_reason: 'Foto cortada.' });
    await open();
    const list = screen.getByRole('heading', { name: 'Documentos que a política exige' }).parentElement as HTMLElement;
    const row = within(list).getByText('Documento com foto e selfie').closest('li') as HTMLElement;
    expect(within(row).getByText('Rejeitado')).toBeInTheDocument();
    expect(within(row).getByText(/Motivo da rejeição: Foto cortada\./)).toBeInTheDocument();
  });

  it('keeps "Aprovar ocupação" off while a step of the policy is not accepted, and says why', async () => {
    await open();
    const button = screen.getByRole('button', { name: 'Aprovar ocupação' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(/Falta documento aceito para: Documento com foto e selfie; Registro no conselho/);
    await user.click(button);
    expect(screen.queryByRole('form', { name: 'Aprovar Cardiologista' })).not.toBeInTheDocument();
    expect(callsOf('admin_set_occupation_approval')).toHaveLength(0);
  });

  it('keeps it off for a rejected registry', async () => {
    const world = (await import('./fake')).current.world;
    for (const doc of world.tables.provider_documents) doc.status = 'accepted';
    world.tables.provider_documents.push({ ...world.tables.provider_documents[0], id: 'e0000000-0000-4000-8000-000000000007', step: 'registro_profissional' });
    world.tables.provider_occupations[0].registry_status = 'rejected';
    await open();
    const button = screen.getByRole('button', { name: 'Aprovar ocupação' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(/O registro está rejeitado/);
  });

  it('keeps it off for an occupation without a policy: with nothing to check, nothing is approved', async () => {
    const world = (await import('./fake')).current.world;
    world.tables.occupation_policies = [];
    await open();
    const button = screen.getByRole('button', { name: 'Aprovar ocupação' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(/não tem política no catálogo/);
    expect(callsOf('admin_set_occupation_approval')).toHaveLength(0);
  });

  it('explains the refusal of the database for an occupation without a policy', async () => {
    const world = (await import('./fake')).current.world;
    for (const doc of world.tables.provider_documents) doc.status = 'accepted';
    world.tables.provider_documents.push({
      ...world.tables.provider_documents[0],
      id: 'e0000000-0000-4000-8000-000000000007',
      step: 'registro_profissional',
      storage_path: `${PROVIDER_ID}/crm.pdf`,
    });
    await open();
    // The screen allows it (policy on file); the database then finds none and refuses
    world.tables.occupation_policies = [];
    await user.click(screen.getByRole('button', { name: 'Aprovar ocupação' }));
    const form = screen.getByRole('form', { name: 'Aprovar Cardiologista' });
    await user.type(within(form).getByLabelText('Motivo (obrigatório)'), 'Documentos conferidos');
    await user.click(within(form).getByRole('button', { name: 'Aprovar ocupação' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('não tem política no catálogo');
    expect(world.tables.provider_occupations[0].approved).toBe(false);
  });

  const acceptAll = async () => {
    const world = (await import('./fake')).current.world;
    for (const doc of world.tables.provider_documents) doc.status = 'accepted';
    world.tables.provider_documents.push({
      ...world.tables.provider_documents[0],
      id: 'e0000000-0000-4000-8000-000000000007',
      step: 'registro_profissional',
      storage_path: `${PROVIDER_ID}/crm.pdf`,
    });
    return world;
  };

  it('approves one occupation, with a reason, once every step is accepted', async () => {
    await acceptAll();
    await open();
    expect(screen.getByText('Todos os documentos que a política pede estão aceitos.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Aprovar ocupação' }));
    const form = screen.getByRole('form', { name: 'Aprovar Cardiologista' });
    await user.click(within(form).getByRole('button', { name: 'Aprovar ocupação' }));
    expect(within(form).getByText('Informe o motivo. Ele fica no histórico da ação.')).toBeInTheDocument();
    expect(callsOf('admin_set_occupation_approval')).toHaveLength(0);

    await user.type(within(form).getByLabelText('Motivo (obrigatório)'), 'CRM conferido no portal do CFM.');
    await user.click(within(form).getByRole('button', { name: 'Aprovar ocupação' }));
    await waitFor(() => expect(callsOf('admin_set_occupation_approval')).toHaveLength(1));
    expect(callsOf('admin_set_occupation_approval')[0].args).toEqual({
      p_provider: PROVIDER_ID,
      p_occupation: 'cardiologista',
      p_approved: true,
      p_reason: 'CRM conferido no portal do CFM.',
    });
    expect(await screen.findByText('Ocupação aprovada')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retirar aprovação' })).toBeInTheDocument();
    // The approval of the occupation is not the approval of the provider
    expect(callsOf('admin_set_provider_status')).toHaveLength(0);
  });

  it('shows the explained refusal when the database refuses what the screen allowed', async () => {
    await acceptAll();
    // Someone reverted an acceptance after the page loaded: the database still counts a missing step
    fake.rpcs.admin_set_occupation_approval = () => ({
      data: null,
      error: { code: 'P0001', message: 'documents_missing', details: 'registro_profissional,cnh' },
    });
    await open();
    await user.click(screen.getByRole('button', { name: 'Aprovar ocupação' }));
    const form = screen.getByRole('form', { name: 'Aprovar Cardiologista' });
    await user.type(within(form).getByLabelText('Motivo (obrigatório)'), 'Teste.');
    await user.click(within(form).getByRole('button', { name: 'Aprovar ocupação' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'O banco recusou a aprovação: falta documento aceito para Registro no conselho ou órgão da profissão; CNH na categoria adequada.',
    );
    // The form stays open to try again and nothing changed on the screen
    expect(screen.queryByText('Ocupação aprovada')).not.toBeInTheDocument();
  });

  it('explains the other refusals of the database in the words of the administration', async () => {
    fake.rpcs.admin_review_document = () => ({ data: null, error: { code: 'P0001', message: 'not_allowed', details: 'file missing' } });
    await open();
    await user.click(screen.getByRole('button', { name: 'Aceitar documento' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar aceite' }));
    expect(await screen.findByText(/O arquivo deste documento não está no armazenamento/)).toBeInTheDocument();
  });

  it('withdraws the approval of an occupation with a reason', async () => {
    const world = await acceptAll();
    world.tables.provider_occupations[0].approved = true;
    await open();
    await user.click(screen.getByRole('button', { name: 'Retirar aprovação' }));
    const form = screen.getByRole('form', { name: 'Retirar a aprovação de Cardiologista' });
    await user.type(within(form).getByLabelText('Motivo (obrigatório)'), 'Registro suspenso no conselho.');
    await user.click(within(form).getByRole('button', { name: 'Retirar aprovação' }));
    await waitFor(() => expect(callsOf('admin_set_occupation_approval')).toHaveLength(1));
    expect(callsOf('admin_set_occupation_approval')[0].args).toMatchObject({ p_approved: false });
    expect(await screen.findByText('Ocupação a aprovar')).toBeInTheDocument();
  });

  it('warns when an approved occupation lost the acceptance of a document', async () => {
    const world = (await import('./fake')).current.world;
    world.tables.provider_occupations[0].approved = true;
    await open();
    expect(screen.getByRole('status')).toHaveTextContent(/aprovada, mas hoje falta documento aceito para: Documento com foto e selfie; Registro no conselho/);
  });

  it('tells which occupations come in with the first approval of the provider, and which stay to approve', async () => {
    const world = await acceptAll();
    world.tables.provider_occupations.push({
      provider_id: PROVIDER_ID,
      occupation_slug: 'diarista',
      is_primary: false,
      registry_number: null,
      registry_uf: null,
      registry_status: 'not_required',
      approved: false,
    });
    world.tables.occupation_policies.push({
      occupation_slug: 'diarista',
      regulated: false,
      regulator_body: '',
      registry_name: '',
      legal_basis: 'LC 150/2015',
      verification: ['antecedentes'],
      sources: [],
    });
    await open();
    await user.click(screen.getByRole('button', { name: 'Aprovar prestador' }));
    const form = screen.getByRole('form', { name: 'Aprovar este prestador' });
    expect(within(form).getByText(/Entram junto, porque já têm todos os documentos aceitos: Cardiologista\./)).toBeInTheDocument();
    expect(within(form).getByText(/Ficam a aprovar: Diarista\./)).toBeInTheDocument();

    await user.type(within(form).getByLabelText('Motivo (obrigatório)'), 'Cadastro conferido.');
    await user.click(within(form).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(callsOf('admin_set_provider_status')).toHaveLength(1));
    // Like the database: the covered occupation came in, the other one did not
    const rows = (await import('./fake')).current.world.tables.provider_occupations;
    expect(rows.map(r => [r.occupation_slug, r.approved])).toEqual([
      ['cardiologista', true],
      ['diarista', false],
    ]);
    expect(await screen.findByText('1 de 2 ocupações aprovadas.', { exact: false })).toBeInTheDocument();
  });

  it('says that no occupation comes in with the approval when none has all its documents', async () => {
    await open();
    await user.click(screen.getByRole('button', { name: 'Aprovar prestador' }));
    const form = screen.getByRole('form', { name: 'Aprovar este prestador' });
    expect(within(form).getByText(/Nenhuma ocupação entra junto/)).toBeInTheDocument();
    expect(within(form).getByText(/Ficam a aprovar: Cardiologista\./)).toBeInTheDocument();
  });

  it('reverts the acceptance of a document, with a reason', async () => {
    await open();
    await user.click(screen.getByRole('button', { name: 'Desfazer aceite' }));
    const form = screen.getByRole('form', { name: 'Desfazer o aceite: CPF ou CNPJ (MEI, Simples ou empresa)' });
    await user.click(within(form).getByRole('button', { name: 'Desfazer aceite' }));
    expect(within(form).getByText('Informe o motivo. Ele fica no histórico da ação.')).toBeInTheDocument();
    expect(callsOf('admin_review_document')).toHaveLength(0);
    await user.type(within(form).getByLabelText('Motivo (obrigatório)'), 'Documento vencido.');
    await user.click(within(form).getByRole('button', { name: 'Desfazer aceite' }));
    await waitFor(() => expect(callsOf('admin_review_document')).toHaveLength(1));
    expect(callsOf('admin_review_document')[0].args).toEqual({ p_document: DOC2_ID, p_accept: false, p_reason: 'Documento vencido.' });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Desfazer aceite' })).not.toBeInTheDocument());
  });

  it('reactivates a suspended provider, with a reason, and says it approves nothing added later', async () => {
    const world = (await import('./fake')).current.world;
    world.tables.providers[0].status = 'suspended';
    await open();
    expect(screen.queryByRole('button', { name: 'Aprovar prestador' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suspender prestador' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reativar prestador' }));
    const form = screen.getByRole('form', { name: 'Reativar este prestador' });
    expect(within(form).getByText(/Reativar não aprova ocupações incluídas depois/)).toBeInTheDocument();
    await user.click(within(form).getByRole('button', { name: 'Reativar' }));
    expect(within(form).getByText('Informe o motivo. Ele fica no histórico da ação.')).toBeInTheDocument();
    expect(callsOf('admin_set_provider_status')).toHaveLength(0);
    await user.type(within(form).getByLabelText('Motivo (obrigatório)'), 'Denúncia improcedente.');
    await user.click(within(form).getByRole('button', { name: 'Reativar' }));
    await waitFor(() => expect(callsOf('admin_set_provider_status')).toHaveLength(1));
    expect(callsOf('admin_set_provider_status')[0].args).toEqual({ p_provider: PROVIDER_ID, p_status: 'approved', p_reason: 'Denúncia improcedente.' });
    expect(await screen.findByRole('button', { name: 'Suspender prestador' })).toBeInTheDocument();
  });

  it('suspends an approved provider that is in no queue, reached from the list', async () => {
    const world = (await import('./fake')).current.world;
    world.tables.providers[0].status = 'approved';
    world.tables.provider_occupations[0].approved = true;
    world.tables.admin_provider_queue = [];
    renderAdmin('/admin/prestadores');
    await user.selectOptions(await screen.findByLabelText('Situação'), 'approved');
    await user.click(await screen.findByRole('link', { name: /Dr\. Paulo Cardio/ }));
    await user.click(await screen.findByRole('button', { name: 'Suspender prestador' }));
    const form = screen.getByRole('form', { name: 'Suspender este prestador' });
    await user.type(within(form).getByLabelText('Motivo (obrigatório)'), 'Cobrança fora do app.');
    await user.click(within(form).getByRole('button', { name: 'Suspender' }));
    await waitFor(() => expect(callsOf('admin_set_provider_status')).toHaveLength(1));
    expect(await screen.findByText('Suspenso')).toBeInTheDocument();
  });

  it('reports a provider that does not exist', async () => {
    renderAdmin('/admin/prestadores/00000000-0000-4000-8000-000000000999');
    expect(await screen.findByText('Não encontramos o que você procurou.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Voltar para a lista de prestadores/ })).toHaveAttribute('href', '/admin/prestadores');
  });
});
