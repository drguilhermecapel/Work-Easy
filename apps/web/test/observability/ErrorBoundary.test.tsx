import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ErrorBoundary from '../../components/ErrorBoundary';

const observability = vi.hoisted(() => ({ captureError: vi.fn() }));

vi.mock('../../lib/observability', () => ({ captureError: observability.captureError }));

const Broken: React.FC = () => {
  throw new Error('falha interna com ana@exemplo.com');
};

describe('ErrorBoundary', () => {
  beforeEach(() => {
    observability.captureError.mockReset();
    // React reports caught render errors on the console; the test checks the fallback instead.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the children when nothing fails', () => {
    render(
      <ErrorBoundary>
        <p>Conteúdo normal</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('Conteúdo normal')).toBeInTheDocument();
    expect(observability.captureError).not.toHaveBeenCalled();
  });

  it('shows a pt-BR message instead of the raw error and reports it', () => {
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Algo não funcionou como esperado');
    expect(alert).toHaveTextContent('Recarregar página');
    expect(alert).not.toHaveTextContent('falha interna');
    expect(observability.captureError).toHaveBeenCalledTimes(1);
    expect(observability.captureError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'falha interna com ana@exemplo.com' }),
      { componentStack: expect.any(String) },
    );
  });

  it('offers a reload of the page', async () => {
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, reload } });
    try {
      render(
        <ErrorBoundary>
          <Broken />
        </ErrorBoundary>,
      );
      await userEvent.click(screen.getByRole('button', { name: 'Recarregar página' }));
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });
});
