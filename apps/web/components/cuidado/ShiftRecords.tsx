import React from 'react';
import { MapPin, MapPinOff } from 'lucide-react';
import type { Checkin, DailyReport } from '../../services/care';
import { formatMoment } from './format';

/** "Entrada: qua., 23/10/2030, 08:03" with a link to the map when the caregiver shared the location. */
export const CheckinLine: React.FC<{ checkin: Checkin }> = ({ checkin }) => {
  const located = checkin.lat !== null && checkin.lng !== null;
  return (
    <li className="text-sm text-gray-700 flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="font-semibold">{checkin.kind === 'in' ? 'Entrada' : 'Saída'}:</span>
      <span>{formatMoment(checkin.at)}</span>
      {located ? (
        <a
          className="inline-flex items-center gap-1 text-primary underline"
          href={`https://www.openstreetmap.org/?mlat=${checkin.lat}&mlon=${checkin.lng}#map=17/${checkin.lat}/${checkin.lng}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MapPin size={14} aria-hidden="true" /> Ver local do registro
        </a>
      ) : (
        <span className="inline-flex items-center gap-1 text-gray-500">
          <MapPinOff size={14} aria-hidden="true" /> sem localização
        </span>
      )}
    </li>
  );
};

const REPORT_FIELDS: Array<[key: 'meals' | 'activities' | 'mood' | 'notes', label: string]> = [
  ['meals', 'Refeições'],
  ['activities', 'Atividades'],
  ['mood', 'Humor'],
  ['notes', 'Observações'],
];

/** The caregiver's daily report as the family reads it. */
export const ReportView: React.FC<{ report: DailyReport }> = ({ report }) => (
  <dl className="text-sm space-y-2">
    {REPORT_FIELDS.filter(([key]) => report[key]).map(([key, label]) => (
      <div key={key}>
        <dt className="font-semibold text-gray-800">{label}</dt>
        <dd className="text-gray-700 whitespace-pre-line break-words">{report[key]}</dd>
      </div>
    ))}
  </dl>
);
