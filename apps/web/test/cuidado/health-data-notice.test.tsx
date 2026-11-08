import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import HealthDataNotice from '../../components/cuidado/HealthDataNotice';

describe('HealthDataNotice', () => {
  it('says what the platform does, not a guarantee about the data it keeps', () => {
    render(<HealthDataNotice />);
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent('O WorkEasy não pede dados de saúde.');
    expect(note).not.toHaveTextContent(/não guarda dados de saúde/);
  });

  it('says that the browser blocks some health terms and that free text is not checked on the server', () => {
    render(<HealthDataNotice />);
    expect(screen.getByRole('note')).toHaveTextContent(/bloqueia no seu navegador alguns termos de saúde/);
    expect(screen.getByRole('note')).toHaveTextContent(/o texto livre não é conferido no servidor/);
  });
});
