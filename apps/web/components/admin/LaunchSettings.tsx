import React, { useState } from 'react';
import { LOCAL_NEIGHBORHOODS } from '../../config/neighborhoods';
import { parsePilotSlugs, setCareLineOpen, setPilotNeighborhoods, type SettingRow } from '../../services/admin';
import ErrorAlert from '../ErrorAlert';
import { formatDateTime } from './format';
import { inputClass, primaryButton, secondaryButton } from './styles';
import { Badge, Card, Field } from './ui';

// The two controls of the concierge pilot: which neighborhoods the request form offers and
// whether the care line is listed in the menu. Both are public settings read by the app.

const KNOWN = new Map(LOCAL_NEIGHBORHOODS.map(n => [n.slug, n.name]));

const PilotNeighborhoods: React.FC<{ row: SettingRow | undefined; onSaved: () => void }> = ({ row, onSaved }) => {
  const current = Array.isArray(row?.value) ? (row.value as unknown[]).filter((item): item is string => typeof item === 'string') : [];
  const [text, setText] = useState(current.join(', '));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const slugs = parsePilotSlugs(text);
  const unknown = slugs.filter(slug => !KNOWN.has(slug));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (unknown.length > 0) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await setPilotNeighborhoods(slugs);
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <h3 className="font-bold text-gray-900">Bairros do piloto</h3>
      <p className="text-sm text-gray-600 mt-1">
        O formulário de pedido oferece só estes bairros; os outros ficam na lista de espera. Com a lista vazia, o formulário oferece todos. O
        filtro vale para o formulário: um pedido registrado pela operação continua aceito em qualquer bairro.
      </p>
      <p className="text-sm text-gray-800 mt-2">
        Hoje: {current.length === 0 ? 'todos os bairros' : current.map(slug => KNOWN.get(slug) ?? slug).join(', ')}
        {row?.updated_at && <span className="text-xs text-gray-500"> · alterado em {formatDateTime(row.updated_at)}</span>}
      </p>
      <form onSubmit={save} className="mt-3 space-y-3" noValidate>
        <Field
          id="cfg-piloto"
          label="Identificadores dos bairros, separados por vírgula"
          hint="Use o identificador do bairro, por exemplo: moema, vila-mariana, saude, campo-belo, jabaquara."
          error={unknown.length > 0 ? `Bairro não encontrado: ${unknown.join(', ')}.` : null}
        >
          <textarea id="cfg-piloto" className={inputClass} rows={2} value={text} onChange={e => setText(e.target.value)} />
        </Field>
        <ErrorAlert error={error} />
        {saved && <p role="status" className="text-sm text-green-700">Bairros do piloto salvos.</p>}
        <button type="submit" className={primaryButton} disabled={busy || unknown.length > 0}>
          {busy ? 'Salvando…' : 'Salvar bairros do piloto'}
        </button>
      </form>
    </Card>
  );
};

const CareLine: React.FC<{ row: SettingRow | undefined; onSaved: () => void }> = ({ row, onSaved }) => {
  const open = row?.value === true;
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const set = async (value: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await setCareLineOpen(value);
      setConfirming(false);
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <Badge className={open ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}>{open ? 'Aberta' : 'Fechada'}</Badge>
        {row?.updated_at && <span className="text-xs text-gray-500">Alterada em {formatDateTime(row.updated_at)}</span>}
      </div>
      <h3 className="font-bold text-gray-900">Linha Cuidado no menu</h3>
      <p className="text-sm text-gray-600 mt-1">
        Fechada, a linha Cuidado aparece no menu só para administradores e para quem já está nela (família com casa cadastrada, cuidador que
        recebeu oferta). As páginas continuam abrindo pelo link, que é como a operação convida uma família.
      </p>
      <p role="note" className="text-sm font-medium text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-3 mt-3">
        Abrir ao público depende de pessoa jurídica aberta, seguro de responsabilidade civil, parecer trabalhista e ao menos 3 famílias
        atendidas em modo concierge.
      </p>
      <ErrorAlert error={error} className="mt-3" />
      <div className="flex flex-wrap gap-2 mt-3">
        {open ? (
          <button type="button" className={secondaryButton} disabled={busy} onClick={() => set(false)}>
            Fechar a linha Cuidado
          </button>
        ) : confirming ? (
          <>
            <button type="button" className={primaryButton} disabled={busy} onClick={() => set(true)}>
              Confirmar: abrir para todas as contas
            </button>
            <button type="button" className={secondaryButton} disabled={busy} onClick={() => setConfirming(false)}>
              Cancelar
            </button>
          </>
        ) : (
          <button type="button" className={secondaryButton} onClick={() => setConfirming(true)}>
            Abrir a linha Cuidado
          </button>
        )}
      </div>
    </Card>
  );
};

const LaunchSettings: React.FC<{ rows: SettingRow[]; onSaved: () => void }> = ({ rows, onSaved }) => {
  const pilot = rows.find(row => row.key === 'pilot_neighborhoods');
  return (
    <section aria-labelledby="cfg-lancamento" className="space-y-3">
      <h2 id="cfg-lancamento" className="text-lg font-bold text-gray-800">Lançamento</h2>
      <PilotNeighborhoods key={JSON.stringify(pilot?.value ?? null)} row={pilot} onSaved={onSaved} />
      <CareLine row={rows.find(row => row.key === 'care_line_open')} onSaved={onSaved} />
    </section>
  );
};

export default LaunchSettings;
