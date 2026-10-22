import React, { useState } from 'react';
import { DEFAULT_SETTINGS } from '../../config/features';
import {
  ENABLE_PHRASES,
  NUMBER_LIMITS,
  parseNumberSetting,
  setSetting,
  type SettingRow,
} from '../../services/admin';
import { ActionButton, ConfirmForm } from './ConfirmAction';
import { formatDateTime } from './format';
import { LEGAL_NOTICE, SETTING_FIELDS, type BooleanDef, type NumberDef } from './settingDefs';
import { inputClass, primaryButton } from './styles';
import { Badge, Card, Field } from './ui';

const rowOf = (rows: SettingRow[], key: string): SettingRow | undefined => rows.find(row => row.key === key);

export const BooleanSetting: React.FC<{ def: BooleanDef; rows: SettingRow[]; onSaved: () => void }> = ({ def, rows, onSaved }) => {
  const row = rowOf(rows, def.key);
  const enabled = row?.value === true;
  const phrase = ENABLE_PHRASES[def.key];
  const headingId = `setting-${def.key}`;

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <Badge className={enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}>{enabled ? 'Ligada' : 'Desligada'}</Badge>
        {row?.updated_at && <span className="text-xs text-gray-500">Alterada em {formatDateTime(row.updated_at)}</span>}
      </div>
      <h2 id={headingId} className="font-bold text-gray-900">{def.title}</h2>
      <p className="text-sm text-gray-600 mt-1">{def.what}</p>
      {!enabled && <p className="text-sm text-gray-800 font-medium mt-1">{def.whileOff}</p>}
      <p role="note" className="text-sm font-medium text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-3 mt-3">
        {LEGAL_NOTICE}
      </p>
      <div className="flex flex-wrap gap-2 mt-3" role="group" aria-labelledby={headingId}>
        {enabled ? (
          <ActionButton
            label={`Desligar ${def.title.toLowerCase()}`}
            tone="danger"
            title={`Desligar: ${def.title}`}
            description={<p>A mudança vale para os próximos atendimentos e pagamentos.</p>}
            reason="none"
            confirmLabel="Desligar"
            onConfirm={() => setSetting(def.key, false)}
            onDone={onSaved}
          />
        ) : (
          <ActionButton
            label={`Ligar ${def.title.toLowerCase()}`}
            tone="primary"
            title={`Ligar: ${def.title}`}
            description={
              <>
                <p className="font-medium text-amber-800">{LEGAL_NOTICE}</p>
                <p>Ligue só com o parecer em mãos e a conta do Asaas configurada. A mudança vale para os próximos atendimentos e pagamentos.</p>
              </>
            }
            reason="none"
            phrase={phrase}
            confirmLabel="Ligar"
            onConfirm={() => setSetting(def.key, true)}
            onDone={onSaved}
          />
        )}
      </div>
    </Card>
  );
};

export const NumberSetting: React.FC<{ def: NumberDef; rows: SettingRow[]; onSaved: () => void }> = ({ def, rows, onSaved }) => {
  const row = rowOf(rows, def.key);
  const stored = typeof row?.value === 'number' ? row.value : null;
  const current = stored ?? DEFAULT_SETTINGS[SETTING_FIELDS[def.key]];
  const [text, setText] = useState(def.toText(current));
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const inputId = `setting-${def.key}`;
  const limits = NUMBER_LIMITS[def.key];

  const review = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = parseNumberSetting(def.key, text);
    if ('error' in parsed) {
      setProblem(parsed.error);
      setPending(null);
    } else if (parsed.value === current) {
      setProblem('Este já é o valor atual.');
      setPending(null);
    } else {
      setProblem(null);
      setPending(parsed.value);
    }
  };

  return (
    <Card>
      <h2 className="font-bold text-gray-900">{def.title}</h2>
      <p className="text-sm text-gray-600 mt-1">
        Valor atual: <strong>{def.show(current)}</strong>
        {stored === null && ' (padrão do sistema; nada gravado ainda)'}
      </p>
      {row?.updated_at && <p className="text-xs text-gray-500">Alterado em {formatDateTime(row.updated_at)}</p>}
      <form onSubmit={review} noValidate className="mt-3 space-y-3">
        <Field id={inputId} label={def.label} hint={`${def.hint} Aceita de ${def.toText(limits.min)} a ${def.toText(limits.max)}.`}>
          <input
            id={inputId}
            type="text"
            inputMode={def.key === 'pro_price_cents' ? 'decimal' : 'numeric'}
            autoComplete="off"
            value={text}
            onChange={e => {
              setText(e.target.value);
              setPending(null);
              setProblem(null);
            }}
            className={`${inputClass} sm:max-w-xs`}
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? `${inputId}-problem ${inputId}-hint` : `${inputId}-hint`}
          />
        </Field>
        {problem && (
          <p id={`${inputId}-problem`} role="alert" className="text-sm text-red-700">
            {problem}
          </p>
        )}
        {pending === null && (
          <button type="submit" className={primaryButton}>
            Revisar alteração
          </button>
        )}
      </form>
      {pending !== null && (
        <div className="mt-3">
          <ConfirmForm
            title={`Alterar: ${def.title}`}
            description={
              <p>
                De <strong>{def.show(current)}</strong> para <strong>{def.show(pending)}</strong>. A mudança vale para o que for criado depois dela.
              </p>
            }
            reason="none"
            confirmLabel="Confirmar alteração"
            onConfirm={async () => {
              await setSetting(def.key, pending);
              setPending(null);
              onSaved();
            }}
            onCancel={() => setPending(null)}
          />
        </div>
      )}
    </Card>
  );
};
