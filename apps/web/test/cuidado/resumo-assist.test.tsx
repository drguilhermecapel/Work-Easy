import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { functionData, functionError } from '../pro/fake';
import { CAREGIVER_ID, FAMILY_ID, household, newWorld, recipient, shiftRow, useWorld, type CareWorld, type FakeSupabase } from './fake';

vi.mock('../../lib/supabase', async () => {
  const { createFakeSupabase } = await import('../web/fakeSupabase');
  return { supabase: createFakeSupabase(), backendEnabled: true };
});

const { supabase } = await import('../../lib/supabase');
const { renderCare } = await import('./render');
const fake = supabase as unknown as FakeSupabase;

let world: CareWorld;

const SUMMARY = {
  period: { from: '2030-01-09', to: '2030-01-16' },
  shifts: 2,
  reports_used: 2,
  reports_omitted: 0,
  reports_missing: 0,
  reports_truncated: 0,
  ai_generated: true,
  notice: 'Resumo automático feito por inteligência artificial a partir dos relatórios dos plantões. Pode conter erros e não é avaliação de saúde.',
  summary: {
    overview: 'Houve 2 plantões com relatório e a rotina seguiu tranquila.',
    activities: ['A pessoa cuidada passeou no jardim com o cuidador.'],
    routine: ['Almoço com arroz e frango.', 'O humor foi descrito como animado.'],
    follow_up: ['Perguntar ao cuidador se a pessoa cuidada gostou da novela.'],
  },
  mentions_health: false,
  health_notice: null,
};

const startedWeek = () => {
  world.households = [household()];
  world.recipients = [recipient()];
  world.shifts = [shiftRow({ id: 'shift-1', status: 'completed', provider_id: CAREGIVER_ID })];
  world.reports = [{ id: 'r-1', shift_id: 'shift-1', provider_id: CAREGIVER_ID, meals: 'Sopa no jantar', activities: null, mood: null, notes: null, created_at: '' }];
};

const open = async () => {
  renderCare('/cuidado/relatorios');
  return screen.findByRole('button', { name: 'Resumo da semana' });
};

beforeEach(() => {
  sessionStorage.clear();
  fake.reset();
  world = newWorld(FAMILY_ID);
  useWorld(fake, world);
  fake.functionsHandlers['care-summary'] = () => functionData(SUMMARY);
});

describe('/cuidado/relatorios: Resumo da semana', () => {
  it('says what is sent to an AI service and what is not, before anything is sent', async () => {
    startedWeek();
    await open();
    const notice = screen.getByRole('note', { name: '' });
    expect(notice).toHaveTextContent('enviados a um serviço de inteligência artificial de terceiros');
    expect(notice).toHaveTextContent('nomes cadastrados da pessoa cuidada e do cuidador são trocados por termos neutros');
    expect(notice).toHaveTextContent('relatórios que citam saúde não são enviados');
    expect(notice).toHaveTextContent('não é avaliação de saúde');
    expect(notice).toHaveTextContent('ligue 192 (SAMU) ou procure um médico');
    expect(fake.functionCalls).toEqual([]);
  });

  it('asks for the summary of the house and shows it, with the notice of the server', async () => {
    startedWeek();
    const user = userEvent.setup();
    await user.click(await open());

    expect(await screen.findByRole('heading', { name: 'Resumo de 09/01/2030 a 16/01/2030' })).toBeInTheDocument();
    expect(fake.functionCalls).toEqual([{ name: 'care-summary', body: { household_id: 'house-1' } }]);
    expect(screen.getByText('Houve 2 plantões com relatório e a rotina seguiu tranquila.')).toBeInTheDocument();
    for (const title of ['Atividades', 'Rotina', 'O que combinar ou perguntar ao cuidador']) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    }
    expect(screen.getByText('A pessoa cuidada passeou no jardim com o cuidador.')).toBeInTheDocument();
    expect(screen.getByText('Almoço com arroz e frango.')).toBeInTheDocument();
    expect(screen.getByText('Perguntar ao cuidador se a pessoa cuidada gostou da novela.')).toBeInTheDocument();
    expect(screen.getByText('Feito a partir de 2 relatórios de 2 plantões.')).toBeInTheDocument();
    expect(screen.getByText(SUMMARY.notice)).toBeInTheDocument();
    // the reports themselves stay on the screen below the summary
    expect(screen.getByText('Sopa no jantar')).toBeInTheDocument();
    // nothing was written to the database
    expect(fake.tableCalls.filter(call => call.op !== 'select')).toEqual([]);
  });

  it('shows the guidance of the server when a report touches health, and counts what was left out', async () => {
    startedWeek();
    fake.functionsHandlers['care-summary'] = () =>
      functionData({
        ...SUMMARY,
        reports_omitted: 1,
        reports_missing: 2,
        reports_truncated: 1,
        mentions_health: true,
        health_notice: 'Há relatórios que citam saúde ou bem-estar. O WorkEasy não interpreta saúde. Para qualquer preocupação, ligue 192 (SAMU) ou procure um médico.',
      });
    const user = userEvent.setup();
    await user.click(await open());
    const result = (await screen.findByRole('heading', { name: /Resumo de/ })).parentElement as HTMLElement;
    const guidance = within(result).getByRole('note');
    expect(guidance).toHaveTextContent('ligue 192 (SAMU) ou procure um médico');
    expect(result).toHaveTextContent(
      '2 plantões sem relatório enviado; 1 relatório não enviado à IA porque cita saúde; 1 plantão ficou de fora por excesso de texto.',
    );
  });

  it.each([
    [{ shifts: 0, reports_used: 0 }, 'Não houve plantões iniciados nos últimos 7 dias, então não há o que resumir.'],
    [{ shifts: 2, reports_used: 0, reports_missing: 2 }, 'Nenhum relatório foi enviado nos últimos 7 dias, então não há o que resumir.'],
    [{ shifts: 2, reports_used: 0, reports_omitted: 2, mentions_health: true, health_notice: 'Para qualquer preocupação, ligue 192 (SAMU) ou procure um médico.' },
      'Os relatórios desta semana citam saúde e não foram enviados à IA. Leia-os abaixo.'],
  ])('says why there is no summary: %j', async (over, message) => {
    startedWeek();
    fake.functionsHandlers['care-summary'] = () => functionData({ ...SUMMARY, summary: null, ...over });
    const user = userEvent.setup();
    await user.click(await open());
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Atividades' })).not.toBeInTheDocument();
  });

  it.each([
    [503, 'assist_not_configured', 'A IA ainda não está ativada neste ambiente. Leia os relatórios abaixo.'],
    [429, 'assist_rate_limited', 'Você usou todos os pedidos de IA desta hora. Tente de novo mais tarde. Leia os relatórios abaixo.'],
    [422, 'assist_declined', 'A IA não conseguiu usar este texto. Leia os relatórios abaixo.'],
    [502, 'assist_unavailable', 'A IA não conseguiu responder agora. Leia os relatórios abaixo.'],
    [504, 'assist_timeout', 'A IA demorou para responder. Leia os relatórios abaixo.'],
    [403, 'not_allowed', 'Você não tem permissão para fazer isso.'],
  ])('explains an answer %i %s and keeps the reports on the screen', async (status, code, message) => {
    startedWeek();
    fake.functionsHandlers['care-summary'] = () => functionError(status, code);
    const user = userEvent.setup();
    await user.click(await open());
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByRole('heading', { name: /Resumo de/ })).not.toBeInTheDocument();
    expect(screen.getByText('Sopa no jantar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resumo da semana' })).toBeEnabled();
  });

  it('drops a summary that is shown when the next request fails', async () => {
    startedWeek();
    const user = userEvent.setup();
    await user.click(await open());
    await screen.findByRole('heading', { name: /Resumo de/ });
    fake.functionsHandlers['care-summary'] = () => functionError(502, 'assist_unavailable');
    await user.click(screen.getByRole('button', { name: 'Resumo da semana' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Resumo de/ })).not.toBeInTheDocument();
  });

  it('refuses an answer it cannot read', async () => {
    startedWeek();
    fake.functionsHandlers['care-summary'] = () => functionData({ summary: 'texto solto' });
    const user = userEvent.setup();
    await user.click(await open());
    expect(await screen.findByRole('alert')).toHaveTextContent('Erro no servidor. Tente de novo em alguns minutos.');
  });

  it('offers one button per house when the family has several, and asks for the one chosen', async () => {
    startedWeek();
    world.households = [household(), household({ id: 'house-2', name: 'Casa da praia' })];
    world.shifts.push(shiftRow({ id: 'shift-2', household_id: 'house-2', status: 'completed', provider_id: CAREGIVER_ID }));
    const user = userEvent.setup();
    renderCare('/cuidado/relatorios');
    await user.click(await screen.findByRole('button', { name: 'Resumo da semana: Casa da praia' }));
    expect(await screen.findByRole('heading', { name: /Resumo de/ })).toBeInTheDocument();
    expect(fake.functionCalls).toEqual([{ name: 'care-summary', body: { household_id: 'house-2' } }]);
    expect(screen.getByText('Casa: Casa da praia')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resumo da semana: Casa da vó' })).toBeInTheDocument();
  });

  it('is not offered while there is no report to summarize', async () => {
    world.households = [household()];
    renderCare('/cuidado/relatorios');
    expect(await screen.findByText(/Ainda não há relatórios/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Resumo da semana/ })).not.toBeInTheDocument();
  });
});
