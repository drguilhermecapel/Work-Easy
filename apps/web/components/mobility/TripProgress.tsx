import { useEffect, useState } from 'react';
import { db } from '../../services/client';

type Progress = { status:string; eta:string|null; position:{lat:number;lng:number;at:string}|null; simulation:boolean };
const clock = (value:string) => new Intl.DateTimeFormat('pt-BR',{hour:'2-digit', minute:'2-digit', timeZone:'America/Sao_Paulo'}).format(new Date(value));

// Use same-origin raster tiles supplied by the contracted map provider through
// WorkEasy. Sending a passenger position to an arbitrary map host is avoided.
function PositionMap({lat,lng}: {lat:number;lng:number}) {
  const base = import.meta.env.VITE_RIDE_TILE_PATH?.trim();
  if (!base || !/^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+$/.test(base)) return <p>Posição recebida. O mapa desta região está indisponível.</p>;
  const zoom = 15;
  const scale = 2**zoom;
  const x = (lng+180)/360*scale;
  const bounded = Math.max(-85, Math.min(85, lat));
  const y = (1-Math.asinh(Math.tan(bounded*Math.PI/180))/Math.PI)/2*scale;
  const col = Math.floor(x), row = Math.floor(y);
  return <div role="img" aria-label="Posição atual do veículo no mapa" className="relative h-48 overflow-hidden rounded-lg bg-slate-100">
    {[-1,0,1].flatMap(dy=>[-1,0,1].map(dx=><img key={dx+','+dy} alt="" width={256} height={256} referrerPolicy="no-referrer"
      className="pointer-events-none absolute max-w-none" src={base+'/'+zoom+'/'+(col+dx)+'/'+(row+dy)+'.png'}
      style={{left:'calc(50% + '+(col+dx-x)*256+'px)',top:'calc(50% + '+(row+dy-y)*256+'px)'}} />))}
    <span className="absolute left-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue-700"/>
    <small className="absolute bottom-0 right-0 bg-white px-1 text-slate-700">{import.meta.env.VITE_RIDE_MAP_ATTRIBUTION}</small>
  </div>;
}

export function TripProgress({legId}: {legId:string}) {
  const [result,setResult] = useState<{legId:string;value:Progress|null}>();
  useEffect(()=>{
    let active=true;
    let timer:ReturnType<typeof setTimeout>;
    const refresh=async()=>{
      try {
        const {data,error}=await db().rpc('ride_progress',{p_leg:legId});
        if(active) setResult({legId,value:error ? null : data as unknown as Progress});
      } catch { if(active) setResult({legId,value:null}); }
      if(active) timer=setTimeout(()=>{void refresh();},15000);
    };
    void refresh();
    return ()=>{active=false;clearTimeout(timer);};
  },[legId]);
  if(!result || result.legId!==legId) return null;
  const p=result.value;
  if(!p) return <p className="text-sm">Acompanhamento indisponível no momento.</p>;
  if (!['accepted','arriving','boarded'].includes(p.status)) return null;
  return <div className="space-y-2 text-sm"><p>{p.eta ? 'Chegada informada pelo motorista às '+clock(p.eta)+' (São Paulo).' : 'Aguardando previsão atualizada do motorista.'}</p>
    {p.position && <><PositionMap lat={p.position.lat} lng={p.position.lng}/><p>Última posição às {clock(p.position.at)}.</p></>}
  </div>;
}
