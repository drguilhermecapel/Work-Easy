import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import ErrorAlert from '../../ErrorAlert';
import { formatDateTime } from '../../admin/format';
import Ownership from '../parties/Ownership';
import { useAction } from '../safety/state';
import { toAppError } from '../../../lib/errors';
import { formatCents } from '../../../lib/money';
import { formatDateBR, saoPauloDateTime, todayInSaoPaulo } from '../../../lib/timezone';
import { useAsync } from '../../../lib/useAsync';
import { VEHICLES } from '../../../pages/mobilidade/driverLabels';
import {
  fleets,
  type DriverCession,
  type FleetAccount,
  type FleetAssignment,
  type FleetBeneficiary,
  type FleetMember,
  type FleetOverview,
  type FleetRole,
  type FleetVehicle,
} from '../../../services/rideFleets';
import {
  ADHESION_VALIDITY,
  assignmentName,
  banner,
  BENEFICIARIES,
  beneficiaryName,
  card,
  cardTitle,
  danger,
  field,
  hint,
  isOver,
  legStatus,
  primary,
  roleName,
  secondary,
  useInvitePage,
} from './shared';

const MONTH = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
/** "2026-11" → "novembro de 2026". */
const monthName = (month: string) => {
  const date = new Date(month + '-01T00:00:00Z');
  return Number.isNaN(date.getTime()) ? month : MONTH.format(date);
};
/** Value of a datetime-local field, read as São Paulo wall time → ISO instant; null when unreadable. */
const toInstant = (value: string): string | null => {
  const [day, time] = value.split('T');
  return saoPauloDateTime(day ?? '', time ?? '')?.toISOString() ?? null;
};
const personName = (name: string | null) => name ?? 'Pessoa sem nome no perfil';
const categoryName = (category: string) => (VEHICLES as Record<string, string>)[category] ?? category;

/** A destructive action asks once more, saying what changes and what stays. */
function Confirm({
  label,
  confirmLabel,
  busy,
  onConfirm,
  children,
}: {
  label: string;
  confirmLabel: string;
  busy: boolean;
  /** Resolves when the attempt ends; the question closes only if it answers true. */
  onConfirm: () => Promise<boolean>;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" className="text-sm text-red-700 underline" onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  return (
    <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3">
      <p>{children}</p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={danger}
          disabled={busy}
          onClick={() => void onConfirm().then((done) => done && setOpen(false))}
        >
          {confirmLabel}
        </button>
        <button type="button" className={secondary} disabled={busy} onClick={() => setOpen(false)}>
          Voltar
        </button>
      </div>
    </div>
  );
}

/** Runs a confirmed action and tells the question whether it may close. */
async function confirmed(
  action: ReturnType<typeof useAction>,
  intent: string,
  work: (key: string) => Promise<string>,
): Promise<boolean> {
  let done = false;
  await action.run(intent, async (key) => {
    const notice = await work(key);
    done = true;
    return notice;
  });
  return done;
}

function VehicleForm({
  account,
  vehicle,
  today,
  refresh,
  onSaved,
}: {
  account: string;
  /** Present when renewing the documents of a vehicle the fleet already has. */
  vehicle?: FleetVehicle;
  today: string;
  refresh: () => void;
  /** The form may leave the page once the list is read again, so the caller keeps the notice. */
  onSaved: (notice: string) => void;
}) {
  const action = useAction(refresh);
  const [identifier, setIdentifier] = useState(vehicle?.vehicle_identifier ?? '');
  const [category, setCategory] = useState(vehicle?.category ?? 'compact');
  const [refs, setRefs] = useState({
    document: vehicle?.document_ref ?? '',
    insurance: vehicle?.insurance_ref ?? '',
    inspection: vehicle?.inspection_ref ?? '',
  });
  const [dates, setDates] = useState({
    document: vehicle?.vehicle_until.slice(0, 10) ?? '',
    insurance: vehicle?.insurance_until.slice(0, 10) ?? '',
    inspection: vehicle?.inspection_until.slice(0, 10) ?? '',
  });
  const input = {
    identifier: identifier.trim(),
    category,
    document: refs.document.trim(),
    insurance: refs.insurance.trim(),
    inspection: refs.inspection.trim(),
    vehicleUntil: dates.document,
    insuranceUntil: dates.insurance,
    inspectionUntil: dates.inspection,
  };
  const complete = Object.values(input).every(Boolean);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!complete) return;
    void action.run('vehicle:' + JSON.stringify(input), async () => {
      await fleets.saveVehicle(account, input);
      onSaved(
        vehicle
          ? 'Documentos salvos. Qualquer mudança de categoria, referência ou validade manda as cessões aprovadas deste veículo de volta para a revisão da operação.'
          : 'Veículo salvo. Agora você pode cedê-lo a um motorista da frota.',
      );
      return '';
    });
  }
  const documents = [
    { part: 'document', ref: 'Referência do documento do veículo', until: 'Documento válido até' },
    { part: 'insurance', ref: 'Referência da apólice de seguro', until: 'Seguro válido até' },
    { part: 'inspection', ref: 'Referência da revisão ou vistoria', until: 'Revisão válida até' },
  ] as const;
  return (
    <form className="space-y-3" onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          Placa ou identificador do veículo
          <input
            className={field}
            required
            maxLength={40}
            readOnly={!!vehicle}
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
          />
        </label>
        <label className="block">
          Categoria
          <select className={field} value={category} onChange={(event) => setCategory(event.target.value)}>
            {Object.entries(VEHICLES).map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {documents.map((item) => (
          <div key={item.part} className="contents">
            <label className="block">
              {item.ref}
              <input
                className={field}
                required
                maxLength={160}
                value={refs[item.part]}
                onChange={(event) => setRefs({ ...refs, [item.part]: event.target.value })}
              />
            </label>
            <label className="block">
              {item.until}
              <input
                className={field}
                type="date"
                required
                min={today}
                max={String(Number(today.slice(0, 4)) + 10) + today.slice(4)}
                value={dates[item.part]}
                onChange={(event) => setDates({ ...dates, [item.part]: event.target.value })}
              />
            </label>
          </div>
        ))}
      </div>
      <p className={hint}>
        Use exatamente o mesmo identificador do cadastro do motorista na operação, com as mesmas letras maiúsculas e a
        mesma pontuação: se for diferente, o motorista não recebe ofertas. Informe só a referência de cada documento
        (número do protocolo ou da apólice), sem anexos e sem dados pessoais.
        {vehicle && ' Mudar qualquer dado manda as cessões aprovadas deste veículo de volta para a revisão.'}
      </p>
      <button type="submit" className={primary} disabled={action.busy || !complete}>
        {vehicle ? 'Salvar documentos' : 'Salvar veículo'}
      </button>
      {action.message}
    </form>
  );
}

function AssignForm({
  vehicle,
  drivers,
  now,
  onAssigned,
  refresh,
}: {
  vehicle: FleetVehicle;
  drivers: FleetMember[];
  /** When the page was read: the bounds of the period are shown against it, the database decides. */
  now: number;
  onAssigned: (notice: string) => void;
  refresh: () => void;
}) {
  const action = useAction(refresh);
  const [driver, setDriver] = useState(drivers[0]?.member_id ?? '');
  const [cession, setCession] = useState('');
  const [beneficiary, setBeneficiary] = useState<FleetBeneficiary>('driver');
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const start = toInstant(from);
  const end = toInstant(until);
  const ordered = !!start && !!end && start < end;
  // The same bounds the database applies: no start older than a day, an end in the future, 13 months at most.
  const cap = start ? new Date(start) : null;
  cap?.setUTCMonth(cap.getUTCMonth() + 13);
  const bounded =
    ordered && !!cap && Date.parse(end) > now && Date.parse(start) >= now - 86_400_000 && Date.parse(end) <= cap.getTime();
  const valid = !!driver && !!cession.trim() && bounded;
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || !start || !end) return;
    const reference = cession.trim();
    // A retry of the same cession reuses the key, so a lost answer never creates a second assignment.
    void action.run(JSON.stringify(['assign', vehicle.id, driver, reference, beneficiary, start, end]), async (key) => {
      try {
        await fleets.assign(vehicle.id, driver, reference, beneficiary, start, end, key);
      } catch (error) {
        // An overlapping cession of the vehicle or of the driver (in this or another fleet) is not a matter of time slots.
        if (toAppError(error).code !== 'slot_unavailable') throw error;
        return 'Este veículo ou este motorista já tem uma cessão em revisão ou aprovada neste período. Encerre a anterior ou escolha outro período.';
      }
      onAssigned(
        'Cessão enviada para revisão. O motorista só recebe ofertas com este veículo depois que a operação aprovar.',
      );
      return '';
    });
  }
  return (
    <form className="space-y-3 rounded-xl bg-gray-50 p-3" onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          Motorista
          <select className={field} value={driver} onChange={(event) => setDriver(event.target.value)}>
            {drivers.map((member) => (
              <option key={member.member_id} value={member.member_id}>
                {personName(member.name)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          Referência do contrato de cessão
          <input
            className={field}
            required
            maxLength={160}
            value={cession}
            onChange={(event) => setCession(event.target.value)}
          />
        </label>
        <label className="block">
          Início da cessão (horário de São Paulo)
          <input
            className={field}
            type="datetime-local"
            required
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label className="block">
          Fim da cessão (horário de São Paulo)
          <input
            className={field}
            type="datetime-local"
            required
            min={from}
            value={until}
            onChange={(event) => setUntil(event.target.value)}
          />
        </label>
        <label className="block sm:col-span-2">
          Quem recebe pelas corridas, segundo o contrato
          <select
            className={field}
            value={beneficiary}
            onChange={(event) => setBeneficiary(event.target.value as FleetBeneficiary)}
          >
            {BENEFICIARIES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className={hint}>
        Este campo só registra o que o contrato diz. O repasse das corridas continua sendo feito ao motorista.
      </p>
      {from && until && !ordered && <p className="text-sm text-red-700">O fim da cessão precisa ser depois do início.</p>}
      {ordered && !bounded && (
        <p className="text-sm text-red-700">
          A cessão precisa terminar no futuro, começar no máximo um dia atrás e durar até 13 meses.
        </p>
      )}
      <button type="submit" className={primary} disabled={action.busy || !valid}>
        Enviar cessão para revisão
      </button>
      {action.message}
    </form>
  );
}

function VehicleCard({
  account,
  vehicle,
  assignments,
  drivers,
  now,
  refresh,
}: {
  account: FleetAccount;
  vehicle: FleetVehicle;
  assignments: FleetAssignment[];
  drivers: FleetMember[];
  now: number;
  refresh: () => void;
}) {
  const action = useAction(refresh);
  const [open, setOpen] = useState<'assign' | 'documents' | null>(null);
  const [notice, setNotice] = useState('');
  const title = useId();
  const documents = [
    { name: 'Documento do veículo', ref: vehicle.document_ref, until: vehicle.vehicle_until },
    { name: 'Seguro', ref: vehicle.insurance_ref, until: vehicle.insurance_until },
    { name: 'Revisão ou vistoria', ref: vehicle.inspection_ref, until: vehicle.inspection_until },
  ].map((item) => ({ ...item, over: isOver(item.until, now) }));
  const overdue = documents.some((item) => item.over);
  const current = assignments.filter(
    (item) => (item.status === 'pending_review' || item.status === 'approved') && !isOver(item.until, now),
  );
  const earlier = assignments.filter((item) => !current.includes(item));
  const period = (item: FleetAssignment) => `${formatDateTime(item.from)} a ${formatDateTime(item.until)} (São Paulo)`;
  return (
    <article className={card} aria-labelledby={title}>
      <h3 id={title} className="font-semibold text-gray-900">
        {vehicle.vehicle_identifier} · {categoryName(vehicle.category)}
        {vehicle.status === 'retired' && ' · fora de uso'}
      </h3>
      <ul className="space-y-1 text-sm">
        {documents.map((item) => (
          <li key={item.name}>
            {item.name} · {item.ref} · válido até {formatDateBR(item.until)}
            {item.over && <strong className="ml-2 rounded-sm bg-red-100 px-2 py-0.5 text-xs text-red-800">Vencido</strong>}
          </li>
        ))}
      </ul>
      {overdue && (
        <p role="status" className={banner}>
          Há documento vencido. O motorista deste veículo não recebe novas ofertas até você atualizar os documentos e a
          operação revisar a cessão.
        </p>
      )}
      {current.length === 0 && <p>Nenhum motorista está com este veículo agora.</p>}
      {current.map((item) => (
        <div key={item.id} className="space-y-2 border-l-2 border-primary/30 pl-3">
          <p className="font-medium">
            {personName(item.driver_name)} · {assignmentName(item.status)}
          </p>
          <p className="text-sm">
            {period(item)} · Contrato {item.cession_ref} · Beneficiário contratado: {beneficiaryName(item.beneficiary)}
          </p>
          {item.status === 'pending_review' && (
            <p className={hint}>
              Enquanto a revisão não termina, o motorista não recebe ofertas com este veículo. A cessão já está na fila da
              operação: não é preciso avisar.
            </p>
          )}
          {item.status === 'approved' && Date.parse(item.from) > now && (
            <p className={hint}>Aprovada. O motorista recebe ofertas a partir do início do período.</p>
          )}
          <Confirm
            label={`Encerrar cessão de ${personName(item.driver_name)}`}
            confirmLabel="Confirmar encerramento"
            busy={action.busy}
            onConfirm={() =>
              confirmed(action, 'end:' + item.id, async (key) => {
                await fleets.endAssignment(item.id, key);
                return 'Cessão encerrada. As corridas já feitas continuam no resumo do mês.';
              })
            }
          >
            Encerrar a cessão de {vehicle.vehicle_identifier} a {personName(item.driver_name)}? O motorista deixa de receber
            ofertas com este veículo. Para ceder de novo, será preciso outra revisão da operação.
          </Confirm>
        </div>
      ))}
      {notice && <p role="status">{notice}</p>}
      {action.message}
      <div className="flex flex-wrap gap-3">
        {current.length === 0 && !overdue && drivers.length > 0 && (
          <button
            type="button"
            className={open === 'assign' ? secondary : primary}
            aria-expanded={open === 'assign'}
            onClick={() => setOpen(open === 'assign' ? null : 'assign')}
          >
            {open === 'assign' ? 'Fechar cessão' : 'Ceder a um motorista'}
          </button>
        )}
        <button
          type="button"
          className={overdue && open !== 'documents' ? primary : secondary}
          aria-expanded={open === 'documents'}
          onClick={() => setOpen(open === 'documents' ? null : 'documents')}
        >
          {open === 'documents' ? 'Fechar documentos' : 'Atualizar documentos'}
        </button>
      </div>
      {current.length === 0 && !overdue && drivers.length === 0 && (
        <p className={hint}>Convide um motorista para a frota, abaixo, antes de ceder este veículo.</p>
      )}
      {open === 'assign' && current.length === 0 && (
        <AssignForm
          vehicle={vehicle}
          drivers={drivers}
          now={now}
          refresh={refresh}
          onAssigned={(text) => {
            setNotice(text);
            setOpen(null);
          }}
        />
      )}
      {open === 'documents' && (
        <VehicleForm
          account={account.id}
          vehicle={vehicle}
          today={todayInSaoPaulo(new Date(now))}
          refresh={refresh}
          onSaved={(text) => {
            setNotice(text);
            setOpen(null);
          }}
        />
      )}
      {earlier.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm">Cessões anteriores ({earlier.length})</summary>
          <ul className="mt-2 space-y-1 text-sm">
            {earlier.map((item) => (
              <li key={item.id}>
                {personName(item.driver_name)} · {period(item)} ·{' '}
                {item.status === 'approved' || item.status === 'pending_review' ? 'Período encerrado' : assignmentName(item.status)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}

function People({ account, userId, refresh }: { account: FleetAccount; userId: string; refresh: () => void }) {
  const action = useAction(refresh);
  const page = useInvitePage();
  const linkId = useId();
  const admin = account.role === 'admin';
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<FleetRole>('fleet_driver');
  const [minutes, setMinutes] = useState(1440);
  const [link, setLink] = useState('');
  const active = account.members.filter((member) => member.status === 'active');
  const pending = account.invites.filter((invite) => invite.status === 'pending');
  const wanted = email.trim();
  function invite(event: FormEvent) {
    event.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(wanted)) return;
    setLink('');
    void action.run(JSON.stringify(['invite', wanted.toLowerCase(), role, minutes]), async (key) => {
      // The token is answered only once, so the page address is checked before issuing.
      if (!page) return 'O endereço dos convites ainda não foi configurado para este aplicativo.';
      const issued = await fleets.inviteMember(account.id, wanted, role, minutes, key);
      if (!issued.token)
        return 'Este convite já tinha sido gerado e o link aparece uma única vez. Se ele se perdeu, revogue o convite e gere outro.';
      setLink(page + '#adesao=' + issued.token);
      setEmail('');
      return 'Convite gerado. Envie o link por um canal de confiança.';
    });
  }
  return (
    <section className={card} aria-labelledby="frota-pessoas">
      <h2 id="frota-pessoas" className={cardTitle}>
        Motoristas e gestores
      </h2>
      <ul className="space-y-3">
        {active.map((member) => (
          <li key={member.member_id} className="space-y-1">
            <p>
              {personName(member.name)}
              {member.member_id === userId && ' · você'} · {roleName(member.role)}
            </p>
            {admin && member.member_id !== userId && member.role !== 'admin' && (
              <Confirm
                label={`Remover ${personName(member.name)} da frota`}
                confirmLabel="Confirmar remoção"
                busy={action.busy}
                onConfirm={() =>
                  confirmed(action, 'remove:' + member.member_id, async (key) => {
                    await fleets.removeMember(account.id, member.member_id, key);
                    return `${personName(member.name)} não faz mais parte desta frota.`;
                  })
                }
              >
                Remover {personName(member.name)} desta frota? As cessões em aberto dessa pessoa são encerradas e ela deixa
                de dirigir os veículos da frota. As corridas já feitas continuam registradas e, para voltar, será preciso
                um novo convite.
              </Confirm>
            )}
          </li>
        ))}
      </ul>
      {active.every((member) => member.role !== 'fleet_driver') && (
        <p className={hint}>
          Nenhum motorista na frota ainda. Gere um convite abaixo: o motorista entra com a própria conta WorkEasy.
        </p>
      )}
      {pending.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold">Convites pendentes</h3>
          <ul className="space-y-2">
            {pending.map((item) => (
              <li key={item.id} className="space-y-1">
                <p>
                  {roleName(item.role)} · válido até {formatDateTime(item.expires_at)} (São Paulo)
                </p>
                <Confirm
                  label="Revogar convite"
                  confirmLabel="Confirmar revogação"
                  busy={action.busy}
                  onConfirm={() =>
                    confirmed(action, 'revoke:' + item.id, async () => {
                      await fleets.revokeInvite(item.id);
                      return 'Convite revogado. O link deixou de funcionar.';
                    })
                  }
                >
                  Revogar este convite? O link enviado deixa de funcionar. Para convidar de novo, gere outro convite.
                </Confirm>
              </li>
            ))}
          </ul>
        </div>
      )}
      <form className="space-y-3" onSubmit={invite}>
        <h3 className="font-semibold">Convidar para a frota</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            E-mail da pessoa convidada
            <input
              className={field}
              type="email"
              required
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="block">
            Papel na frota
            <select className={field} value={role} onChange={(event) => setRole(event.target.value as FleetRole)}>
              <option value="fleet_driver">{roleName('fleet_driver')}</option>
              {admin && <option value="manager">{roleName('manager')}</option>}
            </select>
          </label>
          <label className="block">
            Validade do convite
            <select className={field} value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}>
              {ADHESION_VALIDITY.map((item) => (
                <option key={item.minutes} value={item.minutes}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className={hint}>Só a conta WorkEasy com este e-mail confirmado consegue abrir o convite.</p>
        <button type="submit" className={secondary} disabled={action.busy || !/^\S+@\S+\.\S+$/.test(wanted)}>
          Gerar convite
        </button>
      </form>
      {link && (
        <div className="space-y-1 rounded-xl bg-gray-50 p-3">
          <label htmlFor={linkId} className="block text-sm font-medium text-gray-700">
            Link para copiar
          </label>
          <input id={linkId} readOnly className={field} value={link} onFocus={(event) => event.target.select()} />
          <p className={hint}>O link aparece uma única vez. Guarde-o agora ou gere outro convite depois.</p>
        </div>
      )}
      {action.message}
    </section>
  );
}

function MonthSummary({
  account,
  currentMonth,
  current,
}: {
  account: string;
  currentMonth: string;
  current: FleetOverview;
}) {
  const [month, setMonth] = useState(currentMonth);
  const chosen = /^\d{4}-\d{2}$/.test(month) ? month : currentMonth;
  // The current month is already on the page; another month is read when chosen.
  const other = useAsync(
    () => (chosen === currentMonth ? Promise.resolve(null) : fleets.overview(account, chosen + '-01')),
    account + ':' + chosen,
  );
  const overview = chosen === currentMonth ? current : other.data;
  const identifier = (id: string) => overview?.vehicles.find((item) => item.id === id)?.vehicle_identifier ?? 'Veículo fora da lista';
  const earned = (overview?.legs ?? []).filter((leg) => leg.status === 'completed' && typeof leg.driver_cents === 'number');
  return (
    <section className={card} aria-labelledby="frota-resumo">
      <h2 id="frota-resumo" className={cardTitle}>
        Resumo do mês
      </h2>
      <label className="block max-w-xs">
        Mês
        <input
          className={field}
          type="month"
          max={currentMonth}
          value={month}
          onChange={(event) => setMonth(event.target.value)}
        />
      </label>
      <ErrorAlert error={chosen === currentMonth ? null : other.error} />
      {!overview ? (
        other.loading && <p role="status">Carregando o resumo…</p>
      ) : overview.legs.length === 0 ? (
        <p>Nenhuma corrida com veículos desta frota em {monthName(chosen)}.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Corridas com veículos da frota em {monthName(chosen)}</caption>
            <thead>
              <tr className="border-b border-gray-200">
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Data
                </th>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Veículo
                </th>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Situação
                </th>
                <th scope="col" className="py-2 font-semibold">
                  Parte do motorista
                </th>
              </tr>
            </thead>
            <tbody>
              {overview.legs.map((leg, index) => (
                <tr key={index} className="border-b border-gray-100">
                  <td className="py-2 pr-3">{formatDateBR(leg.date)}</td>
                  <td className="py-2 pr-3">{identifier(leg.vehicle_id)}</td>
                  <td className="py-2 pr-3">{legStatus(leg.status)}</td>
                  <td className="py-2">{typeof leg.driver_cents === 'number' ? formatCents(leg.driver_cents) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {earned.length > 0 && (
        <p className="font-medium">
          Corridas concluídas com valor informado: {formatCents(earned.reduce((sum, leg) => sum + (leg.driver_cents ?? 0), 0))}
        </p>
      )}
      <p className={hint}>
        O resumo traz só data, veículo e situação das corridas feitas com os veículos desta frota. Trajetos, passageiros e
        corridas particulares do motorista não aparecem. O valor é mostrado quando o contrato de cessão indica a frota
        como beneficiária.
      </p>
    </section>
  );
}

function Management({ account, userId, refresh }: { account: FleetAccount; userId: string; refresh: () => void }) {
  const currentMonth = todayInSaoPaulo().slice(0, 7);
  const result = useAsync(
    async () => ({ overview: await fleets.overview(account.id, currentMonth + '-01'), loaded: Date.now() }),
    account.id + ':' + currentMonth,
  );
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState('');
  const saved = (text: string) => {
    setNotice(text);
    setAdding(false);
  };
  const reloadOverview = result.reload;
  useEffect(() => {
    const again = () => {
      if (document.visibilityState === 'visible') reloadOverview();
    };
    const timer = window.setInterval(again, 30_000);
    document.addEventListener('visibilitychange', again);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', again);
    };
  }, [reloadOverview]);
  const reload = () => {
    reloadOverview();
    refresh();
  };
  if (!result.data)
    return (
      <div className="space-y-3">
        {result.loading && <p role="status">Carregando veículos…</p>}
        <ErrorAlert error={result.error} />
        {result.error && (
          <button type="button" className={secondary} onClick={reloadOverview}>
            Tentar novamente
          </button>
        )}
      </div>
    );
  const { overview, loaded } = result.data;
  const drivers = account.members.filter((member) => member.role === 'fleet_driver' && member.status === 'active');
  const today = todayInSaoPaulo(new Date(loaded));
  return (
    <>
      <ErrorAlert error={result.error} />
      <section className="space-y-3" aria-labelledby="frota-veiculos">
        <h2 id="frota-veiculos" className={cardTitle}>
          Veículos
        </h2>
        {overview.vehicles.map((vehicle) => (
          <VehicleCard
            key={vehicle.id}
            account={account}
            vehicle={vehicle}
            assignments={overview.assignments.filter((item) => item.vehicle_id === vehicle.id)}
            drivers={drivers}
            now={loaded}
            refresh={reload}
          />
        ))}
        {overview.vehicles.length === 0 ? (
          <div className={card}>
            <h3 className="font-semibold text-gray-900">Cadastrar o primeiro veículo</h3>
            <p>
              Nenhum veículo cadastrado. Informe o veículo e a validade do documento, do seguro e da revisão; depois
              você poderá cedê-lo a um motorista da frota.
            </p>
            <VehicleForm account={account.id} today={today} refresh={reload} onSaved={saved} />
          </div>
        ) : adding ? (
          <div className={card}>
            <h3 className="font-semibold text-gray-900">Cadastrar outro veículo</h3>
            <VehicleForm account={account.id} today={today} refresh={reload} onSaved={saved} />
            <button type="button" className="text-sm underline" onClick={() => setAdding(false)}>
              Fechar cadastro
            </button>
          </div>
        ) : (
          <button type="button" className={secondary} onClick={() => setAdding(true)}>
            Cadastrar outro veículo
          </button>
        )}
        {notice && <p role="status">{notice}</p>}
      </section>
      <People account={account} userId={userId} refresh={reload} />
      <Ownership account={account} userId={userId} onChange={reload} />
      <MonthSummary account={account.id} currentMonth={currentMonth} current={overview} />
    </>
  );
}

const cessionNote = (cession: DriverCession, now: number) =>
  cession.status === 'pending_review'
    ? 'Em revisão pela operação: você ainda não recebe ofertas com este veículo.'
    : cession.status === 'approved'
      ? Date.parse(cession.from) > now
        ? 'Aprovada. As ofertas começam no início do período.'
        : 'Aprovada. Você recebe ofertas com este veículo enquanto os documentos dele estiverem em dia.'
      : assignmentName(cession.status);

function DriverMembership({
  account,
  userId,
  refresh,
  onLeft,
}: {
  account: FleetAccount;
  userId: string;
  refresh: () => void;
  onLeft: (notice: string) => void;
}) {
  const action = useAction(refresh);
  const mine = useAsync(async () => ({ cessions: await fleets.myCessions(), loaded: Date.now() }), 'cessions:' + userId);
  const now = mine.data?.loaded ?? 0;
  const cessions = (mine.data?.cessions ?? []).filter((item) => item.account_id === account.id);
  const open = cessions.filter(
    (item) => (item.status === 'pending_review' || item.status === 'approved') && Date.parse(item.until) > now,
  );
  return (
    <section className={card} aria-labelledby="frota-motorista">
      <h2 id="frota-motorista" className={cardTitle}>
        Você dirige por esta frota
      </h2>
      <p>
        A frota cadastra o veículo e a cessão, e a operação WorkEasy revisa antes de liberar ofertas. Enquanto você fizer
        parte da frota, só recebe ofertas com um veículo cedido e revisado; sem cessão aprovada, com cessão em revisão ou
        com documento do veículo vencido, não chegam novas ofertas.
      </p>
      <h3 className="font-semibold">Suas cessões nesta frota</h3>
      {mine.loading && !mine.data && <p role="status">Consultando cessões…</p>}
      <ErrorAlert error={mine.error} />
      {mine.data &&
        (open.length ? (
          <ul className="space-y-3">
            {open.map((item) => (
              <li key={item.id} className="space-y-1 border-l-2 border-primary/30 pl-3">
                <p className="font-medium">
                  {item.vehicle_identifier} · {categoryName(item.category)}
                </p>
                <p className="text-sm">
                  {formatDateTime(item.from)} a {formatDateTime(item.until)} (São Paulo) · Contrato {item.cession_ref} ·
                  Beneficiário contratado: {beneficiaryName(item.beneficiary)}
                </p>
                <p className={hint}>{cessionNote(item, now)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p>
            Nenhuma cessão em aberto. Sem ela você não recebe ofertas: peça à frota que envie a cessão de um veículo para
            revisão, ou saia da frota para voltar a dirigir como independente.
          </p>
        ))}
      {cessions.length > open.length && (
        <p className={hint}>Cessões encerradas, recusadas ou com período vencido: {cessions.length - open.length}.</p>
      )}
      <p>
        <Link className="text-primary underline" to="/corridas/motorista">
          Abrir a área do motorista
        </Link>
      </p>
      <Confirm
        label="Sair desta frota"
        confirmLabel="Confirmar saída"
        busy={action.busy}
        onConfirm={() =>
          confirmed(action, 'leave:' + account.id, async (key) => {
            await fleets.removeMember(account.id, userId, key);
            onLeft('Você saiu de ' + account.name + '.');
            return '';
          })
        }
      >
        Sair de {account.name}? Suas cessões em aberto são encerradas e você deixa de dirigir os veículos desta frota.
        Suas corridas anteriores continuam registradas e, para voltar, será preciso um novo convite.
      </Confirm>
      {action.message}
    </section>
  );
}

/**
 * The working area of a fleet: vehicles, people and the month summary for who manages one the
 * operation has checked, or the membership card (with the driver's own cessions) for a driver.
 * What each role may do is decided again by the database on every call.
 */
export default function FleetPanel({
  account,
  userId,
  refresh,
  onLeft,
}: {
  account: FleetAccount;
  userId: string;
  refresh: () => void;
  /** The account leaves the list on the next read, so the page keeps the notice. */
  onLeft: (notice: string) => void;
}) {
  return account.role === 'fleet_driver' ? (
    <DriverMembership account={account} userId={userId} refresh={refresh} onLeft={onLeft} />
  ) : (
    <Management account={account} userId={userId} refresh={refresh} />
  );
}
