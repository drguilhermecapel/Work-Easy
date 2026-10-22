import React from 'react';
import { ExternalLink } from 'lucide-react';
import { CopyButton } from './ui';
import { inputClass, secondaryButton } from './styles';

interface Props {
  idPrefix: string;
  pixPayload: string | null;
  pixQrCode: string | null;
  invoiceUrl: string | null;
}

/** Pix "copia e cola", its QR code and the Asaas invoice link of a charge. */
const PixBox: React.FC<Props> = ({ idPrefix, pixPayload, pixQrCode, invoiceUrl }) => (
  <div className="space-y-3">
    {pixPayload && (
      <div className="space-y-2">
        <label htmlFor={`${idPrefix}-pix`} className="block text-sm font-medium text-gray-700">
          Pix copia e cola
        </label>
        <textarea id={`${idPrefix}-pix`} className={`${inputClass} font-mono text-xs`} rows={3} readOnly value={pixPayload} onFocus={e => e.currentTarget.select()} />
        <CopyButton text={pixPayload} label="Copiar código Pix" />
        {pixQrCode && (
          <img
            src={`data:image/png;base64,${pixQrCode}`}
            alt="QR Code do Pix"
            width={176}
            height={176}
            className="border border-gray-100 rounded-xl"
          />
        )}
      </div>
    )}
    {invoiceUrl && (
      <a href={invoiceUrl} target="_blank" rel="noopener noreferrer" className={secondaryButton}>
        <ExternalLink size={16} aria-hidden="true" /> Abrir a fatura do Asaas
      </a>
    )}
  </div>
);

export default PixBox;
