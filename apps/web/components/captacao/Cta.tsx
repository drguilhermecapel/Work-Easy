import React, { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { features } from '../../config/features';
import { conciergeLink } from '../../pages/cliente/concierge';
import { primaryButton, secondaryButton } from './styles';

/** Internal call to action, styled as a button. */
export const CtaLink: React.FC<{ to: string; variant?: 'primary' | 'secondary'; children: ReactNode }> = ({
  to,
  variant = 'primary',
  children,
}) => (
  <Link to={to} className={`${variant === 'primary' ? primaryButton : secondaryButton} no-underline`}>
    {children}
  </Link>
);

/**
 * WhatsApp of the concierge operation (VITE_CONCIERGE_WHATSAPP). Renders nothing
 * when no number is configured: the page never offers a chat that is not there.
 */
export const ConciergeLink: React.FC<{ message: string }> = ({ message }) => {
  const number = features.conciergeWhatsApp;
  if (!number) return null;
  return (
    <a href={conciergeLink(number, message)} target="_blank" rel="noopener noreferrer" className={`${secondaryButton} no-underline`}>
      <MessageCircle size={16} aria-hidden="true" /> Falar com a equipe pelo WhatsApp
      <span className="sr-only"> (abre em outra aba)</span>
    </a>
  );
};
