import React from 'react';
import { Link } from 'react-router-dom';
import type { ProposalAllowance } from '../../services/proMarketplace';
import { linkClass } from './styles';

/**
 * What the plan allows for proposals this month: "Você usou X de N propostas grátis neste mês" on the
 * free plan, "Propostas ilimitadas" on Pro. Nothing when it cannot be told: no number is guessed.
 */
const ProposalAllowanceNote: React.FC<{ allowance: ProposalAllowance | null; className?: string }> = ({ allowance, className = '' }) => {
  if (!allowance) return null;
  if (allowance.kind === 'unlimited') {
    return <p className={`text-sm text-gray-700 ${className}`}>Propostas ilimitadas no plano Pro.</p>;
  }
  const { used, limit } = allowance;
  return (
    <p className={`text-sm text-gray-700 ${className}`}>
      Você usou {used} de {limit} {limit === 1 ? 'proposta grátis' : 'propostas grátis'} neste mês.
      {used >= limit && ' A contagem recomeça no primeiro dia do mês; no plano Pro não há limite.'}{' '}
      <Link to="/pro/assinatura" className={linkClass}>Ver o plano Pro</Link>
    </p>
  );
};

export default ProposalAllowanceNote;
