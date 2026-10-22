import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus, Home, Pencil, Plus, UserRound } from 'lucide-react';
import { useAsync } from '../../lib/useAsync';
import { listNeighborhoods } from '../../services/neighborhoods';
import {
  createHousehold,
  createRecipient,
  deleteHousehold,
  deleteRecipient,
  listHouseholds,
  listRecipients,
  listShifts,
  updateHousehold,
  updateRecipient,
  type CareRecipient,
  type Household,
  type Shift,
} from '../../services/care';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import CuidadoPage from '../../components/cuidado/CuidadoPage';
import HealthDataNotice from '../../components/cuidado/HealthDataNotice';
import HouseholdForm from '../../components/cuidado/HouseholdForm';
import RecipientForm from '../../components/cuidado/RecipientForm';
import { primaryButton, secondaryButton } from '../../components/cuidado/styles';
import { Card, ConfirmButton, EmptyState, SectionTitle } from '../../components/cuidado/ui';
import { useCareUserId } from '../../components/cuidado/useCareUser';
import type { NeighborhoodRow } from '../../services/types';

const load = async () => {
  const households = await listHouseholds();
  const [recipients, neighborhoods, shifts] = await Promise.all([
    listRecipients(households.map(h => h.id)),
    listNeighborhoods().catch((): NeighborhoodRow[] => []),
    listShifts(households.map(h => h.id)),
  ]);
  return { households, recipients, neighborhoods, shifts, now: Date.now() };
};

type Data = Awaited<ReturnType<typeof load>>;

interface CardProps {
  household: Household;
  recipients: CareRecipient[];
  neighborhoods: NeighborhoodRow[];
  /** Shifts of this house that have not ended and have a caregiver who accepted (or is working). */
  upcoming: Shift[];
  onChanged: () => void;
  onError: (error: unknown) => void;
}

/** Plural of the warning shown before a house with a confirmed caregiver is deleted. */
const caregiverWarning = (count: number): string =>
  count === 0
    ? ''
    : ` Há ${count} ${count === 1 ? 'plantão' : 'plantões'} com cuidador confirmado que ainda ${count === 1 ? 'não terminou' : 'não terminaram'}: o app não avisa o cuidador, ele deixa de ver ${count === 1 ? 'o plantão' : 'os plantões'}. Cancele antes, para ele ser liberado, e avise-o por fora.`;

const HouseholdCard: React.FC<CardProps> = ({ household, recipients, neighborhoods, upcoming, onChanged, onError }) => {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingRecipient, setEditingRecipient] = useState<string | null>(null);
  const neighborhood = neighborhoods.find(n => n.id === household.neighborhood_id);
  const headingId = `casa-${household.id}`;

  const run = async (action: () => Promise<unknown>) => {
    onError(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      onError(err);
    }
  };

  return (
    <Card as="li" className="space-y-4">
      <section aria-labelledby={headingId} className="space-y-3">
        {editing ? (
          <HouseholdForm
            idPrefix={`casa-${household.id}`}
            initial={household}
            neighborhoods={neighborhoods}
            submitLabel="Salvar casa"
            onCancel={() => setEditing(false)}
            onSubmit={async input => {
              await updateHousehold(household.id, input);
              setEditing(false);
              onChanged();
            }}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 id={headingId} className="font-bold text-gray-900 flex items-center gap-2 break-words">
                  <Home size={16} className="text-primary shrink-0" aria-hidden="true" /> {household.name}
                </h3>
                <p className="text-sm text-gray-600">{neighborhood ? `Bairro: ${neighborhood.name}` : 'Bairro não informado'}</p>
                {household.notes && <p className="text-sm text-gray-600 mt-1 whitespace-pre-line break-words">{household.notes}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={secondaryButton} onClick={() => setEditing(true)} aria-label={`Editar a casa ${household.name}`}>
                  <Pencil size={14} aria-hidden="true" /> Editar
                </button>
                <Link to={`/cuidado/plantoes?casa=${household.id}`} className={`${primaryButton} no-underline`}>
                  <CalendarPlus size={14} aria-hidden="true" /> Criar plantão
                </Link>
              </div>
            </div>
            <ConfirmButton
              label="Apagar casa"
              confirmLabel="Apagar casa e tudo dela"
              question={`Apagar “${household.name}”? Os assistidos, plantões, registros de entrada e saída e relatórios desta casa também serão apagados.${caregiverWarning(upcoming.length)}`}
              onConfirm={() => run(() => deleteHousehold(household.id))}
            />
          </>
        )}
      </section>

      <section aria-label={`Assistidos de ${household.name}`} className="space-y-3 border-t border-gray-100 pt-3">
        <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <UserRound size={14} className="text-primary" aria-hidden="true" /> Pessoas cuidadas
        </h4>
        {recipients.length === 0 && !adding && (
          <p className="text-sm text-gray-500">Nenhuma pessoa cadastrada nesta casa. Cadastre quem vai receber o cuidado.</p>
        )}
        <ul className="space-y-3">
          {recipients.map(recipient =>
            editingRecipient === recipient.id ? (
              <li key={recipient.id} className="bg-gray-50 rounded-xl p-3">
                <RecipientForm
                  idPrefix={`pessoa-${recipient.id}`}
                  initial={recipient}
                  submitLabel="Salvar"
                  onCancel={() => setEditingRecipient(null)}
                  onSubmit={async input => {
                    await updateRecipient(recipient.id, input);
                    setEditingRecipient(null);
                    onChanged();
                  }}
                />
              </li>
            ) : (
              <li key={recipient.id} className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
                <p className="font-semibold text-gray-900 break-words">
                  {recipient.first_name}
                  {recipient.birth_year ? <span className="font-normal text-gray-600"> · nascido(a) em {recipient.birth_year}</span> : null}
                </p>
                {recipient.preferences && <p className="text-gray-600 whitespace-pre-line break-words">Preferências: {recipient.preferences}</p>}
                {recipient.emergency_contact && <p className="text-gray-600 break-words">Contato de emergência: {recipient.emergency_contact}</p>}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    className={secondaryButton}
                    onClick={() => setEditingRecipient(recipient.id)}
                    aria-label={`Editar ${recipient.first_name}`}
                  >
                    <Pencil size={14} aria-hidden="true" /> Editar
                  </button>
                  <ConfirmButton
                    label="Remover"
                    confirmLabel="Remover pessoa"
                    question={`Remover ${recipient.first_name}? Os plantões já criados ficam, sem o nome dela.`}
                    onConfirm={() => run(() => deleteRecipient(recipient.id))}
                  />
                </div>
              </li>
            ),
          )}
        </ul>
        {adding ? (
          <div className="bg-gray-50 rounded-xl p-3">
            <RecipientForm
              idPrefix={`nova-pessoa-${household.id}`}
              submitLabel="Cadastrar pessoa"
              onCancel={() => setAdding(false)}
              onSubmit={async input => {
                await createRecipient(household.id, input);
                setAdding(false);
                onChanged();
              }}
            />
          </div>
        ) : (
          <button type="button" className={secondaryButton} onClick={() => setAdding(true)}>
            <Plus size={14} aria-hidden="true" /> Cadastrar pessoa cuidada
          </button>
        )}
      </section>
    </Card>
  );
};

const Content: React.FC<{ userId: string }> = ({ userId }) => {
  const result = useAsync(load, userId);
  const [actionError, setActionError] = useState<unknown>(null);
  const data: Data | undefined = result.data;

  if (result.loading && !data) return <PageStatus />;
  if (!data) return <ErrorAlert error={result.error} />;

  return (
    <div className="space-y-5">
      <HealthDataNotice>
        Cadastre só o necessário para organizar os plantões: primeiro nome, ano de nascimento, gostos e um contato de emergência. Doenças,
        diagnósticos e remédios ficam fora do app.
      </HealthDataNotice>
      <ErrorAlert error={result.error} />
      <ErrorAlert error={actionError} />

      <section aria-labelledby="cuidado-casas" className="space-y-3">
        <SectionTitle id="cuidado-casas">Suas casas</SectionTitle>
        {data.households.length === 0 && (
          <EmptyState>Você ainda não cadastrou uma casa. Comece pela casa onde o cuidado acontece; depois cadastre a pessoa cuidada e crie os plantões.</EmptyState>
        )}
        <ul className="space-y-4">
          {data.households.map(household => (
            <HouseholdCard
              key={household.id}
              household={household}
              recipients={data.recipients.filter(r => r.household_id === household.id)}
              upcoming={data.shifts.filter(
                s => s.household_id === household.id && s.provider_id && (s.status === 'assigned' || s.status === 'checked_in') && s.period.end.getTime() > data.now,
              )}
              neighborhoods={data.neighborhoods}
              onChanged={result.reload}
              onError={setActionError}
            />
          ))}
        </ul>
      </section>

      <Card as="section" labelledBy="cuidado-nova-casa">
        <SectionTitle id="cuidado-nova-casa">Nova casa</SectionTitle>
        <HouseholdForm
          idPrefix="nova-casa"
          neighborhoods={data.neighborhoods}
          submitLabel="Cadastrar casa"
          onSubmit={async input => {
            await createHousehold(userId, input);
            result.reload();
          }}
        />
      </Card>
    </div>
  );
};

const Casas: React.FC = () => {
  const userId = useCareUserId();
  return (
    <CuidadoPage
      title="Cuidado"
      intro="Organize plantões de cuidadores para a pessoa que você cuida. Horários no fuso de Brasília."
    >
      <Content userId={userId} />
    </CuidadoPage>
  );
};

export default Casas;
