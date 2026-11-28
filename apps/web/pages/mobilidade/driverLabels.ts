/** Vehicle categories a fleet registers (stage 5 keeps these three). */
export const VEHICLES = { compact: 'Compacto', sedan: 'Sedã', van: 'Van' } as const;
/** Vehicle categories a driver can apply with: the fleet ones plus SUV and minivan (O17 stage 6, PAR-601). */
export const DRIVER_VEHICLES = { compact: 'Compacto', sedan: 'Sedã', suv: 'SUV', minivan: 'Minivan', van: 'Van' } as const;
export type Vehicle = keyof typeof DRIVER_VEHICLES;

const LABELS: Readonly<Record<string, string>> = {
  ...DRIVER_VEHICLES,
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
