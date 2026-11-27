export const VEHICLES = { compact: 'Compacto', sedan: 'Sedã', van: 'Van' } as const;
export type Vehicle = keyof typeof VEHICLES;

const LABELS: Readonly<Record<string, string>> = {
  ...VEHICLES,
  pending: 'Aguardando revisão',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
  requested: 'Aguardando motorista',
  accepted: 'Aceito pelo motorista',
  arriving: 'A caminho do embarque',
  boarded: 'Passageiro embarcado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  unknown: 'Em apuração',
};

export function mobilityLabel(value: string) {
  return LABELS[value] ?? value;
}
