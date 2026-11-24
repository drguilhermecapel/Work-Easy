import React from 'react';
import { ExternalLink } from 'lucide-react';
import { NFSE_HELP, NFSE_ISSUER_URL } from '../../services/proNfse';
import { linkClass } from './styles';

/** Opens the national NFS-e issuer (gov.br) in a new tab. The app never issues the invoice. */
export const NfseLink: React.FC = () => (
  <a href={NFSE_ISSUER_URL} target="_blank" rel="noopener noreferrer" className={`${linkClass} inline-flex items-center gap-1 text-sm`}>
    <ExternalLink size={14} aria-hidden="true" /> Emitir nota fiscal (NFS-e)
  </a>
);

/** The one honest sentence about what the shortcut is. */
export const NfseNote: React.FC<{ className?: string }> = ({ className = '' }) => <p className={`text-xs text-gray-500 ${className}`}>{NFSE_HELP}</p>;
