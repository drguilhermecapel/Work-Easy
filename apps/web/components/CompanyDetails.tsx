import React, { Fragment, type ReactNode } from 'react';
import { company } from '../config/legal';
import { formatPhoneBR } from '../lib/phone';

/**
 * Identification of the supplier (corporate name, CNPJ, address) and, unless
 * `channels` is false, the SAC channels, as configured in the build variables
 * (config/legal.ts). Values that are not configured are left out; with none
 * configured nothing is rendered.
 */
const CompanyDetails: React.FC<{ className?: string; channels?: boolean }> = ({ className = '', channels = true }) => {
  const info = company();
  const identity = [info.name, info.cnpj ? `CNPJ ${info.cnpj}` : undefined].filter(Boolean).join(' · ');

  const contacts: ReactNode[] = [];
  if (channels && info.sacEmail) {
    contacts.push(
      <a href={`mailto:${info.sacEmail}`} className="underline hover:text-primary">
        {info.sacEmail}
      </a>,
    );
  }
  if (channels && info.sacWhatsapp) {
    contacts.push(
      <a href={`https://wa.me/${info.sacWhatsapp}`} target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">
        WhatsApp {formatPhoneBR(info.sacWhatsapp)}
      </a>,
    );
  }

  if (!identity && !info.address && contacts.length === 0) return null;

  return (
    <address className={`not-italic ${className}`}>
      {identity && <p>{identity}</p>}
      {info.address && <p>{info.address}</p>}
      {contacts.length > 0 && (
        <p>
          SAC:{' '}
          {contacts.map((contact, index) => (
            <Fragment key={index}>
              {index > 0 && ' · '}
              {contact}
            </Fragment>
          ))}
        </p>
      )}
    </address>
  );
};

export default CompanyDetails;
