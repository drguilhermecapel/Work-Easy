import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DriverEconomics from '../../pages/mobilidade/DriverEconomics';
import { driverStatement, recordDriverDiary, type DriverStatement } from '../../services/driverEconomics';
import { openRideHelp } from '../../services/rideAftercare';
import { todayInSaoPaulo } from '../../lib/timezone';

vi.mock('../../contexts/AuthContext', () => ({useAuth: () => ({authUser: {id:'driver-a'}})}));
vi.mock('../../services/driverEconomics', () => ({driverStatement: vi.fn(),recordDriverDiary: vi.fn()}));
vi.mock('../../services/rideAftercare', () => ({openRideHelp: vi.fn()}));
vi.mock('../../components/mobility/RideAftercare', () => ({RideAftercare: ({legId}:{legId:string}) => <p>Documento do trecho {legId}</p>}));

const report: DriverStatement = {
  from_day: '2026-11-02', until_day:'2026-11-09',simulation:true,diary:null,
  metrics:{
    income:3009,rewards:100,paid:1500,reimbursements:300,opening:0,closing:1609,online_seconds:7200,committed_seconds:3600,
    approach_seconds:600,wait_seconds:600,passenger_seconds:2400,service_seconds:0,time_incomplete:false,missing_days:1,
    paid_meters:5000,empty_meters:0,costs:0,base_net:3009,total_net:3109,per_online_hour:null,per_committed_hour:null,per_km:null,
  },
  entries:[{leg_id:'leg-a',operation_id:'op-a',kind:'earned',at_time:'2026-11-02T12:00:00Z',gross:3309,income:3009,
    reward:0,paid:0,fee:300,extras:300,toll_cents:300,status:'completed',protocol:null}],
  trends:{as_of:'2026-11-02T03:00:00Z',cells:[]},
};

describe('Extrato do motorista',()=>{
  beforeEach(()=>{vi.clearAllMocks();vi.mocked(driverStatement).mockResolvedValue(report);});
  it('consults the chosen period, opens the trip proof and routes a dispute to its payment protocol',async()=>{
    const user=userEvent.setup();
    vi.mocked(openRideHelp).mockResolvedValue('ABC-123');
    render(<DriverEconomics/>);
    expect(driverStatement).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button',{name:'Consultar extrato'}));
    expect(await screen.findByText('Saldo e renda do período')).toBeInTheDocument();
    expect(driverStatement).toHaveBeenLastCalledWith(todayInSaoPaulo(),false);
    await user.selectOptions(screen.getByLabelText('Período do extrato'),'week');
    await waitFor(()=>expect(driverStatement).toHaveBeenLastCalledWith(todayInSaoPaulo(),true));
    await user.click(await screen.findByRole('button',{name:'Ver comprovante'}));
    expect(screen.getByText('Documento do trecho leg-a')).toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'Contestar lançamento'}));
    expect(openRideHelp).toHaveBeenCalledWith('leg-a','payment');
    expect(await screen.findByText('Protocolo de pagamento ABC-123')).toBeInTheDocument();
    expect(screen.getByText('Amostra insuficiente para publicar regiões.')).toBeInTheDocument();
  });
  it('submits actual distances in meters and cost in cents without booking the personal target',async()=>{
    const user=userEvent.setup();
    vi.mocked(recordDriverDiary).mockResolvedValue(true);
    render(<DriverEconomics/>);
    await user.click(screen.getByRole('button',{name:'Consultar extrato'}));
    await user.type(await screen.findByLabelText('Km com passageiro'),'3.123');
    await user.type(screen.getByLabelText('Km vazios e de retorno'),'1.999');
    await user.type(screen.getByLabelText('Gastos próprios (R$)'),'13.07');
    await user.type(screen.getByLabelText('Meta pessoal opcional para o período (R$)'),'100');
    await user.click(screen.getByRole('button',{name:'Salvar diário'}));
    expect(recordDriverDiary).toHaveBeenCalledWith(todayInSaoPaulo(),{paid_meters:3123,empty_meters:1999,cost_cents:1307});
    await waitFor(()=>expect(driverStatement).toHaveBeenCalledTimes(2));
  });
});
