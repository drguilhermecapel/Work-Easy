import { asCents, recordCanonical, type RemoteRidePayment, type RidePaymentContract, type RidePspDeps } from './ride-psp.ts';
import type { AsaasClient } from './asaas-client.ts';
import { HttpError, readJson, route, WEBHOOK_BODY_LIMIT } from './http.ts';
import { isUuid, secretMatches } from './secrets.ts';
import { centsToReais } from './money.ts';

const review = () => new HttpError(409,'ride_psp_review','A referência requer conferência da operação.');
const pending = () => new HttpError(409,'ride_psp_unknown','Aguardando confirmação. A mesma operação será consultada.');
const unavailable = () => new HttpError(503,'not_configured','Processamento indisponível.');
type Refund = {case_id:string;order_id:string;payment:string;amount:number;target:number;split_return:number;wallet:string;create:boolean};
export type RefundDeps = RidePspDeps & {
  refund(id:string,actor:string,extras:number,evidence:string):Promise<Refund>;
  claimRefund(id:string):Promise<boolean>;
};
export function orderRefund(req:Request,deps:RefundDeps,contract:RidePaymentContract):Promise<Response>{
 return route(req,{methods:['POST'],siteUrl:deps.siteUrl,allowDevOrigins:deps.allowDevOrigins},async()=>{
   const user=await deps.session(req);
   if(!user) throw new HttpError(401,'not_authenticated','Entre para continuar.');
   if(!deps.api || !deps.token) throw unavailable();
   const input=await readJson(req) as {case_id?:unknown;extras_cents?:unknown;evidence?:unknown};
   if(!input || (typeof input.case_id!=='string' || !isUuid(input.case_id)) || !Number.isSafeInteger(input.extras_cents) || typeof input.evidence!=='string') throw review();
   const r=await deps.refund(input.case_id,user,input.extras_cents as number,input.evidence);
   const intent=await deps.find(r.order_id);
   if(!intent || r.payment!==intent.payment_id) throw review();
   const canonical=async()=> {
     const payment=await deps.api!.getPayment(r.payment) as RemoteRidePayment | null;
     if(!payment || payment.id!==r.payment || payment.customer!==intent.customer || payment.billingType!==intent.method ||
       payment.externalReference!==contract.prefix+r.order_id || asCents(payment.value)!==intent.amount_cents) throw review();
     return payment;
   };
   let charge=await canonical();
   const totalConfirmed=(charge.refunds ?? []).filter(f=>f.status==='DONE').reduce((n,f)=>n+asCents(f.value),0);
   if(charge.status==='REFUNDED' || totalConfirmed>=r.target) return {data:await recordCanonical(contract,deps,intent,charge)};
   if(!r.create || r.amount+totalConfirmed!==r.target || (charge.refunds ?? []).some(f=>f.status!=='DONE' && f.status!=='CANCELLED') ||
      !['RECEIVED','CONFIRMED'].includes(charge.status)) throw pending();
   const split=charge.split?.find(item=>item.walletId===r.wallet);
   if(r.split_return>0 && (!split?.id || charge.split?.length!==1 || asCents(split.fixedValue)!==intent.driver_cents)) throw review();
   if(!await deps.claimRefund(r.case_id)) throw pending();
   try {
     await deps.api.request('POST','/payments/'+encodeURIComponent(r.payment)+'/refund',{
       value:centsToReais(r.amount),description:'WorkEasy '+r.case_id,
       ...(r.split_return>0?{splitRefunds:[{id:split!.id,value:centsToReais(r.split_return)}]}:{})
     });
   } catch {throw pending();}
   charge=await canonical();
   return {data:await recordCanonical(contract,deps,intent,charge)};
 });
}
export interface Transfer {
 id:string;wallet:string;type:string;destination:string;gross:number;fee:number;net:number;
 provider_ref:string|null;status:string;sent:boolean;
}
interface RemoteTransfer {
 id:string; externalReference:string; status:string; type:string; operationType:string; value:number; netValue:number; transferFee:number;
 bankAccount?:{pixAddressKey?:string}; effectiveDate?:string; endToEndIdentifier?:string;
}
export interface TransferDeps {
 environment:'simulation'|'live'; enabled:boolean;token:string;siteUrl?:string;allowDevOrigins?:boolean;
 session(req:Request):Promise<string|null>; view(id:string,actor?:string):Promise<Transfer|null>;
 api(wallet:string):AsaasClient|null; claim(id:string):Promise<boolean>;
 observe(t:Transfer,id:string,status:'unknown'|'paid'|'failed'):Promise<unknown>;
}
const transferRef=(deps:TransferDeps,id:string)=>(deps.environment==='live'?'we-withdraw-live:':'we-withdraw-test:')+id;
async function verifiedAccount(deps:TransferDeps,t:Transfer){
 const api=deps.api(t.wallet);
 if(!api) throw unavailable();
 const wallets=await api.request<{data:{id:string}[];totalCount:number;hasMore:boolean}>('GET','/wallets/');
 if(wallets.totalCount!==1 || wallets.hasMore!==false || wallets.data?.length!==1 || wallets.data[0].id!==t.wallet) throw review();
 return api;
}
async function checkTransfer(deps:TransferDeps,api:AsaasClient,t:Transfer,id:string){
 if(!isUuid(id) || (t.provider_ref && t.provider_ref!==id)) throw review();
 const x=await api.request<RemoteTransfer>('GET','/transfers/'+encodeURIComponent(id));
 if(!x || x.id!==id || x.externalReference!==transferRef(deps,t.id) || x.type!=='BANK_ACCOUNT' || x.operationType!=='PIX'
   || x.bankAccount?.pixAddressKey!==t.destination || asCents(x.netValue)!==t.net || asCents(x.transferFee)!==t.fee
   || asCents(x.value)!==t.gross) throw review();
 if(x.status==='DONE' && (!x.effectiveDate || !x.endToEndIdentifier)) throw review();
 const state=x.status==='DONE'?'paid':['FAILED','CANCELLED'].includes(x.status)?'failed':'unknown';
 return deps.observe(t,x.id,state);
}
export function walletTransfer(req:Request,deps:TransferDeps):Promise<Response>{
 return route(req,{methods:['POST'],siteUrl:deps.siteUrl,allowDevOrigins:deps.allowDevOrigins},async()=>{
   const actor=await deps.session(req);
   if(!actor) throw new HttpError(401,'not_authenticated','Entre para continuar.');
   if(!deps.enabled) throw unavailable();
   const input=await readJson(req) as {withdrawal?:unknown};
   if(!input || (typeof input.withdrawal!=='string' || !isUuid(input.withdrawal))) throw review();
   const t=await deps.view(input.withdrawal,actor);
   if(!t) throw review();
   const api=await verifiedAccount(deps,t);
   if(t.provider_ref) return {data:await checkTransfer(deps,api,t,t.provider_ref)};
   if(t.sent || !await deps.claim(t.id)) throw pending();
   let created: {id:string};
   try {
     created=await api.request('POST','/transfers',{value:centsToReais(t.gross),operationType:'PIX',
       pixAddressKey:t.destination,pixAddressKeyType:t.type,externalReference:transferRef(deps,t.id)});
   } catch {throw pending();}
   return {data:await checkTransfer(deps,api,t,created.id)};
 });
}
export function walletWebhook(req:Request,deps:TransferDeps):Promise<Response>{
 return route(req,{methods:['POST']},async()=>{
   if(!deps.enabled || !deps.token) throw unavailable();
   if(!secretMatches(req.headers.get('asaas-access-token'),deps.token)) throw new HttpError(401,'invalid_token','Token inválido.');
   const b=await readJson(req,WEBHOOK_BODY_LIMIT) as {transfer?:{id?:unknown;externalReference?:unknown}};
   const key=b?.transfer?.externalReference, id=b?.transfer?.id, prefix=transferRef(deps,'');
   if(typeof key!=='string' || !key.startsWith(prefix)) return {data:{ignored:true}};
   if(!isUuid(key.slice(prefix.length)) || typeof id!=='string' || !isUuid(id)) throw review();
   const t=await deps.view(key.slice(prefix.length));
   if(!t || !t.sent) throw review();
   return {data:await checkTransfer(deps,await verifiedAccount(deps,t),t,id)};
 });
}
