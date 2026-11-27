import { useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import ErrorAlert from '../ErrorAlert';
import { formatCents } from '../../lib/money';
import { useAsync } from '../../lib/useAsync';
import { rideOrders, type Desk, type Method, type Order, type OrderReceipt } from '../../services/rideOrders';

const methods: Record<Method, string> = {card:'Cartão no Asaas',pix:'Pix',cash:'Dinheiro ao motorista'};
const components = {fare:'Tarifa do trecho',tip:'Gorjeta voluntária',wait:'Espera no embarque'};
const states: Record<string,string> = {open:'Em aberto',unknown:'Em conciliação',pending:'Aguardando pagamento',settling:'Confirmado, aguardando liquidação',
  review:'Em revisão',paid:'Liquidado',cancelled:'Cancelado',reserved:'Reservado',failed:'Falhou',reported:'Aguardando sua confirmação',
  contested:'Contestado',confirmed:'Confirmado',approved:'Aprovada',declined:'Recusada',settled:'Resolvida',accepted:'Aceito',expired:'Expirado',revoked:'Revogado'};
const button = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50';
const input = 'block w-full rounded-lg border border-gray-300 px-3 py-2';
const date = (instant: string) => new Date(instant).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
const cents = (data:FormData,key:string) => {
  const value = String(data.get(key) ?? '').trim().replace(',','.');
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(value)) throw new Error('Informe um valor em reais com até duas casas decimais.');
  return Number(value.split('.')[0])*100 + Number((value.split('.')[1] ?? '').padEnd(2,'0'));
};
const field = (name:string,label:string,amount=false) => <label className="block text-sm">{label}
  <input aria-label={label} className={input} name={name} required inputMode={amount?'decimal':'text'} maxLength={amount?12:500}/></label>;

function Action({label,children,submit,refresh}:{label:string;children?:ReactNode;submit:(data:FormData,key:string)=>Promise<unknown>;refresh:()=>void}){
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState<unknown>(null);
 const inFlight=useRef(false);
 const attempt=useRef<{fingerprint:string;key:string} | null>(null);
 async function run(event:FormEvent<HTMLFormElement>){
   event.preventDefault(); if(inFlight.current) return;
   const form=event.currentTarget, data=new FormData(form), fingerprint=JSON.stringify(Array.from(data));
   if(!attempt.current || attempt.current.fingerprint!==fingerprint) attempt.current={fingerprint,key:crypto.randomUUID()};
   inFlight.current=true; setBusy(true); setError(null);
   try {await submit(data,attempt.current.key); attempt.current=null; form.reset();refresh();}
   catch(e){setError(e);}
   finally{inFlight.current=false;setBusy(false);}
 }
 return <form className="space-y-2" onSubmit={e=>void run(e)}><fieldset disabled={busy} className="space-y-2">{children}
   <button className={button} type="submit">{busy?'Consultando…':label}</button></fieldset><ErrorAlert error={error}/></form>;
}
function Disclosure({title,children}:{title:string;children:ReactNode}){
 return <details className="space-y-2 rounded-lg border border-gray-200 p-3"><summary className="cursor-pointer font-semibold">{title}</summary>{children}</details>;
}

export function QuotePaymentRules({quote}:{quote:string}){
 const [open,setOpen]=useState(false);
 const result=useAsync(()=>open?rideOrders.terms(quote):Promise.resolve([]),quote+open);
 return <div className="text-sm"><button type="button" className="underline" aria-expanded={open} onClick={()=>setOpen(!open)}>Ver composição e regras do meu preço</button>
 {open && <><ErrorAlert error={result.error}/>{result.data?.map(t=><p key={t.seq}>Trecho {t.seq} · limite {formatCents(t.maximum_cents)} · adicionais {formatCents(t.extras_cents)}.
 {t.rule && <> Base {formatCents(t.rule.base_cents)}, multiplicador {(t.rule.multiplier_bps/10000).toLocaleString('pt-BR')}×.
 Espera após {t.rule.free_wait_minutes} min, {formatCents(t.rule.wait_cents_per_minute)}/min mediante aceite. Ausência: {t.rule.absence_policy}</>}</p>)}</>}</div>;
}

function Receipt({order}:{order:string}){
 const [open,setOpen]=useState(false);
 const {data,error}=useAsync<OrderReceipt|null>(()=>open?rideOrders.receipt(order):Promise.resolve(null),order+open);
 return <div><button className="underline" aria-expanded={open} onClick={()=>setOpen(!open)}>Comprovante e versões</button><ErrorAlert error={error}/>
 {open && data && <ol aria-label="Versões do comprovante gerencial" className="space-y-2">{data.versions.map(v=><li key={v.revision} className="border-l-2 pl-3">
 {date(v.at)} · {states[v.status] ?? v.status} · {methods[v.method]}<br/>Total {formatCents(v.total)}, adicionais {formatCents(v.extras)}, comissão {formatCents(v.commission)}.
 Recebido {formatCents(v.received)} · devolvido {formatCents(v.refunded)}.
 {v.deposited!=null && <> Depositado {formatCents(v.deposited)}, recuperado {formatCents(v.recovered ?? 0)}.</>}</li>)}</ol>}</div>;
}

function PaymentItem({o,desk,refresh}:{o:Order;desk:Desk;refresh:()=>void}){
 const invoice=o.invoice && (desk.environment==='simulation'?/^https:\/\/sandbox\.asaas\.com\/i\/[\w-]+$/:/^https:\/\/www\.asaas\.com\/i\/[\w-]+$/).test(o.invoice)?o.invoice:null;
 const remaining=o.received-o.refunded;
 return <article className="space-y-2 border-t pt-3">
 <h4 className="font-semibold">{components[o.component]} · {formatCents(o.total)}</h4>
 <p>{methods[o.method]} · {states[o.status] ?? o.status}. Recebido {formatCents(o.received)} · devolvido {formatCents(o.refunded)}.
 {o.benefit>0 && <> Benefício {formatCents(o.benefit)}, restaurado {formatCents(o.benefit_returned)}.</>}</p>
 {o.mine && o.method!=='cash' && o.status!=='cancelled' && <Action label={o.status==='open'?'Emitir fatura no Asaas':'Consultar fatura no Asaas'} refresh={refresh} submit={()=>rideOrders.checkout(o.id)}/>}
 {o.mine && invoice && o.status==='pending' && <a className="underline" href={invoice} target="_blank" rel="noopener noreferrer">Abrir fatura hospedada no Asaas</a>}
 {o.can_invite && <Disclosure title="Convidar outra pessoa para dividir"><Action label="Enviar convite de divisão" refresh={refresh} submit={(d,key)=>rideOrders.invite(o.id,String(d.get('code')).trim(),cents(d,'amount'),key)}>
 {field('code','Código fornecido pela outra pessoa')}{field('amount','Parte a convidar (R$)',true)}</Action></Disclosure>}
 {o.mine && o.status==='open' && o.component==='fare' && o.method!=='cash' && desk.benefits.length>0 && !o.received &&
 <Disclosure title="Aplicar benefício"><Action label="Usar este valor" refresh={refresh} submit={(d)=>rideOrders.benefit(o.id,String(d.get('benefit')),cents(d,'amount'))}>
 <label>Saldo disponível<select className={input} name="benefit">{desk.benefits.map(b=><option key={b.id} value={b.id}>{b.source==='promotion'?'Promoção':b.source==='corporate'?'Empresa':b.source==='remediation'?'Reparação':'Crédito'} · {formatCents(b.available)} · válido até {date(b.until)}</option>)}</select></label>
 {field('amount','Valor do benefício (R$)',true)}</Action></Disclosure>}
 {o.can_report_cash && !o.receipts.some(r=>r.status!=='confirmed') && <Action label="Declarar recebimento em dinheiro" refresh={refresh}
 submit={(d,key)=>rideOrders.report(o.id,cents(d,'tendered'),cents(d,'change'),key)}>{field('tendered','Dinheiro entregue (R$)',true)}{field('change','Troco devolvido (R$)',true)}</Action>}
 {o.receipts.map(r=><div key={r.id}><p>Entregue {formatCents(r.tendered)} · troco {formatCents(r.change)} · {states[r.status]}</p>
 {o.mine && r.status==='reported' && <div className="flex flex-wrap gap-2"><Action label="Confirmar dinheiro e troco" refresh={refresh} submit={()=>rideOrders.confirm(r.id,true)}/>
 <Action label="Contestar valor informado" refresh={refresh} submit={()=>rideOrders.confirm(r.id,false)}/></div>}</div>)}
 {o.mine && o.method==='cash' && o.status==='open' && o.received>0 && <Action label={'Pagar saldo de '+formatCents(o.total-o.received)+' por Pix'} refresh={refresh} submit={()=>rideOrders.balancePix(o.id)}/>}
 {o.mine && remaining>0 && !o.cases.some(c=>['open','approved'].includes(c.status)) && <Disclosure title="Pedir revisão ou devolução">
 <Action label="Abrir protocolo financeiro" refresh={refresh} submit={(d,key)=>rideOrders.review(o.id,cents(d,'amount'),String(d.get('reason')),key)}>{field('amount','Valor contestado (R$)',true)}{field('reason','Motivo do pedido')}</Action></Disclosure>}
 {o.cases.map(c=><div key={c.id} className="space-y-1"><p>Protocolo {c.id} · {formatCents(c.amount)} · {states[c.status] ?? c.status}. {c.decision}</p>
 {desk.operator && c.status==='open' && <Action label="Registrar decisão" refresh={refresh} submit={d=>rideOrders.decide(c.id,d.get('decision')==='approve',String(d.get('reason')))}>
 <p>{c.reason}</p><label>Decisão<select className={input} name="decision"><option value="approve">Aprovar</option><option value="decline">Recusar</option></select></label>{field('reason','Fundamentação')}</Action>}
 {desk.operator && c.status==='approved' && o.method!=='cash' && o.received>o.benefit && <Action label="Solicitar ou conciliar estorno no Asaas" refresh={refresh}
 submit={d=>rideOrders.sendRefund(c.id,cents(d,'extras'),String(d.get('reference')))}>{field('extras','Adicionais a devolver no Asaas (R$)',true)}{field('reference','Evidência da repartição do estorno')}</Action>}
 {desk.operator && c.status==='approved' && (o.benefit>0 || o.method==='cash') && <Action label="Conciliar restituição documentada" refresh={refresh} submit={d=>rideOrders.resolve(c.id,d.get('source')==='cash'?'cash':'benefit',cents(d,'extras'),String(d.get('reference')))}>
 <label>Origem<select className={input} name="source">{o.benefit>0 && <option value="benefit">Benefício original</option>}{o.receipts.length>0 && <option value="cash">Dinheiro devolvido ao pagador</option>}</select></label>
 {field('extras','Adicionais restituídos (R$)',true)}{field('reference','Referência do comprovante')}</Action>}</div>)}
 <Receipt order={o.id}/></article>;
}

export function RideOrderPayments({legId,mode='leg',completed=false}:{legId?:string;mode?:'leg'|'inbox'|'driver'|'admin';completed?:boolean}){
 const [open,setOpen]=useState(false);
 const [code,setCode]=useState('');
 const {data,error,reload,loading}=useAsync(()=>open?rideOrders.desk(legId ?? null):Promise.resolve(null),String(legId)+open);
 const title=mode==='driver'?'Carteira do motorista':mode==='inbox'?'Divisão de tarifa e meus comprovantes':mode==='admin'?'Ordens e devoluções do trecho':'Formas de pagamento do trecho';
 const available=data?.methods.filter((m):m is Method=>m==='pix'||m==='card'||m==='cash') ?? [];
 return <section className="space-y-2 text-sm"><button type="button" className="font-semibold underline" aria-expanded={open} onClick={()=>setOpen(!open)}>{title}</button>
 {open && <><ErrorAlert error={error}/>{loading && <p>Consultando…</p>}{data && <div className="space-y-3">
 {data.environment==='simulation' && <p className="text-amber-900">Ensaio financeiro com valores fictícios.</p>}
 {legId && data.can_open && !data.has_plan && available.length>0 && <Action label="Confirmar forma de pagamento" refresh={reload} submit={d=>rideOrders.open(legId,String(d.get('method')) as Method)}>
 <label>Forma de pagamento<select name="method" className={input}>{available.map(m=><option key={m} value={m}>{methods[m]}</option>)}</select></label></Action>}
 {mode==='inbox' && <Action label="Gerar meu código para receber convite" refresh={reload} submit={async()=>setCode(await rideOrders.code())}/>}
 {code && <p>Código válido por 15 minutos: <code>{code}</code></p>}
 {data.invites.map(i=><div key={i.id}><p>{i.incoming?'Convite recebido':'Convite enviado'} · {formatCents(i.cents)} · {states[i.status] ?? i.status} · até {date(i.expires)}</p>
 {i.incoming && i.status==='pending' && <div className="flex gap-2"><Action label="Aceitar minha parte" refresh={reload} submit={()=>rideOrders.answer(i.id,true)}/>
 <Action label="Recusar divisão" refresh={reload} submit={()=>rideOrders.answer(i.id,false)}/></div>}</div>)}
 {mode!=='driver' && data.orders.map(o=><PaymentItem key={o.id} o={o} desk={data} refresh={reload}/>)}
 {legId && completed && data.has_plan && available.some(m=>m!=='cash') && <>
 {data.methods.includes('tips') && !data.orders.some(o=>o.component==='tip') && <Disclosure title="Oferecer gorjeta ao motorista"><Action label="Autorizar gorjeta integral" refresh={reload}
 submit={(d,key)=>rideOrders.add(legId,'tip',cents(d,'amount'),available.includes('pix')?'pix':'card',key)}>{field('amount','Gorjeta (R$)',true)}</Action></Disclosure>}
 {data.wait && data.wait.cents>0 && !data.orders.some(o=>o.component==='wait') && <Action label={'Autorizar espera adicional de '+formatCents(data.wait.cents)} refresh={reload}
 submit={(_,key)=>rideOrders.add(legId,'wait',data.wait!.cents,available.includes('pix')?'pix':'card',key)}><p>Espera medida: {data.wait.minutes} min.</p></Action>}</>}
 {mode==='driver' && data.wallet && <><p>Saldo disponível {formatCents(data.wallet.available)}. Tarifa por saque {formatCents(data.wallet.fee)}. Limite {formatCents(data.wallet.limit)}.</p>
 <Action label="Solicitar saque para minha conta verificada" refresh={reload} submit={async(d,key)=>{const id=await rideOrders.withdraw(key,cents(d,'amount'),data.wallet!.fee); await rideOrders.transfer(id);}}>{field('amount','Valor bruto do saque (R$)',true)}</Action>
 {data.wallet.withdrawals.map(w=><p key={w.id}>Saque {formatCents(w.gross)} · líquido {formatCents(w.gross-w.fee)} · {states[w.status] ?? w.status}</p>)}
 {data.wallet.withdrawals.filter(w=>w.status==='reserved'||w.status==='unknown').map(w=><Action key={w.id} label={'Consultar saque '+w.id} refresh={reload} submit={()=>rideOrders.transfer(w.id)}/>)}</>}
 {((mode==='driver' && !data.wallet) || (mode==='leg' && !data.has_plan && !available.length)) && <p>Nenhuma opção adicional habilitada para esta operação.</p>}
 <button className="underline" onClick={reload}>Atualizar informações financeiras</button></div>}</>}</section>;
}
