import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import AccessibilityLayer, { MAIN_ID } from '../../components/AccessibilityLayer';

const Where = () => <p data-testid="where">{useLocation().pathname}</p>;

const renderShell = () =>
  render(
    <MemoryRouter initialEntries={['/a']}>
      <AccessibilityLayer />
      <nav aria-label="Principal">
        <Link to="/a">Página A</Link>
        <Link to="/b">Página B</Link>
      </nav>
      <main id={MAIN_ID} tabIndex={-1}>
        <Routes>
          <Route path="/a" element={<h1>Primeira página</h1>} />
          <Route path="/b" element={<h1>Segunda página</h1>} />
        </Routes>
      </main>
      <Where />
    </MemoryRouter>,
  );

describe('skip link and route announcer', () => {
  it('makes the skip link the first stop of the keyboard, and it moves the focus to the content without leaving the page', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.tab();
    const skip = screen.getByRole('link', { name: 'Pular para o conteúdo' });
    expect(skip).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(document.getElementById(MAIN_ID)).toHaveFocus();
    // A hash href would be read as a route by the HashRouter of the native shells
    expect(screen.getByTestId('where')).toHaveTextContent('/a');
  });

  it('does not announce the page that was just loaded', () => {
    renderShell();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('announces the heading of the page that opened and moves the focus to the content', async () => {
    const user = userEvent.setup();
    renderShell();
    await user.click(screen.getByRole('link', { name: 'Página B' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Segunda página'));
    expect(document.getElementById(MAIN_ID)).toHaveFocus();
  });

  it('keeps the live region polite so it never interrupts what is being read', () => {
    renderShell();
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });
});
