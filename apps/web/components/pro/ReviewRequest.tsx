import React from 'react';
import { MessageCircle } from 'lucide-react';
import { reviewUrl, reviewWhatsAppUrl } from '../../services/proAgenda';
import { secondaryButton } from './styles';
import { CopyButton } from './ui';

/**
 * For a finished job paid in the app: the link that takes the client to the booking page, where the
 * review form is. The review is the client's; the provider only passes the link along.
 */
const ReviewRequest: React.FC<{ bookingId: string; clientName: string | null }> = ({ bookingId, clientName }) => (
  <div className="mt-3 border-t border-gray-100 pt-3 space-y-2" role="group" aria-label="Pedir avaliação do atendimento">
    <p className="text-sm font-medium text-gray-800">Peça uma avaliação ao cliente</p>
    <p className="text-xs text-gray-500">
      O link leva o cliente ao atendimento dele no WorkEasy, onde ele avalia depois de entrar na conta. A nota e o comentário são dele: você
      não escreve nem altera a avaliação. O WhatsApp abre com a mensagem pronta; nada é enviado até você tocar em enviar lá.
    </p>
    <div className="flex flex-wrap items-center gap-3">
      <CopyButton text={reviewUrl(bookingId)} label="Copiar link da avaliação" />
      <a href={reviewWhatsAppUrl(bookingId, clientName)} target="_blank" rel="noopener noreferrer" className={secondaryButton}>
        <MessageCircle size={16} aria-hidden="true" /> Enviar por WhatsApp
      </a>
    </div>
  </div>
);

export default ReviewRequest;
