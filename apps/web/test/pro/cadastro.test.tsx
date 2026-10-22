import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  NEIGHBORHOODS,
  baseTables,
  isEq,
  occupationRow,
  ok,
  policyRow,
  providerRow,
  ruleError,
  signInProvider,
  type ProFake,
  type TableCall,
} from './fake';

vi.mock('../../lib/supabase', async () => {
  const { createProFake } = await import('./fake');
  return { supabase: createProFake(), backendEnabled: true };
});

const { supabase } = await import('../../lib/supabase');
const { renderPro } = await import('./render');
const fake = supabase as unknown as ProFake;

const inValues = (call: TableCall): string[] => (call.filters.find(([op]) => op === 'in')?.[2] as string[] | undefined) ?? [];

const POLICIES = [
  policyRow('cardiologista', {
    regulated: true,
    regulator_body: 'CFM/CRM',
    registry_name: 'CRM',
    verification: ['documento_selfie', 'cadastro_fiscal', 'registro_profissional'],
    price_units: ['sessao', 'hora'],
  }),
  policyRow('diarista', { verification: ['documento_selfie', 'antecedentes'], price_units: ['dia'], labor_lock: true }),
];

let provider: ReturnType<typeof providerRow> | null;
let occupations: ReturnType<typeof occupationRow>[];
let documents: Array<Record<string, unknown>>;
let selected: string[];

const pdf = (name = 'documento.pdf') => new File(['%PDF-1.4 teste'], name, { type: 'application/pdf' });

beforeEach(() => {
  fake.reset();
  signInProvider(fake);
  provider = null;
  occupations = [];
  documents = [];
  selected = [];
  fake.tables = {
    ...baseTables({ provider: null }),
    providers: (call: TableCall) => {
      if (call.op === 'update' && provider) provider = { ...provider, ...(call.payload as object) };
      return ok(provider);
    },
    occupation_policies: (call: TableCall) => ok(POLICIES.filter(row => inValues(call).includes(row.occupation_slug as string))),
    provider_occupations: () => ok(occupations),
    provider_neighborhoods: (call: TableCall) => {
      if (call.op === 'insert') selected.push((call.payload as { neighborhood_id: string }).neighborhood_id);
      if (call.op === 'delete') {
        const id = call.filters.find(([, column]) => column === 'neighborhood_id')?.[2];
        selected = selected.filter(item => item !== id);
      }
      return ok(selected.map(id => ({ neighborhood_id: id })));
    },
    provider_documents: (call: TableCall) => {
      if (call.op === 'insert') {
        const row = { id: `doc-${documents.length + 1}`, status: 'submitted', rejection_reason: null, expires_at: null, created_at: '2026-10-22T12:00:00Z', ...(call.payload as object) };
        documents = [row, ...documents];
        return ok(row);
      }
      if (call.op === 'delete') {
        documents = documents.filter(doc => !isEq(call, 'id', doc.id));
        return ok(null);
      }
      return ok(documents);
    },
  };
});

describe('/pro/cadastro: becoming a provider', () => {
  const becomeAs = (registry = true) => {
    fake.rpcs.become_provider = args => {
      if (registry && !args?.p_registry_number) return ruleError('registry_required');
      // A draft of someone else holds this address (only the database can know)
      if (args?.p_slug === 'ana-souza') return ruleError('slug_taken');
      provider = providerRow({ status: 'draft', slug: args?.p_slug, display_name: args?.p_display_name });
      occupations = [
        occupationRow(String(args?.p_occupation), {
          registry_number: args?.p_registry_number ?? null,
          registry_uf: args?.p_registry_uf ?? null,
          registry_status: args?.p_registry_number ? 'informed' : 'not_required',
          approved: false,
        }),
      ];
      return ok('prov-1');
    };
  };

  it('suggests the page address, checks it, asks for the registry the policy requires and translates the refusals', async () => {
    becomeAs();
    fake.rpcs.slug_available = args => ok(args?.p_slug !== 'ocupado');
    const user = userEvent.setup();
    renderPro('/pro/cadastro');

    await user.type(await screen.findByLabelText('Nome de exibição'), 'Ana Souza');
    expect(screen.getByLabelText('Endereço da sua página')).toHaveValue('ana-souza');

    // An address held by another provider (approved or still a draft)
    await user.clear(screen.getByLabelText('Endereço da sua página'));
    await user.type(screen.getByLabelText('Endereço da sua página'), 'ocupado');
    await user.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(await screen.findByText(/Este endereço não está disponível/)).toBeInTheDocument();
    expect(fake.rpcCalls.find(call => call.name === 'slug_available')?.args).toEqual({ p_slug: 'ocupado' });

    await user.clear(screen.getByLabelText('Endereço da sua página'));
    await user.type(screen.getByLabelText('Endereço da sua página'), 'ana-souza');
    await user.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(await screen.findByText(/Este endereço está livre/)).toBeInTheDocument();

    // No registry field until the occupation asks for it
    expect(screen.queryByLabelText('Número do registro')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Ocupação principal'), 'cardiologista');
    expect(await screen.findByLabelText('Número do registro')).toBeInTheDocument();
    expect(screen.getByText(/Esta ocupação exige o número do registro \(CRM\)/)).toBeInTheDocument();

    // The database refuses without the number: translated, nothing created
    await user.click(screen.getByRole('button', { name: 'Criar cadastro' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta profissão exige o número de registro');
    expect(provider).toBeNull();

    // The address was taken meanwhile by a draft: the database answers slug_taken
    await user.type(screen.getByLabelText('Número do registro'), '123456');
    await user.selectOptions(screen.getByLabelText('UF'), 'SP');
    await user.click(screen.getByRole('button', { name: 'Criar cadastro' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Este endereço de página já está em uso');

    await user.clear(screen.getByLabelText('Endereço da sua página'));
    await user.type(screen.getByLabelText('Endereço da sua página'), 'dra-ana');
    await user.click(screen.getByRole('button', { name: 'Criar cadastro' }));

    // The form gives way to the steps, with the status always shown
    expect(await screen.findByRole('heading', { name: '2. Bairros atendidos' })).toBeInTheDocument();
    const calls = fake.rpcCalls.filter(call => call.name === 'become_provider');
    expect(calls.at(-1)?.args).toEqual({
      p_display_name: 'Ana Souza',
      p_slug: 'dra-ana',
      p_occupation: 'cardiologista',
      p_registry_number: '123456',
      p_registry_uf: 'SP',
    });
    expect(await screen.findByText(/CRM 123456\/SP/)).toBeInTheDocument();
    expect(screen.getByText('Informado (ainda não confirmado)')).toBeInTheDocument();
    expect(screen.queryByText(/verificado/i)).not.toBeInTheDocument();
  });

  it('does not ask for a registry when the policy does not', async () => {
    becomeAs(false);
    fake.rpcs.slug_available = () => ok(true);
    const user = userEvent.setup();
    renderPro('/pro/cadastro');
    await user.type(await screen.findByLabelText('Nome de exibição'), 'Maria Limpeza');
    await user.selectOptions(screen.getByLabelText('Ocupação principal'), 'diarista');
    expect(await screen.findByText('Esta ocupação não pede número de registro profissional.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Número do registro')).not.toBeInTheDocument();
  });
});

describe('/pro/cadastro: steps of a draft provider', () => {
  const draft = (occupation = 'cardiologista') => {
    provider = providerRow({ status: 'draft' });
    occupations = [occupationRow(occupation, occupation === 'cardiologista' ? { registry_number: '123456', registry_uf: 'SP', registry_status: 'informed', approved: false } : { approved: false })];
  };

  it('lets the provider turn off new platform requests from the page data', async () => {
    draft();
    const user = userEvent.setup();
    renderPro('/pro/cadastro');
    const toggle = await screen.findByRole('checkbox', { name: 'Receber pedidos novos de clientes pelo WorkEasy' });
    expect(toggle).toBeChecked();
    await user.click(toggle);
    await user.click(screen.getByRole('button', { name: 'Salvar dados' }));
    expect(await screen.findByText('Dados salvos.')).toBeInTheDocument();
    expect(fake.tableCalls.find(call => call.table === 'providers' && call.op === 'update')?.payload).toEqual({
      display_name: 'Ana Souza',
      bio: null,
      accepts_platform_requests: false,
    });
    expect(provider?.accepts_platform_requests).toBe(false);
  });

  it('marks and unmarks the neighborhoods served', async () => {
    draft();
    fake.tables.neighborhoods = () => ok(NEIGHBORHOODS);
    const user = userEvent.setup();
    renderPro('/pro/cadastro');

    expect(await screen.findByText('Nenhum bairro escolhido.')).toBeInTheDocument();
    await user.click(await screen.findByRole('checkbox', { name: /Lapa/ }));
    expect(await screen.findByText('1 bairro escolhido.')).toBeInTheDocument();
    const insert = fake.tableCalls.find(call => call.table === 'provider_neighborhoods' && call.op === 'insert');
    expect(insert?.payload).toEqual({ provider_id: 'prov-1', neighborhood_id: 'nb-lapa' });

    await user.click(screen.getByRole('checkbox', { name: /Pinheiros/ }));
    expect(await screen.findByText('2 bairros escolhidos.')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: /Lapa/ }));
    expect(await screen.findByText('1 bairro escolhido.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Buscar bairro'), 'santa');
    expect(screen.getByRole('checkbox', { name: /Santana/ })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Pinheiros/ })).not.toBeInTheDocument();
  });

  it('asks for the documents the policy requires, uploads to the private bucket and records them', async () => {
    draft();
    const user = userEvent.setup();
    renderPro('/pro/cadastro');

    // Steps of the cardiologista policy, none sent yet
    const list = await screen.findByText('Documento com foto e selfie');
    expect(list).toBeInTheDocument();
    expect(screen.getByText('CPF ou CNPJ (MEI, Simples ou empresa)')).toBeInTheDocument();
    expect(screen.getByText('Registro no conselho ou órgão da profissão')).toBeInTheDocument();
    expect(screen.queryByText('Certidão de antecedentes criminais')).not.toBeInTheDocument();
    expect(screen.getAllByText('Não enviado')).toHaveLength(3);

    await user.upload(screen.getByLabelText(/Enviar arquivo.*Documento com foto e selfie/), pdf());

    await waitFor(() => expect(fake.uploads).toHaveLength(1));
    expect(fake.uploads[0].bucket).toBe('provider-documents');
    expect(fake.uploads[0].path).toMatch(/^prov-1\/documento_selfie-[a-z0-9]+-[a-z0-9]+\.pdf$/);
    expect(fake.uploads[0].options).toMatchObject({ contentType: 'application/pdf', upsert: false });
    const insert = fake.tableCalls.find(call => call.table === 'provider_documents' && call.op === 'insert');
    expect(insert?.payload).toEqual({ provider_id: 'prov-1', step: 'documento_selfie', storage_path: fake.uploads[0].path });

    expect(await screen.findByText('Enviado, aguardando análise', { selector: 'span.inline-block' })).toBeInTheDocument();
    expect(screen.getAllByText('Não enviado')).toHaveLength(2);
  });

  it('refuses a file of the wrong type or size before sending it', async () => {
    draft();
    const user = userEvent.setup({ applyAccept: false });
    renderPro('/pro/cadastro');
    const input = await screen.findByLabelText(/Enviar arquivo.*Documento com foto e selfie/);

    await user.upload(input, new File(['texto'], 'nota.txt', { type: 'text/plain' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Envie uma foto (JPG, PNG, WebP ou HEIC) ou um PDF.');

    const big = new File(['x'], 'grande.pdf', { type: 'application/pdf' });
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 });
    await user.upload(input, big);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('O arquivo precisa ter até 10 MB.'));
    expect(fake.uploads).toEqual([]);
  });

  it('removes the file again when recording the document fails', async () => {
    draft();
    const base = fake.tables.provider_documents;
    fake.tables.provider_documents = (call: TableCall) => (call.op === 'insert' ? { data: null, error: { code: '42501', message: 'rls' } } : base(call));
    const user = userEvent.setup();
    renderPro('/pro/cadastro');
    await user.upload(await screen.findByLabelText(/Enviar arquivo.*CPF ou CNPJ/), pdf());
    expect(await screen.findByRole('alert')).toHaveTextContent('Você não tem permissão');
    expect(fake.removed).toEqual([{ bucket: 'provider-documents', paths: [fake.uploads[0].path] }]);
  });

  it('shows a rejected document with the reason and lets the provider send another', async () => {
    draft();
    documents = [
      { id: 'doc-9', step: 'cadastro_fiscal', storage_path: 'prov-1/cadastro_fiscal-x.pdf', status: 'rejected', rejection_reason: 'Documento ilegível', expires_at: null, created_at: '2026-10-20T12:00:00Z' },
    ];
    renderPro('/pro/cadastro');
    expect(await screen.findByText('Motivo da recusa: Documento ilegível')).toBeInTheDocument();
    expect(screen.getByLabelText(/Enviar outro arquivo.*CPF ou CNPJ/)).toBeEnabled();
  });

  it('removes a document nobody has reviewed yet, after confirming', async () => {
    draft();
    documents = [
      { id: 'doc-1', step: 'documento_selfie', storage_path: 'prov-1/documento_selfie-a.pdf', status: 'submitted', rejection_reason: null, expires_at: null, created_at: '2026-10-20T12:00:00Z' },
      { id: 'doc-2', step: 'cadastro_fiscal', storage_path: 'prov-1/cadastro_fiscal-a.pdf', status: 'accepted', rejection_reason: null, expires_at: null, created_at: '2026-10-20T12:00:00Z' },
    ];
    const user = userEvent.setup();
    renderPro('/pro/cadastro');
    // Only the submitted one can be removed
    await user.click(await screen.findByRole('button', { name: 'Remover' }));
    await user.click(screen.getByRole('button', { name: 'Sim, remover' }));
    await waitFor(() => expect(fake.tableCalls.some(call => call.table === 'provider_documents' && call.op === 'delete')).toBe(true));
    await waitFor(() => expect(fake.removed).toEqual([{ bucket: 'provider-documents', paths: ['prov-1/documento_selfie-a.pdf'] }]));
  });

  it('records the consent before the certificate of criminal record is sent', async () => {
    draft('diarista');
    fake.tables.consents = (call: TableCall) =>
      call.op === 'insert'
        ? ok({ id: 'c-new', at: '2026-10-22T12:00:00Z', ...(call.payload as object) })
        : ok(baseTables({ provider: null }).consents({ table: 'consents', op: 'select', filters: [] }).data);
    const user = userEvent.setup();
    renderPro('/pro/cadastro');

    const input = await screen.findByLabelText(/Enviar arquivo.*Certidão de antecedentes/);
    expect(input).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /Autorizo o WorkEasy a usar a certidão/ }));
    expect(input).toBeEnabled();
    await user.upload(input, pdf('certidao.pdf'));

    await waitFor(() => expect(fake.uploads).toHaveLength(1));
    const consent = fake.tableCalls.find(call => call.table === 'consents' && call.op === 'insert');
    // user_id and at belong to the server: the insert grant is by column
    expect(consent?.payload).toMatchObject({ purpose: 'background_check', granted: true });
    expect(consent?.payload).not.toHaveProperty('user_id');
  });

  it('shows documents_missing translated, with the steps lacking, then the status after the review request', async () => {
    draft();
    let status = 'draft';
    fake.tables.providers = () => ok({ ...provider, status });
    fake.rpcs.submit_provider_for_review = () => ruleError('documents_missing', 'cadastro_fiscal,registro_profissional');
    const user = userEvent.setup();
    renderPro('/pro/cadastro');

    expect(await screen.findByText('Rascunho', { selector: 'span.inline-block' })).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Enviar para análise' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Faltam documentos obrigatórios para enviar o cadastro para análise.');
    const missing = alert.parentElement as HTMLElement;
    expect(within(missing).getByText('CPF ou CNPJ (MEI, Simples ou empresa)', { selector: 'li' })).toBeInTheDocument();
    expect(within(missing).getByText('Registro no conselho ou órgão da profissão', { selector: 'li' })).toBeInTheDocument();

    fake.rpcs.submit_provider_for_review = () => {
      status = 'pending_review';
      return ok('pending_review');
    };
    await user.click(screen.getByRole('button', { name: 'Enviar para análise' }));
    expect(await screen.findByText('Cadastro enviado para análise.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Enviar para análise' })).not.toBeInTheDocument());
    expect(screen.getAllByText('Em análise', { selector: 'span.inline-block' }).length).toBeGreaterThan(0);
    expect(screen.getByText(/Sua documentação está em análise pela equipe do WorkEasy/)).toBeInTheDocument();
  });

  it('shows the suspended status and does not offer to submit again', async () => {
    draft();
    provider = providerRow({ status: 'suspended' });
    renderPro('/pro/cadastro');
    expect(await screen.findByText('Suspenso', { selector: 'span.inline-block' })).toBeInTheDocument();
    expect(screen.getByText(/Fale com o suporte do WorkEasy para entender o motivo/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar para análise' })).not.toBeInTheDocument();
  });
});
