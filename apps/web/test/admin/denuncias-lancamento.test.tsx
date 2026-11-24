import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../lib/supabase', async () => {
  const { createAdminFake, current } = await import('./fake');
  return { supabase: createAdminFake(() => current.world), backendEnabled: true };
});

const { fake, renderAdmin, resetWorld, callsOf } = await import('./harness');
const { groupDailyFunnel, parsePilotSlugs } = await import('../../services/admin');

const REPORT = {
  id: 'rep-1',
  created_at: '2030-02-01T12:00:00Z',
  status: 'open',
  target_type: 'review',
  target_id: 'rev-1',
  target_user_id: 'b0000000-0000-4000-8000-000000000002',
  target_label: 'Ana Diarista',
  target_text: 'Texto ofensivo da avaliação.',
  reason: 'ofensivo',
  details: 'Xingou a profissional.',
  reporter_id: 'c0000000-0000-4000-8000-000000000003',
  resolution_note: null,
  resolved_at: null,
  open_reports_on_target: 2,
};

describe('/admin/denuncias', () => {
  beforeEach(() => {
    resetWorld();
  });

  it('shows the open reports with what was reported, the reason and how many reports the same content has', async () => {
    fake.rpcs.admin_list_reports = () => ({ data: [REPORT], error: null });
    renderAdmin('/admin/denuncias');
    expect(await screen.findByRole('heading', { name: 'Denúncias' })).toBeInTheDocument();
    const card = (await screen.findByText('Avaliação de Ana Diarista')).closest('li') as HTMLElement;
    expect(within(card).getByText('Texto ofensivo da avaliação.')).toBeInTheDocument();
    expect(within(card).getByText('Linguagem ofensiva ou discriminatória')).toBeInTheDocument();
    expect(within(card).getByText('Xingou a profissional.')).toBeInTheDocument();
    expect(within(card).getByText('2 denúncias abertas sobre o mesmo conteúdo')).toBeInTheDocument();
    // The queue starts on the open ones
    expect(callsOf('admin_list_reports')[0]?.args).toMatchObject({ p_status: 'open', p_offset: 0 });
  });

  it('closes a report with the note, and reads the queue again', async () => {
    fake.rpcs.admin_list_reports = () => ({ data: [REPORT], error: null });
    fake.rpcs.admin_resolve_report = () => ({ data: null, error: null });
    const user = userEvent.setup();
    renderAdmin('/admin/denuncias');
    await user.type(await screen.findByLabelText(/Anotação/), ' Avaliação tirada do ar. ');
    await user.click(screen.getByRole('button', { name: 'Encerrar com providência' }));
    await vi.waitFor(() => expect(callsOf('admin_list_reports').length).toBeGreaterThan(1));
    expect(callsOf('admin_resolve_report')[0]?.args).toEqual({ p_report: 'rep-1', p_status: 'actioned', p_note: 'Avaliação tirada do ar.' });
  });

  it('says so when there is nothing to review', async () => {
    fake.rpcs.admin_list_reports = () => ({ data: [], error: null });
    renderAdmin('/admin/denuncias');
    expect(await screen.findByText('Nenhuma denúncia nesta situação.')).toBeInTheDocument();
  });
});

describe('launch controls of /admin/configuracoes', () => {
  beforeEach(() => {
    resetWorld();
    fake.rpcs.admin_set_setting = () => ({ data: null, error: null });
  });

  it('saves the pilot neighborhoods as a list of slugs', async () => {
    const user = userEvent.setup();
    renderAdmin('/admin/configuracoes');
    const field = await screen.findByLabelText(/Identificadores dos bairros/);
    await user.type(field, 'Moema, vila-mariana,  moema');
    await user.click(screen.getByRole('button', { name: 'Salvar bairros do piloto' }));
    await vi.waitFor(() =>
      expect(callsOf('admin_set_setting').find(call => call.args?.p_key === 'pilot_neighborhoods')?.args).toEqual({
        p_key: 'pilot_neighborhoods',
        p_value: ['moema', 'vila-mariana'],
      }),
    );
  });

  it('refuses a neighborhood that does not exist before sending anything', async () => {
    const user = userEvent.setup();
    renderAdmin('/admin/configuracoes');
    await user.type(await screen.findByLabelText(/Identificadores dos bairros/), 'moema, bairro-inventado');
    expect(screen.getByText('Bairro não encontrado: bairro-inventado.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar bairros do piloto' })).toBeDisabled();
    expect(callsOf('admin_set_setting')).toEqual([]);
  });

  it('opens the care line only after a second, explicit confirmation', async () => {
    const user = userEvent.setup();
    renderAdmin('/admin/configuracoes');
    await user.click(await screen.findByRole('button', { name: 'Abrir a linha Cuidado' }));
    expect(callsOf('admin_set_setting')).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Confirmar: abrir para todas as contas' }));
    await vi.waitFor(() => expect(callsOf('admin_set_setting')[0]?.args).toEqual({ p_key: 'care_line_open', p_value: true }));
  });
});

describe('admin helpers', () => {
  it('reads the pilot list however it is typed', () => {
    expect(parsePilotSlugs(' Moema ,vila-mariana;saude\ncampo-belo  moema,,')).toEqual(['moema', 'vila-mariana', 'saude', 'campo-belo']);
    expect(parsePilotSlugs('   ')).toEqual([]);
  });

  it('groups the daily funnel by day, newest first, and ignores events it does not know', () => {
    expect(
      groupDailyFunnel([
        { day: '2030-02-01', event: 'request_created', events: '3' },
        { day: '2030-02-02', event: 'proposal_sent', events: 2 },
        { day: '2030-02-01', event: 'proposal_sent', events: 1 },
        { day: '2030-02-02', event: 'something_new', events: 9 },
      ]),
    ).toEqual([
      { day: '2030-02-02', counts: { proposal_sent: 2 } },
      { day: '2030-02-01', counts: { request_created: 3, proposal_sent: 1 } },
    ]);
  });
});
