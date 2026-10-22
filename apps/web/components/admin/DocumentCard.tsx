import React, { useState } from 'react';
import { ExternalLink, FileText } from 'lucide-react';
import { VERIFICATION_LABELS } from '../../catalog/labels';
import { createDocumentUrl, reviewDocument, SIGNED_URL_SECONDS, type AdminDocument } from '../../services/admin';
import ErrorAlert from '../ErrorAlert';
import { ActionButton } from './ConfirmAction';
import { formatDateTime } from './format';
import { DOCUMENT_STATUS_LABELS, DOCUMENT_STATUS_STYLES } from './labels';
import { linkClass, secondaryButton } from './styles';
import { Badge, Card } from './ui';
import { formatDateBR } from '../../lib/timezone';

/** One document of a provider: opens the private file by a short-lived signed address and records the review. */
const DocumentCard: React.FC<{ document: AdminDocument; onChanged: () => void }> = ({ document: doc, onChanged }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const label = VERIFICATION_LABELS[doc.step] ?? doc.step;

  const open = async () => {
    setOpening(true);
    setError(null);
    try {
      setUrl(await createDocumentUrl(doc.storage_path));
    } catch (err) {
      setUrl(null);
      setError(err);
    } finally {
      setOpening(false);
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <Badge className={DOCUMENT_STATUS_STYLES[doc.status]}>{DOCUMENT_STATUS_LABELS[doc.status]}</Badge>
        <span className="text-xs text-gray-500">Enviado em {formatDateTime(doc.created_at)}</span>
      </div>
      <h3 className="font-semibold text-gray-900 break-words flex items-start gap-2">
        <FileText size={16} className="shrink-0 mt-1 text-gray-400" aria-hidden="true" /> {label}
      </h3>
      <p className="text-xs text-gray-500 break-all mt-0.5">{doc.storage_path.split('/').slice(1).join('/') || doc.storage_path}</p>
      {doc.expires_at && <p className="text-xs text-gray-500 mt-0.5">Validade informada: {formatDateBR(doc.expires_at)}</p>}
      {doc.status !== 'submitted' && doc.reviewed_at && <p className="text-xs text-gray-500 mt-0.5">Revisado em {formatDateTime(doc.reviewed_at)}</p>}
      {doc.rejection_reason && <p className="text-sm text-gray-700 mt-2 whitespace-pre-line break-words">Motivo da rejeição: {doc.rejection_reason}</p>}

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <button type="button" className={secondaryButton} onClick={open} disabled={opening} aria-label={`Ver arquivo: ${label}`}>
          {opening ? 'Abrindo…' : 'Ver arquivo'}
        </button>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className={`${linkClass} text-sm inline-flex items-center gap-1`}>
            Abrir em nova aba <ExternalLink size={14} aria-hidden="true" />
            <span className="sr-only">: {label}</span>
          </a>
        )}
      </div>
      {url && <p className="text-xs text-gray-500 mt-1">O endereço vale por {SIGNED_URL_SECONDS / 60} minutos. Abra de novo se vencer.</p>}
      <ErrorAlert error={error} className="mt-2" />

      {doc.status === 'submitted' && (
        <div className="flex flex-wrap gap-2 mt-3">
          <ActionButton
            label="Aceitar documento"
            tone="primary"
            title={`Aceitar: ${label}`}
            description={<p>Aceite só depois de abrir o arquivo e conferir. O sistema recusa o aceite se o arquivo não estiver no armazenamento.</p>}
            reason="optional"
            reasonLabel="Observação (opcional)"
            confirmLabel="Confirmar aceite"
            onConfirm={reason => reviewDocument(doc.id, true, reason)}
            onDone={onChanged}
          />
          <ActionButton
            label="Rejeitar documento"
            tone="danger"
            title={`Rejeitar: ${label}`}
            description={<p>O prestador vê o motivo e precisa enviar outro arquivo.</p>}
            reason="required"
            confirmLabel="Confirmar rejeição"
            onConfirm={reason => reviewDocument(doc.id, false, reason)}
            onDone={onChanged}
          />
        </div>
      )}
      {doc.status === 'accepted' && (
        <div className="flex flex-wrap gap-2 mt-3">
          <ActionButton
            label="Desfazer aceite"
            tone="danger"
            title={`Desfazer o aceite: ${label}`}
            description={
              <>
                <p>Use se o documento foi aceito por engano ou perdeu a validade. Ele passa a rejeitado e o prestador vê o motivo.</p>
                <p>Uma ocupação que já foi aprovada com este documento continua aprovada: retire a aprovação dela se for o caso.</p>
              </>
            }
            reason="required"
            confirmLabel="Desfazer aceite"
            onConfirm={reason => reviewDocument(doc.id, false, reason)}
            onDone={onChanged}
          />
        </div>
      )}
    </Card>
  );
};

export default DocumentCard;
