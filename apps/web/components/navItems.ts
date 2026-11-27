import { UserType } from '../types';
import type { AuthContextType } from '../contexts/AuthContext';

export interface NavItem {
  label: string;
  to: string;
}

export interface NavModel {
  /** Links shown in the menu, in order. */
  items: NavItem[];
  /** Highlighted call to action (becoming a provider), when it applies. */
  cta: NavItem | null;
}

const CATEGORIES: NavItem = { label: 'Categorias', to: '/categorias' };

/**
 * Menu for the current account. Without a backend the demo persona decides
 * (the screens are fictitious); with a backend only the real session counts:
 * visitor, client, provider and admin links appear only for who can use them.
 * Access is always enforced by the database; the menu only hides dead ends.
 * The care line is listed only for accounts with careAccess (docs/DECISOES.md, D12).
 */
export const navModelFor = (auth: AuthContextType): NavModel => {
  if (auth.mode === 'demo') {
    return auth.user.type === UserType.CLIENT
      ? {
          items: [CATEGORIES, { label: 'Buscar', to: '/search' }, { label: 'Meus Pedidos', to: '/dashboard' }, { label: 'Ensaio de corrida', to: '/corridas' }],
          cta: { label: 'Sou Profissional', to: '/register-provider' },
        }
      : { items: [{ label: 'Meu Painel', to: '/dashboard' }], cta: null };
  }

  if (!auth.session) {
    return {
      items: [CATEGORIES, { label: 'Pedir serviço', to: '/pedido' }, { label: 'Corridas', to: '/corridas' }],
      cta: { label: 'Sou profissional', to: '/pro/cadastro' },
    };
  }

  const items: NavItem[] = auth.provider
    ? [
        { label: 'Painel Pro', to: '/pro' },
        { label: 'Pedidos recebidos', to: '/pro/pedidos' },
        { label: 'Agenda', to: '/pro/agenda' },
        { label: 'Atendimentos', to: '/atendimentos' },
        ...(auth.careAccess ? [{ label: 'Plantões', to: '/pro/plantoes' }] : []),
        { label: 'Pedir serviço', to: '/pedido' },
      ]
    : [
        CATEGORIES,
        { label: 'Pedir serviço', to: '/pedido' },
        { label: 'Meus pedidos', to: '/pedidos' },
        { label: 'Atendimentos', to: '/atendimentos' },
        ...(auth.careAccess ? [{ label: 'Cuidado', to: '/cuidado' }] : []),
      ];

  items.push({ label: 'Corridas', to: '/corridas' });
  if (auth.isAdmin) items.push({ label: 'Administração', to: '/admin' });

  return { items, cta: auth.provider ? null : { label: 'Sou profissional', to: '/pro/cadastro' } };
};

/** The home link is exact; every other link is active for its whole section. */
export const isNavActive = (pathname: string, to: string): boolean =>
  to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`);
