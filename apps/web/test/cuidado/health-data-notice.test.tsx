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

  it('says that free fields may receive health data, that the notice does not stop sending, and that the server filter is no guarantee', () => {
    render(<HealthDataNotice />);
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent(/Campos livres, como notas, humor e observações, podem receber esse tipo de informação\./);
    expect(note).toHaveTextContent(/O aviso ao lado do campo não impede o envio\./);
    expect(note).toHaveTextContent(
      /O servidor filtra os relatórios antes de enviá-los ao assistente de IA, mas esse filtro não é garantia\./,
    );
  });

  it('drops the old claims that the free text is not checked on the server and that the app keeps no health data', () => {
    render(<HealthDataNotice />);
    const note = screen.getByRole('note');
    expect(note).not.toHaveTextContent(/não é conferido no servidor/);
    expect(note).not.toHaveTextContent(/não guarda/);
  });
});
