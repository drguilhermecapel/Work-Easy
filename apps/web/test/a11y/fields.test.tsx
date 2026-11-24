import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Field as AdminField } from '../../components/admin/ui';
import { Field as CareField } from '../../components/cuidado/ui';
import { Field as ProField } from '../../components/pro/ui';
import ErrorAlert from '../../components/ErrorAlert';
import { describeControl } from '../../components/fieldA11y';

type FieldComponent = React.FC<{ id: string; label: string; hint?: string; error?: string | null; children: React.ReactNode }>;

describe.each([
  ['pro', ProField as FieldComponent],
  ['cuidado', CareField as FieldComponent],
  ['admin', AdminField as FieldComponent],
])('Field of the %s screens', (_area, Field) => {
  it('reads the hint and the error together with the control, and marks the control invalid', () => {
    render(
      <Field id="nome" label="Nome" hint="Como aparece para os clientes." error="Informe o nome.">
        <input id="nome" />
      </Field>,
    );
    const input = screen.getByLabelText('Nome');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Como aparece para os clientes. Informe o nome.');
    expect(screen.getByRole('alert')).toHaveTextContent('Informe o nome.');
  });

  it('adds nothing when there is no hint and no error', () => {
    render(
      <Field id="nome" label="Nome">
        <input id="nome" />
      </Field>,
    );
    const input = screen.getByLabelText('Nome');
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps a description the control already has', () => {
    render(
      <>
        <p id="outra">Outra nota.</p>
        <Field id="cidade" label="Cidade" hint="Só a cidade.">
          <select id="cidade" aria-describedby="outra">
            <option>São Paulo</option>
          </select>
        </Field>
      </>,
    );
    expect(screen.getByLabelText('Cidade')).toHaveAccessibleDescription('Outra nota. Só a cidade.');
  });

  it('leaves a wrapper element alone: only a plain input, select or textarea is wired', () => {
    render(
      <Field id="slug" label="Endereço" hint="Dica." error="Ocupado.">
        <div data-testid="wrapper">
          <input id="slug" />
        </div>
      </Field>,
    );
    expect(screen.getByTestId('wrapper')).not.toHaveAttribute('aria-describedby');
  });
});

describe('describeControl', () => {
  it('does not duplicate an id the control already lists', () => {
    const { container } = render(<>{describeControl(<textarea aria-describedby="a-dica" />, { hint: 'a-dica' })}</>);
    expect(container.querySelector('textarea')).toHaveAttribute('aria-describedby', 'a-dica');
  });
});

describe('ErrorAlert', () => {
  it('carries the id that a field points to with aria-describedby', () => {
    render(<ErrorAlert id="erro-campo" error={new Error('falhou')} />);
    expect(screen.getByRole('alert')).toHaveAttribute('id', 'erro-campo');
  });

  it('renders nothing without an error', () => {
    const { container } = render(<ErrorAlert id="erro-campo" error={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
