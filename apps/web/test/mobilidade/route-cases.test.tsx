import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouteCases } from '../../components/mobility/RouteCases';
import { listRideRouteCases, prepareRoute, measureRoute, type RideRouteCase } from '../../services/rideRoutes';
// Rendering WebGL is covered by the map acceptance check; exercise the surrounding form here.
vi.mock('../../components/mobility/LocalRideMap', () => ({
  LocalRideMap: ({label}: {label?:string}) => <div aria-label={label} />,
}));
vi.mock('../../services/rideRoutes', async (original) => ({
  ...await original<typeof import('../../services/rideRoutes')>(),
  listRideRouteCases:vi.fn(),prepareRoute:vi.fn(),measureRoute:vi.fn(),completeRoute:vi.fn(),
}));
const caseRow:RideRouteCase={
  id:'route-id',booking_id:null,status:'awaiting_review',origin_area:'Saúde',destination_area:'Jabaquara',
  service_endpoint:null,origin:null,destination:null,can_complete:false,can_claim:false,can_verify:false,can_quote:false,minutes:null,meters:null,valid_until:null,
};
beforeEach(()=>{vi.resetAllMocks();vi.mocked(listRideRouteCases).mockResolvedValue([]);});
describe('pontos da rota e medição assistida',()=>{
  it.each(['Saúde', 'Jabaquara'])('o cliente fornece apenas o destino da ida, inclusive dentro de uma região (%s)',async(regiaoDestino)=>{
    const user=userEvent.setup();
    render(<RouteCases bookingId="booking-id" areas={['Saúde','Jabaquara']} isServiceClient />);
    expect(screen.getAllByLabelText('Endereço ou ponto de encontro')).toHaveLength(1);
    expect(screen.queryByRole('group',{name:'Embarque'})).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Região de embarque'),'Saúde');
    await user.selectOptions(screen.getByLabelText('Região de destino'),regiaoDestino);
    const destination=within(screen.getByRole('group',{name:'Destino'}));
    await user.type(destination.getByLabelText('Endereço ou ponto de encontro'),'Ponto de atendimento fictício');
    await user.type(destination.getByLabelText('Latitude'),'-23.6');
    await user.type(destination.getByLabelText('Longitude'),'-46.6');
    await user.click(screen.getByRole('button',{name:'Enviar pontos para medição'}));
    expect(prepareRoute).toHaveBeenCalledWith(expect.any(String),'booking-id','Saúde',regiaoDestino,null,
      {label:'Ponto de atendimento fictício',lat:-23.6,lng:-46.6},'destination');
  });
  it('apenas o revisor atribuído vê o formulário de distância',async()=>{
    const user=userEvent.setup();vi.mocked(listRideRouteCases).mockResolvedValue([{...caseRow,can_verify:true}]);
    render(<RouteCases admin bookingId={null} areas={[]} />);
    await user.type(await screen.findByLabelText('Distância por vias (metros)'),'6000');
    await user.type(screen.getByLabelText('Duração prevista (minutos)'),'20');
    await user.type(screen.getByLabelText('Referência da medição autorizada'),'referencia-de-ensaio');
    await user.click(screen.getByRole('button',{name:'Validar trajeto'}));
    await waitFor(()=>expect(measureRoute).toHaveBeenCalledWith('route-id',6000,20,'referencia-de-ensaio'));
  });
});
