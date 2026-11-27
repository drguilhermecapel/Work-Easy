import { describe, expect, it, vi } from 'vitest';
import { AsaasClient, ASAAS_SANDBOX_URL } from '../../supabase/functions/_shared/asaas-client';
import { rideCheckout, rideWebhook, type Intent, type Observation, type RidePspDeps } from '../../supabase/functions/_shared/ride-psp';
import { orderPaymentContract } from '../../supabase/functions/_shared/ride-order-psp';
import { orderRefund, walletTransfer, walletWebhook, type Transfer, type TransferDeps } from '../../supabase/functions/_shared/ride-order-adjustments';

const id='bd2129f1-ae75-4603-9234-d80ebb62a0bd', wallet='fe57a2f6-e718-448d-a6b5-27ba593b101c';
const token='fixture-order-test-webhook-secret', ref='we-order-test:'+id, contract=orderPaymentContract('simulation');
const request=(data:unknown,webhook?:string)=>new Request('https://example.test',{method:'POST',headers:{'Content-Type':'application/json',...(webhook?{'asaas-access-token':webhook}:{})},body:JSON.stringify(data)});
const piece={id:'split_204',walletId:wallet,fixedValue:27,totalValue:27,status:'DONE'};
const charge={id:'pay_204',customer:'cus_204',externalReference:ref,billingType:'CREDIT_CARD',creditCard:{creditCardBrand:'VISA'},value:30,netValue:29.5,
 status:'RECEIVED',split:[piece],invoiceUrl:'https://sandbox.asaas.com/i/204'};
function api(handle:(method:string,path:string,body:Record<string,unknown>|null)=>unknown){
 return new AsaasClient({apiKey:'test-local-only',baseUrl:ASAAS_SANDBOX_URL,fetch:async(input,init)=>{
   const url=new URL(input);expect(url.origin).toBe('https://api-sandbox.asaas.com');
   return Response.json(await handle(init?.method ?? 'GET',url.pathname+(url.search || ''),init?.body?JSON.parse(String(init.body)):null));
 }});
}
function fixture(client:AsaasClient){
 const intent:Intent={leg_id:id,customer:'cus_204',wallet,driver_cents:2700,extras_cents:0,amount_cents:3000,method:'CREDIT_CARD',brands:['VISA'],payment_id:null,create:true};
 const facts:Observation[]=[]; let leased=false;
 const deps:RidePspDeps={api:client,token,session:async()=>'actor',now:()=>new Date('2026-11-27T10:00Z'),
   prepare:async()=>intent,find:async()=>intent,claimSend:async()=>{if(leased)return false; leased=true;return true;},
   observe:async(_,fact)=>{facts.push(fact);return fact.status;}};
 return {deps,intent,facts};
}
describe('ordens hospedadas Asaas com fonte de rede injetada',()=>{
 it('emite um cartão com split fixo de carteira de teste em duas requisições concorrentes',async()=>{
   let sends=0;
   const f=fixture(api((method,path,body)=>{
     if(path.includes('externalReference')) return {data:[],hasMore:false,totalCount:0};
     if(path.endsWith('/simulate')) {expect(body?.billingTypes).toEqual(['CREDIT_CARD']);return {value:30,creditCard:{netValue:29.5}};}
     if(method==='POST'){sends++; expect(body).toMatchObject({billingType:'CREDIT_CARD',customer:'cus_204',split:[{walletId:wallet,fixedValue:27}]});
       expect(body).not.toHaveProperty('creditCard');return charge;}
     return {...charge,status:'PENDING',split:[{...piece,status:'PENDING'}]};
   }));
   const responses=await Promise.all([1,2].map(()=>rideCheckout(request({leg_id:id,billingType:'PIX',wallet:'malicious'}),f.deps,contract)));
   expect(sends).toBe(1);expect(responses.map(r=>r.status).sort()).toEqual([200,409]);
   expect(f.facts[0]).toMatchObject({status:'pending',pspFee:50,splitCents:2700,invoice:charge.invoiceUrl});
 });
 it('bloqueia tarifa PSP que consumiria o repasse e nunca emite a fatura',async()=>{
   const f=fixture(api((method,path)=>{if(method==='GET')return {data:[],hasMore:false,totalCount:0};expect(path).toMatch(/simulate$/);return {value:30,creditCard:{netValue:26}};}));
   expect((await rideCheckout(request({leg_id:id}),f.deps,contract)).status).toBe(409);expect(f.facts).toHaveLength(0);
 });
 it('webhook exige segredo e consulta a fonte; estado anterior e chargeback não viram entrada nova',async()=>{
   let state:unknown=charge;
   const f=fixture(api(()=>state));
   const event={event:'PAYMENT_RECEIVED',payment:{id:charge.id,value:9999}};
   expect((await rideWebhook(request(event,'wrong'),f.deps,contract)).status).toBe(401);
   await rideWebhook(request(event,token),f.deps,contract);
   expect(f.facts[0]).toMatchObject({status:'paid',amount:3000,paidToDriver:2700});
   state={...charge,status:'CHARGEBACK_REQUESTED'};
   await rideWebhook(request(event,token),f.deps,contract);
   expect(f.facts.at(-1)).toMatchObject({status:'review',invoice:null});
   state={...charge,externalReference:'we-order-live:'+id};
   await rideWebhook(request(event,token),f.deps,contract);
   expect(f.facts).toHaveLength(2);
 });
 it('estorno exige decisão e reparte a devolução pelo ID do split verificado',async()=>{
   let refunded=false,posts=0;
   const f=fixture(api((method,path,body)=>{
     if(method==='POST'){posts++;expect(path).toMatch(/pay_204\/refund$/);expect(body).toMatchObject({value:10,splitRefunds:[{id:piece.id,value:9}]});refunded=true;return charge;}
     return {...charge,refunds:refunded?[{status:'DONE',value:10,refundedSplits:[{id:piece.id,value:9,done:true}]}]:[]};
   }));f.intent.payment_id=charge.id;
   const deps={...f.deps,refund:async()=>({case_id:id,order_id:id,payment:charge.id,amount:1000,target:1000,split_return:900,wallet,create:true}),claimRefund:async()=>!refunded};
   for(let n=0;n<2;n++) expect((await orderRefund(request({case_id:id,extras_cents:0,evidence:'fixture'}),deps,contract)).status).toBe(200);
   expect(posts).toBe(1);expect(f.facts.at(-1)).toMatchObject({refunded:1000,returnedByDriver:900});
 });
});
describe('saque na carteira individual',()=>{
 it('reconsulta transferência e carteira e nunca repete POST após resposta perdida',async()=>{
   const record=vi.fn(async()=>true);
   const transfer:Transfer={id,wallet,type:'EVP',destination:'test-destination',gross:1000,net:1000,fee:0,provider_ref:null,status:'reserved',sent:false};
   let lost=true,posts=0; const external='278d6c5b-0756-4e88-bbe6-8ac068ab8763';
   const client=api((method,path,body)=>{
     if(path.endsWith('/wallets/'))return {totalCount:1,hasMore:false,data:[{id:wallet}]};
     if(method==='POST'){posts++;expect(body).toMatchObject({pixAddressKey:transfer.destination,value:10});if(lost) throw new Error('lost');return {id:external};}
     return {id:external,externalReference:'we-withdraw-test:'+id,type:'BANK_ACCOUNT',operationType:'PIX',value:10,netValue:10,transferFee:0,
         bankAccount:{pixAddressKey:transfer.destination},status:'DONE',effectiveDate:'2026-11-27',endToEndIdentifier:'E-test'};
   });
   const deps:TransferDeps={environment:'simulation',token,enabled:true,session:async()=>'actor',view:async()=>transfer,
     api:()=>client,claim:async()=>{if(transfer.sent)return false;transfer.sent=true;return true;},observe:record};
   expect((await walletTransfer(request({withdrawal:id}),deps)).status).toBe(409);
   lost=false;
   expect((await walletTransfer(request({withdrawal:id}),deps)).status).toBe(409);
   expect(posts).toBe(1);expect(record).not.toHaveBeenCalled();
   const hook={transfer:{id:external,externalReference:'we-withdraw-test:'+id}};
   expect((await walletWebhook(request(hook,'wrong'),deps)).status).toBe(401);
   expect((await walletWebhook(request(hook,token),deps)).status).toBe(200);
   expect(record).toHaveBeenCalledWith(transfer,external,'paid');
 });
});
