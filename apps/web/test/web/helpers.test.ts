import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { formatTstzRange, parseTstzRange } from '../../lib/tstzrange';
import { formatPhoneBR, toE164BR, toE164MobileBR } from '../../lib/phone';
import { formatDateBR, saoPauloDateTime, todayInSaoPaulo, validityEnd } from '../../lib/timezone';
import { useAsync } from '../../lib/useAsync';
import { clearRequestDraft, readRequestDraft, saveRequestDraft } from '../../lib/requestDraft';
import { isExpired } from '../../pages/cliente/labels';
import { normalizeTarget } from '../../services/auth';
import { safeNext } from '../../lib/navigation';
import { DEFAULT_SETTINGS, parseSettings } from '../../config/features';
import { buildConciergeMessage, conciergeLink } from '../../pages/cliente/concierge';

describe('web helpers', () => {
  it('formats and parses tstzrange', () => {
    const period = { start: new Date('2030-01-15T12:00:00Z'), end: new Date('2030-01-15T15:00:00Z') };
    expect(formatTstzRange(period)).toBe('[2030-01-15T12:00:00.000Z,2030-01-15T15:00:00.000Z)');
    expect(() => formatTstzRange({ start: period.end, end: period.start })).toThrow();
    const parsed = parseTstzRange('["2030-01-15 12:00:00+00","2030-01-15 15:00:00+00")');
    expect(parsed?.start.toISOString()).toBe('2030-01-15T12:00:00.000Z');
    expect(parsed?.end.toISOString()).toBe('2030-01-15T15:00:00.000Z');
    expect(parseTstzRange('empty')).toBeNull();
  });

  it('normalizes Brazilian phones', () => {
    expect(toE164BR('(11) 98765-4321')).toBe('+5511987654321');
    expect(toE164BR('+55 11 98765-4321')).toBe('+5511987654321');
    expect(toE164BR('11 3456-7890')).toBe('+551134567890');
    expect(toE164BR('98765-4321')).toBeNull();
    expect(toE164BR('11 88765-43210')).toBeNull();
    expect(formatPhoneBR('+5511987654321')).toBe('(11) 98765-4321');
    expect(toE164BR('+5511987654321')).toBe('+5511987654321'); // idempotent
  });

  it('accepts only mobile numbers for the SMS code', () => {
    expect(toE164MobileBR('(11) 98765-4321')).toBe('+5511987654321');
    expect(toE164MobileBR('11 3456-7890')).toBeNull();
    expect(normalizeTarget({ kind: 'phone', phone: '(11) 98765-4321' })).toEqual({ kind: 'phone', phone: '+5511987654321' });
    expect(() => normalizeTarget({ kind: 'phone', phone: '11 3456-7890' })).toThrow(/celular/);
    expect(() => normalizeTarget({ kind: 'phone', phone: '98765' })).toThrow(expect.objectContaining({ code: 'invalid_phone' }));
  });

  it('accepts only same-app return paths', () => {
    expect(safeNext('/pedido')).toBe('/pedido');
    expect(safeNext('//evil.example')).toBe('/conta');
    expect(safeNext('https://evil.example')).toBe('/conta');
    expect(safeNext(null, '/')).toBe('/');
  });

  it('parses public platform settings with safe defaults', () => {
    expect(parseSettings([])).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.escrowEnabled).toBe(false);
    expect(DEFAULT_SETTINGS.commissionEnabled).toBe(false);
    const settings = parseSettings([
      { key: 'escrow_enabled', value: true },
      { key: 'proposal_limit', value: 5 },
      { key: 'commission_bps', value: 'not a number' },
      { key: 'internal_key', value: 1 },
    ]);
    expect(settings.escrowEnabled).toBe(true);
    expect(settings.proposalLimit).toBe(5);
    expect(settings.commissionBps).toBe(DEFAULT_SETTINGS.commissionBps);
  });

  it('builds the concierge WhatsApp link', () => {
    const message = buildConciergeMessage({
      occupationName: 'Diarista',
      neighborhoodName: 'Pinheiros',
      city: 'São Paulo',
      description: 'Faxina de apartamento & janelas',
      when: 'sábado',
      urgent: true,
      name: '',
    });
    expect(message).toBe(
      'Olá! Quero fazer um pedido pelo WorkEasy.\n\nServiço: Diarista\nBairro: Pinheiros (São Paulo)\nQuando: sábado\nÉ urgente.\nDescrição: Faxina de apartamento & janelas',
    );
    const link = conciergeLink('+55 (11) 99999-9999', message);
    expect(link.startsWith('https://wa.me/5511999999999?text=')).toBe(true);
    expect(new URL(link).searchParams.get('text')).toBe(message);
    expect(link).not.toContain('&janelas');
  });
});

describe('São Paulo time', () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
    vi.useRealTimers();
  });

  it('reads typed day and time as São Paulo wall time, whatever the device zone', () => {
    for (const zone of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles', 'America/Sao_Paulo']) {
      process.env.TZ = zone;
      expect(saoPauloDateTime('2030-01-15', '09:00')?.toISOString(), zone).toBe('2030-01-15T12:00:00.000Z');
      expect(saoPauloDateTime('2030-01-15', '23:30')?.toISOString(), zone).toBe('2030-01-16T02:30:00.000Z');
    }
    expect(saoPauloDateTime('2030-02-31', '09:00')).toBeNull();
    expect(saoPauloDateTime('2030-01-15', '25:00')).toBeNull();
    expect(saoPauloDateTime('', '09:00')).toBeNull();
  });

  it('gives today as the São Paulo date', () => {
    process.env.TZ = 'Asia/Tokyo';
    // 02:00 UTC is 23:00 of the day before in São Paulo (and 11:00 in Tokyo)
    expect(todayInSaoPaulo(new Date('2030-01-15T02:00:00Z'))).toBe('2030-01-14');
    expect(todayInSaoPaulo(new Date('2030-01-15T03:00:00Z'))).toBe('2030-01-15');
  });

  it('treats a plain valid_until date as valid through the whole day in São Paulo', () => {
    process.env.TZ = 'UTC';
    expect(formatDateBR('2030-10-20')).toBe('20/10/2030');
    expect(validityEnd('2030-10-20')?.toISOString()).toBe('2030-10-21T03:00:00.000Z');
    expect(isExpired('2030-10-20', Date.parse('2030-10-20T23:00:00-03:00'))).toBe(false);
    expect(isExpired('2030-10-20', Date.parse('2030-10-21T00:00:00-03:00'))).toBe(true);
    expect(isExpired('2030-10-20T15:00:00Z', Date.parse('2030-10-20T14:59:00Z'))).toBe(false);
    expect(isExpired('2030-10-20T15:00:00Z', Date.parse('2030-10-20T15:00:00Z'))).toBe(true);
    expect(isExpired(null, Date.now())).toBe(false);
    // A timestamp is shown as its São Paulo date
    expect(formatDateBR('2030-10-21T01:00:00Z')).toBe('20/10/2030');
  });
});

describe('useAsync', () => {
  it('keeps the data already shown when a reload fails', async () => {
    let fail = false;
    const load = vi.fn(async () => {
      if (fail) throw new Error('Failed to fetch');
      return 'dados';
    });
    const { result } = renderHook(() => useAsync(load, 'k'));
    await waitFor(() => expect(result.current.data).toBe('dados'));
    fail = true;
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.error?.code).toBe('network'));
    expect(result.current.data).toBe('dados');
    expect(result.current.loading).toBe(false);
  });
});

describe('request draft', () => {
  it('is kept in the session and can be cleared', () => {
    saveRequestDraft({ description: 'Faxina' });
    expect(readRequestDraft()).toEqual({ description: 'Faxina' });
    clearRequestDraft();
    expect(readRequestDraft()).toEqual({});
    sessionStorage.setItem('workeasy:pedido-rascunho', '[1,2]');
    expect(readRequestDraft()).toEqual({});
  });
});
