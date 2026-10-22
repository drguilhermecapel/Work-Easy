import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmButton } from '../../components/cuidado/ui';

describe('ConfirmButton of the care screens', () => {
  const setup = (onConfirm: () => Promise<void>) =>
    render(<ConfirmButton label="Apagar" confirmLabel="Sim, apagar" question="Apagar mesmo?" onConfirm={onConfirm} />);

  it('asks first and runs only after the confirmation', async () => {
    const onConfirm = vi.fn(async () => {});
    setup(onConfirm);
    await userEvent.click(screen.getByRole('button', { name: 'Apagar' }));
    expect(onConfirm).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Sim, apagar' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    // Back to the first button
    expect(await screen.findByRole('button', { name: 'Apagar' })).toBeInTheDocument();
  });

  it('runs once when the confirmation is clicked twice while the first call is still going', async () => {
    let finish: () => void = () => {};
    const onConfirm = vi.fn(() => new Promise<void>(resolve => (finish = resolve)));
    setup(onConfirm);
    await userEvent.click(screen.getByRole('button', { name: 'Apagar' }));
    const confirm = screen.getByRole('button', { name: 'Sim, apagar' });
    await userEvent.dblClick(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    // While it runs the button says so and nothing can be clicked
    const busy = screen.getByRole('button', { name: 'Aguarde…' });
    expect(busy).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeDisabled();
    finish();
    expect(await screen.findByRole('button', { name: 'Apagar' })).toBeInTheDocument();
  });
});
