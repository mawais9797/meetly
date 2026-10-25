import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Executes the actual worker with mocked database/provider boundaries. No email,
// push, production database, or other external network requests are made.
const source=ts.transpileModule(readFileSync('supabase/functions/deliver-notifications/index.ts','utf8').replace(/^import .*?;\r?\n/,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
type Options={jobs?:any[];claimError?:boolean;appointment?:any;providerStatus?:number;env?:Record<string,string>};
function harness(options:Options={}){
 const updates:any[]=[],requests:any[]=[],rpcCalls:string[]=[];
 let handler:(request:Request)=>Promise<Response>;
 class Query{
  operation='select';value:any;filters:any[]=[];
  constructor(public table:string){}
  select(){return this;}update(value:any){this.operation='update';this.value=value;return this;}
  upsert(value:any){this.operation='upsert';this.value=value;return this;}
  eq(...args:any[]){this.filters.push(args);return this;}lt(){return this;}in(){return this;}order(){return this;}limit(){return this;}
  single(){return this;}
  then(resolve:any,reject:any){
   if(this.operation!=='select'){updates.push({table:this.table,value:this.value,filters:this.filters});return Promise.resolve({data:null,error:null}).then(resolve,reject);}
   let data:any=[];
   if(this.table==='delivery_jobs')data={status:'Processing'};
   if(this.table==='appointments')data=options.appointment??{status:'Approved',schedule_version:1,scheduled_start_utc:new Date(Date.now()+86400000).toISOString()};
   if(this.table==='profiles')data={user_id:'qa-user',account_status:'Active'};
   return Promise.resolve({data,error:null}).then(resolve,reject);
  }
 }
 const client={from:(table:string)=>new Query(table),rpc:async(name:string)=>{rpcCalls.push(name);return name==='claim_delivery_jobs'?{data:options.jobs??[],error:options.claimError?new Error('mock failure'):null}:{data:true,error:null};},auth:{admin:{getUserById:async()=>({data:{user:{email:'qa@example.com'}},error:null})}}};
 const env={SUPABASE_URL:'https://qa.invalid',SUPABASE_SERVICE_ROLE_KEY:'qa-service-secret',DELIVERY_CRON_SECRET:'qa-cron-secret',EMAIL_FROM:'qa@example.com',RESEND_API_KEY:'qa-provider-secret',...options.env};
 vm.runInNewContext(source,{createClient:()=>client,Deno:{env:{get:(key:string)=>env[key as keyof typeof env]},serve:(fn:any)=>{handler=fn;}},Response,Request,Date,AbortSignal,fetch:async(url:string,init:any)=>{requests.push({url,...init});return new Response(JSON.stringify({id:'mock-provider-id'}),{status:options.providerStatus??200,headers:{'Content-Type':'application/json'}});}});
 return {updates,requests,rpcCalls,call:(method='POST',secret='qa-cron-secret')=>handler(new Request('https://qa.invalid/worker',{method,headers:{'x-cron-secret':secret}}))};
}
const job=(changes:any={})=>({id:'qa-job',recipient_id:'qa-user',appointment_id:'qa-appointment',channel:'email',title:'QA appointment',message:'Synthetic appointment',idempotency_key:'qa-idempotency-key',attempt_count:1,schedule_version:null,...changes});
test('worker: rejects wrong methods and secrets before accessing jobs',async()=>{
 const h=harness();assert.equal((await h.call('GET')).status,405);assert.equal((await h.call('POST','wrong')).status,401);assert.equal(h.rpcCalls.length,0);assert.equal(h.requests.length,0);
});
test('worker: fails closed when cron secret is absent',async()=>{
 const h=harness({env:{DELIVERY_CRON_SECRET:''}});assert.equal((await h.call('POST','')).status,401);assert.equal(h.rpcCalls.length,0);
});
test('worker: claim failure returns a sanitized server error',async()=>{
 const h=harness({claimError:true});const r=await h.call();assert.equal(r.status,500);assert.equal((await r.json()).error,'Could not claim jobs');
});
test('worker: email uses provider idempotency and does not return credentials',async()=>{
 const h=harness({jobs:[job()]});const r=await h.call(),body=await r.text();assert.equal(JSON.parse(body).sent,1);assert.equal(h.requests.length,1);assert.equal(h.requests[0].headers['Idempotency-Key'],'qa-idempotency-key');assert.equal(h.updates.at(-1).value.status,'Sent');assert.ok(!body.includes('secret'));
});
test('worker: transient email failure is requeued with a future retry',async()=>{
 const h=harness({jobs:[job()],providerStatus:503});assert.equal((await (await h.call()).json()).failed,1);const update=h.updates.at(-1).value;assert.equal(update.status,'Pending');assert.ok(Date.parse(update.scheduled_for)>Date.now());
});
test('worker: final provider failure is terminal and records a sanitized reason',async()=>{
 const h=harness({jobs:[job({attempt_count:8})],providerStatus:503});await h.call();const update=h.updates.at(-1).value;assert.equal(update.status,'Failed');assert.equal(update.last_error,'Delivery provider returned HTTP 503');
});
test('worker: stale reminder is cancelled without contacting a provider',async()=>{
 const h=harness({jobs:[job({schedule_version:1})],appointment:{status:'Approved',schedule_version:2,scheduled_start_utc:new Date(Date.now()+86400000).toISOString()}});assert.equal((await (await h.call()).json()).cancelled,1);assert.equal(h.requests.length,0);assert.equal(h.updates.at(-1).value.status,'Cancelled');
});
test('worker: in-app reminders use the transactional RPC',async()=>{
 const h=harness({jobs:[job({channel:'in_app',schedule_version:1})]});assert.equal((await (await h.call()).json()).sent,1);assert.ok(h.rpcCalls.includes('deliver_in_app_reminder'));assert.equal(h.requests.length,0);
});
test('worker: a recipient without push tokens completes without a provider request',async()=>{
 const h=harness({jobs:[job({channel:'push'})]});assert.equal((await (await h.call()).json()).sent,1);assert.equal(h.requests.length,0);
});
