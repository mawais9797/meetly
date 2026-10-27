import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { isValidMeetingUrl } from '../packages/core/src/index';

// Isolated, disposable database. Regression assertions protect the expected
// safeguards; they never contact a live service.
let db: PGlite;
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const q=(sql:string,args:unknown[]=[])=>db.query<any>(sql,args);
async function root(){await db.exec('reset role');}
async function as(n:number){await db.exec(`reset role; select set_config('request.jwt.claim.sub','${id(n)}',false); set role authenticated;`);}
async function request(n:number,subject='Acceptance test',key=randomUUID()){
 await as(n); return (await q('select * from create_appointment($1,$2,$3)',[subject,'Synthetic purpose for isolated QA',key])).rows[0];
}
async function action(a:string,kind:string,reason:string|null=null,start:string|null=null,duration:number|null=null,type:string|null=null,location:string|null=null){
 return (await q('select * from appointment_action($1,$2,$3,$4,$5,$6,$7)',[a,kind,reason,start,duration,type,location])).rows[0];
}
const future=new Date();future.setUTCDate(future.getUTCDate()+7);while(future.getUTCDay()!==1)future.setUTCDate(future.getUTCDate()+1);future.setUTCHours(5,0,0,0);
const start=future.toISOString();
before(async()=>{
 db=new PGlite({extensions:{btree_gist,pgcrypto}});
 await db.exec(`create schema auth; create schema extensions; create role anon; create role authenticated; create role service_role bypassrls;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to authenticated,anon,service_role; grant execute on function auth.uid() to authenticated;`);
 for(const name of ['202610180001_foundation.sql','202610180002_delivery.sql','202610180003_push_receipts.sql','202610220004_qa_repairs.sql','202610260005_pakistan_validation.sql']) await db.exec(readFileSync(`supabase/migrations/${name}`,'utf8'));
 for(let n=1;n<=40;n++) await q('insert into auth.users values($1,$2,$3,now())',[id(n),`qa${n}@example.com`,JSON.stringify({full_name:`QA User ${String.fromCharCode(65+n%26)}`,phone:'+923001234567'})]);
 await q("update profiles set role='Admin' where user_id=$1",[id(1)]);
});
after(async()=>{await db?.close();});

test('acceptance: all application tables enable RLS and anonymous clients cannot read appointments',async()=>{
 await root();const tables=(await q("select relname,relrowsecurity from pg_class join pg_namespace on pg_namespace.oid=relnamespace where nspname='public' and relkind='r'")).rows;
 assert.ok(tables.length>=13);assert.ok(tables.every(t=>t.relrowsecurity));
 await db.exec("select set_config('request.jwt.claim.sub','',false); set role anon");
 await assert.rejects(q('select * from appointments'),/permission denied/);
 await assert.rejects(q('select * from create_appointment($1,$2,$3)',['x','y',randomUUID()]),/permission denied/);
});
test('acceptance: user cannot invoke admin settings, availability, or deletion operations',async()=>{
 await as(2);
 await assert.rejects(q('select save_settings(30,0)'),/Administrator/);
 await assert.rejects(q('select save_availability($1,$2,$3)',['[]','[]','[]']),/Administrator/);
 await assert.rejects(q('select admin_delete_user($1,$2)',[id(3),'DELETE qa3@example.com']),/Administrator/);
});
test('acceptance: server enforces request lengths and forbids admin-created requests',async()=>{
 await as(2);
 for(const [subject,purpose] of [[' ','valid'],['x'.repeat(151),'valid'],['valid','y'.repeat(2001)]]) await assert.rejects(q('select * from create_appointment($1,$2,$3)',[subject,purpose,randomUUID()]),/check constraint/);
 await as(1);await assert.rejects(q('select * from create_appointment($1,$2,$3)',['x','y',randomUUID()]),/Only users/);
});
test('acceptance: notification actions cannot modify another recipient',async()=>{
 const a=await request(3);await root();const notice=(await q('select id from notifications where recipient_id=$1 and appointment_id=$2',[id(3),a.id])).rows[0];
 await as(2);await q('select notification_action($1,$2)',['read',notice.id]);await q('select notification_action($1,$2)',['delete',notice.id]);
 await as(3);const own=(await q('select * from notifications where id=$1',[notice.id])).rows[0];assert.equal(own.read_at,null);assert.equal(own.deleted_at,null);
});
test('acceptance: NULL deletion confirmation must not bypass typed confirmation',async()=>{
 await as(1);await assert.rejects(q('select admin_delete_user($1,$2)',[id(4),null]),/DELETE|confirmation/i);
 assert.equal((await q('select account_status from profiles where user_id=$1',[id(4)])).rows[0].account_status,'Active');
});
test('acceptance: deleting an account removes personal subject text from every delivery recipient',async()=>{
 const marker='PRIVATE_QA_SUBJECT_82713',a=await request(5,marker);
 await root();const adminJob=(await q('select id from delivery_jobs where appointment_id=$1 and recipient_id=$2 limit 1',[a.id,id(1)])).rows[0];
 await q('insert into push_receipts(ticket_id,job_id,expo_push_token) values($1,$2,$3)',['qa-deletion-receipt',adminJob.id,'ExpoPushToken[qa]']);
 await as(1);await action(a.id,'reject','Synthetic closure');await q('select save_settings(1440,0)');
 await q('select admin_delete_user($1,$2)',[id(5),'DELETE qa5@example.com']);
 await root();const leaked=(await q('select recipient_id,status,message from delivery_jobs where appointment_id=$1 and message like $2',[a.id,`%${marker}%`])).rows;
 assert.equal(leaked.length,0,'Personal subject text remains in delivery jobs addressed to another recipient after deletion');
 assert.equal((await q('select * from delivery_jobs where appointment_id=$1',[a.id])).rows.length,0);
 assert.equal((await q("select * from push_receipts where ticket_id='qa-deletion-receipt'")).rows.length,0);
});
test('acceptance: abandoned final-attempt jobs must be Failed, not permanently Pending',async()=>{
 await root();const job=(await q("insert into delivery_jobs(recipient_id,channel,title,message,idempotency_key,status,attempt_count,locked_at,scheduled_for) values($1,'email','QA','QA',$2,'Processing',8,now()-interval '11 minutes',now()-interval '1 hour') returning id",[id(1),randomUUID()])).rows[0];
 const stranded=(await q("insert into delivery_jobs(recipient_id,channel,title,message,idempotency_key,status,attempt_count,scheduled_for) values($1,'email','QA','QA',$2,'Pending',8,now()-interval '1 hour') returning id",[id(1),randomUUID()])).rows[0];
 await q('select * from claim_delivery_jobs(100)');
 assert.equal((await q('select status from delivery_jobs where id=$1',[job.id])).rows[0].status,'Failed');
 assert.equal((await q('select status from delivery_jobs where id=$1',[stranded.id])).rows[0].status,'Failed');
});
test('acceptance: NULL availability payload must be rejected without wiping working days',async()=>{
 await as(1);
 // Roll back even when the missing validation lets the call succeed.
 await db.exec('begin');
 try {await assert.rejects(q('select save_availability($1,$2,$3)',[null,'[]','[]']),/weekday|rules|required|null/i);}
 finally {await db.exec('rollback');}
});
test('acceptance: invalid availability changes are atomic and retain original rules',async()=>{
 await as(1);const before=(await q('select * from availability_rules order by weekday')).rows;
 await assert.rejects(q('select save_availability($1,$2,$3)',[JSON.stringify(Array.from({length:7},()=>({weekday:1,is_workday:true,start_local:'09:00',end_local:'17:00'}))),'[]','[]']),/duplicate/);
 assert.deepEqual((await q('select * from availability_rules order by weekday')).rows,before);
});
test('acceptance: configured maximum duration is enforced by the server',async()=>{
 const a=await request(6);await as(1);await q('select save_settings(20,365)');
 await assert.rejects(action(a.id,'approve',null,start,30,'Physical','QA office'),/duration/);
 await q('select save_settings(1440,365)');
});
test('acceptance: closing an approved appointment invalidates all queued reminders',async()=>{
 const a=await request(7);await as(1);await action(a.id,'approve',null,start,30,'Physical','QA office');
 await action(a.id,'cancel','QA cancellation');await root();
 const jobs=(await q('select * from delivery_jobs where appointment_id=$1 and schedule_version is not null',[a.id])).rows;
 assert.equal(jobs.length,6);assert.ok(jobs.every(j=>j.status==='Cancelled'));
});
test('acceptance: changing availability preserves an existing confirmed appointment',async()=>{
 const a=await request(8);await as(1);await action(a.id,'approve',null,start,30,'Physical','QA office');
 const rules=(await q('select * from availability_rules order by weekday')).rows,breaks=(await q('select * from availability_breaks')).rows;
 await q('select save_availability($1,$2,$3)',[JSON.stringify(rules.map(r=>({...r,is_workday:false}))),JSON.stringify(breaks),'[]']);
 assert.equal((await q('select status from appointments where id=$1',[a.id])).rows[0].status,'Approved');
 await q('select save_availability($1,$2,$3)',[JSON.stringify(rules),JSON.stringify(breaks),'[]']);
 await action(a.id,'cancel','QA cleanup');
});
test('acceptance: only the token owner may unregister a push device',async()=>{
 await as(9);await q('select register_device($1,$2)',['ExpoPushToken[qa-device]','Test']);
 await as(10);await q('select unregister_device($1)',['ExpoPushToken[qa-device]']);
 await as(9);assert.equal((await q('select active from device_tokens')).rows[0].active,true);
 await q('select unregister_device($1)',['ExpoPushToken[qa-device]']);assert.equal((await q('select active from device_tokens')).rows[0].active,false);
});
test('acceptance: completion succeeds after start and terminal retries are blocked',async()=>{
 const a=await request(11);await as(1);await action(a.id,'approve',null,start,30,'Physical','QA office');
 await root();await q("update appointments set scheduled_start_utc=now()-interval '2 hours',scheduled_end_utc=now()-interval '90 minutes' where id=$1",[a.id]);
 await as(1);assert.equal((await action(a.id,'complete')).status,'Completed');await assert.rejects(action(a.id,'no_show'),/already closed/);
});
test('acceptance: request-rate limit blocks the eleventh request within an hour',async()=>{
 for(let i=0;i<10;i++){const a=await request(12);await action(a.id,'cancel');}
 await assert.rejects(request(12),/Too many requests/);
});
test('acceptance: closed request keys cannot be reused to expose user history',async()=>{
 const key=randomUUID(),a=await request(13,'Retry test',key);await action(a.id,'cancel');await assert.rejects(request(13,'Retry test',key),/already processed/);
});
test('acceptance: online URL validation rejects embedded whitespace on the server',async()=>{
 const a=await request(14);await as(1);
 await assert.rejects(action(a.id,'approve',null,start,30,'Online','https://meet.example.com not-a-valid-url'),/URL/);
});
test('acceptance: client and database URL rules agree on complete URLs',async()=>{
 await root();
 const valid=['https://meet.example.com/room?code=a%20b#join','HTTP://meet.example.com:8080/room','https://192.168.1.1/room','https://xn--bcher-kva.example/'];
 const invalid=['https://meet.example.com bad','https://meet.example.com\n','javascript:alert(1)','https://-bad.example.com/','https://bad-.example.com/','https://user:pass@meet.example.com/','https://meet.example.com:65536/','https://999.2.3.4/','https://127.1/','https://01.2.3.4/','https://meet.example.com\\evil','https://localhost/'];
 for(const [expected,urls] of [[true,valid],[false,invalid]] as const)for(const url of urls){
  assert.equal(isValidMeetingUrl(url),expected,`client: ${JSON.stringify(url)}`);
  assert.equal((await q('select valid_meeting_url($1) as valid',[url])).rows[0].valid,expected,`database: ${JSON.stringify(url)}`);
 }
});
test('acceptance: non-array availability arguments cannot remove existing data',async()=>{
 await as(1);const before=(await q('select * from availability_rules order by weekday')).rows;
 for(const args of [['null','[]','[]'],['{}','[]','[]'],[JSON.stringify(before),null,'[]'],[JSON.stringify(before),'[]','{}']])await assert.rejects(q('select save_availability($1,$2,$3)',args),/arrays/);
 assert.deepEqual((await q('select * from availability_rules order by weekday')).rows,before);
});
test('acceptance: retryable expired leases recover while live leases remain protected',async()=>{
 await root();
 const old=(await q("insert into delivery_jobs(recipient_id,channel,title,message,idempotency_key,status,attempt_count,locked_at,scheduled_for) values($1,'email','QA','QA',$2,'Processing',2,now()-interval '11 minutes',now()-interval '1 hour') returning id",[id(1),randomUUID()])).rows[0];
 const live=(await q("insert into delivery_jobs(recipient_id,channel,title,message,idempotency_key,status,attempt_count,locked_at,scheduled_for) values($1,'email','QA','QA',$2,'Processing',8,now(),now()-interval '1 hour') returning id",[id(1),randomUUID()])).rows[0];
 const jobs=(await q('select * from claim_delivery_jobs(100)')).rows;
 assert.ok(jobs.some(j=>j.id===old.id&&j.attempt_count===3));
 assert.ok(!jobs.some(j=>j.id===live.id));
 assert.equal((await q('select status from delivery_jobs where id=$1',[live.id])).rows[0].status,'Processing');
});
