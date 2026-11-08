import React from 'react';
import { formatDateTime } from '../../components/admin/format';
import { BooleanSetting, NumberSetting } from '../../components/admin/SettingRows';
import { BOOLEAN_DEFS, NUMBER_DEFS, REVENUE_SETTING_KEYS } from '../../components/admin/settingDefs';
import { Card } from '../../components/admin/ui';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import { useAsync } from '../../lib/useAsync';
import { BOOLEAN_SETTINGS, listSettings, NUMBER_SETTINGS } from '../../services/admin';

const KNOWN = new Set<string>([...BOOLEAN_SETTINGS, ...NUMBER_SETTINGS]);
const LIMIT_DEFS = NUMBER_DEFS.filter(def => !REVENUE_SETTING_KEYS.includes(def.key));
const REVENUE_DEFS = NUMBER_DEFS.filter(def => REVENUE_SETTING_KEYS.includes(def.key));

const Configuracoes: React.FC = () => {
  const settings = useAsync(listSettings, 'settings');
  if (settings.loading && !settings.data) return <PageStatus />;
  const rows = settings.data ?? [];
  const others = rows.filter(row => !KNOWN.has(row.key));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-800">Configurações da plataforma</h1>
        <p className="text-sm text-gray-500 mt-1">Cada mudança fica no histórico de auditoria, com o valor anterior e o novo.</p>
      </header>
      <ErrorAlert error={settings.error} />

      {settings.data && (
        <>
          <section aria-labelledby="cfg-dinheiro" className="space-y-3">
            <h2 id="cfg-dinheiro" className="text-lg font-bold text-gray-800">Recursos com dinheiro</h2>
            <p className="text-sm text-gray-600">
              Comissão e pagamento retido dependem de parecer jurídico e de conta Asaas configurada. Começam desligados e só se ligam depois de digitar
              uma frase de confirmação. Ligar aqui não cria a conta nem substitui o parecer.
            </p>
            {BOOLEAN_DEFS.map(def => (
              <BooleanSetting key={`${def.key}:${String(rows.find(r => r.key === def.key)?.value)}`} def={def} rows={rows} onSaved={settings.reload} />
            ))}
          </section>

          <section aria-labelledby="cfg-valores" className="space-y-3">
            <h2 id="cfg-valores" className="text-lg font-bold text-gray-800">Valores e limites</h2>
            {LIMIT_DEFS.map(def => (
              <NumberSetting key={`${def.key}:${String(rows.find(r => r.key === def.key)?.value)}`} def={def} rows={rows} onSaved={settings.reload} />
            ))}
          </section>

          <section aria-labelledby="cfg-receita" className="space-y-3">
            <h2 id="cfg-receita" className="text-lg font-bold text-gray-800">Plano Pro, plano gratuito e teto da comissão</h2>
            <p className="text-sm text-gray-600">
              Cada valor tem o seu zero: no teste, 0 é sem teste; nas propostas do plano gratuito, 0 é sem limite; no teto, 0 é sem teto. A mudança vale para o
              que for criado depois dela.
            </p>
            {REVENUE_DEFS.map(def => (
              <NumberSetting key={`${def.key}:${String(rows.find(r => r.key === def.key)?.value)}`} def={def} rows={rows} onSaved={settings.reload} />
            ))}
          </section>

          {others.length > 0 && (
            <section aria-labelledby="cfg-outras" className="space-y-3">
              <h2 id="cfg-outras" className="text-lg font-bold text-gray-800">Outras chaves (somente leitura)</h2>
              <Card>
                <ul className="divide-y divide-gray-100 text-sm">
                  {others.map(row => (
                    <li key={row.key} className="py-2">
                      <p className="font-medium text-gray-800 break-all">
                        {row.key} {row.internal && <span className="text-xs text-gray-500">(interna)</span>}
                      </p>
                      <p className="text-gray-600 break-all">{JSON.stringify(row.value)}</p>
                      {row.updated_at && <p className="text-xs text-gray-500">Alterada em {formatDateTime(row.updated_at)}</p>}
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}
        </>
      )}
    </div>
  );
};

export default Configuracoes;
