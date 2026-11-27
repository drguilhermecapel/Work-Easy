import { render,screen,waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach,describe,expect,it,vi } from 'vitest';
import { RideOrderPayments,QuotePaymentRules } from '../../components/mobility/RideOrderPayments';
import { rideOrders,type Desk,type Order } from '../../services/rideOrders';
vi.mock('../../services/rideOrders',()=>({rideOrders:{desk:vi.fn(),terms:vi.fn(),open:vi.fn(),invite:vi.fn(),answer:vi.fn(),code:vi.fn(),report:vi.fn(),confirm:vi.fn(),
  checkout:vi.fn(),receipt:vi.fn(),benefit:vi.fn(),add:vi.fn(),review:vi.fn(),decide:vi.fn(),resolve:vi.fn(),withdraw:vi.fn(),transfer:vi.fn()}}));
const desk:Desk={environment:'simulation',methods:['card','cash'],can_open:true,has_plan:false,wait:null,orders:[],operator:false,invites:[],benefits:[],wallet:null};
const order:Order={id:'ord',leg_id:'leg',component:'fare',method:'card',total:3309,extras:300,commission:300,received:0,refunded:0,status:'pending',
 invoice:'https://sandbox.asaas.com/i/test',mine:true,can_invite:false,can_report_cash:false,benefit:0,benefit_returned:0,receipts:[],cases:[]};
describe('pagamento por componente',()=>{
 beforeEach(()=>vi.resetAllMocks());
 it('pede consentimento para o método e usa preço no servidor',async()=>{
  vi.mocked(rideOrders.desk).mockResolvedValue(desk);
  render(<RideOrderPayments legId="leg"/>);
  const user=userEvent.setup();await user.click(screen.getByRole('button',{name:'Formas de pagamento do trecho'}));
  await user.selectOptions(await screen.findByRole('combobox'),'cash');
  await user.click(screen.getByRole('button',{name:'Confirmar forma de pagamento'}));
  expect(rideOrders.open).toHaveBeenCalledWith('leg','cash');
 });
 it('exibe somente fatura hospedada no domínio do ambiente e a parcela do pagador',async()=>{
  vi.mocked(rideOrders.desk).mockResolvedValue({...desk,can_open:false,has_plan:true,orders:[order]});
  const user=userEvent.setup();const view=render(<RideOrderPayments legId="leg"/>);
  await user.click(screen.getByRole('button',{name:'Formas de pagamento do trecho'}));
  expect(await screen.findByRole('link',{name:'Abrir fatura hospedada no Asaas'})).toHaveAttribute('href',order.invoice);
  vi.mocked(rideOrders.desk).mockResolvedValue({...desk,orders:[{...order,invoice:'https://www.asaas.com/i/other-environment'}]});
  await user.click(screen.getByRole('button',{name:'Atualizar informações financeiras'}));
  await waitFor(()=>expect(screen.queryByRole('link')).toBeNull());view.unmount();
 });
 it('destinatário pode recusar convite sem assumir saldo de outro pagador',async()=>{
  vi.mocked(rideOrders.desk).mockResolvedValue({...desk,invites:[{id:'inv',cents:1000,expires:'2027-01-02T12:00Z',incoming:true,status:'pending'}]});
  const user=userEvent.setup();render(<RideOrderPayments mode="inbox"/>);
  await user.click(screen.getByRole('button',{name:'Divisão de tarifa e meus comprovantes'}));
  await user.click(await screen.findByRole('button',{name:'Recusar divisão'}));expect(rideOrders.answer).toHaveBeenCalledWith('inv',false);expect(rideOrders.checkout).not.toHaveBeenCalled();
 });
 it('mostra limite, preço base e política de espera congelados no aceite',async()=>{
  vi.mocked(rideOrders.terms).mockResolvedValue([{seq:1,total_cents:3309,maximum_cents:3309,extras_cents:300,rule:{
    base_cents:2006,multiplier_bps:15000,free_wait_minutes:5,wait_cents_per_minute:90,absence_policy:'Acione o plantão.'}}]);
  render(<QuotePaymentRules quote="q"/>);await userEvent.click(screen.getByRole('button',{name:'Ver composição e regras do meu preço'}));
  expect(await screen.findByText(/Acione o plantão/)).toHaveTextContent('1,5×');expect(rideOrders.terms).toHaveBeenCalledWith('q');
 });
});
