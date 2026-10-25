import { createClient } from 'npm:@supabase/supabase-js@2';
const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const client = createClient(url,serviceKey,{auth:{persistSession:false}});
const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const required=(key:string)=>{const value=Deno.env.get(key);if(!value)throw new Error(`${key} is not configured`);return value;};
const pushHeaders=():Record<string,string>=>Deno.env.get('EXPO_ACCESS_TOKEN')?{Authorization:`Bearer ${Deno.env.get('EXPO_ACCESS_TOKEN')}`} : {};
async function post(url:string,body:unknown,headers:Record<string,string>={}){
 const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw new Error(`Delivery provider returned HTTP ${r.status}`);return r.json();
}
async function checkPushReceipts(){
 const {data:pending,error}=await client.from('push_receipts').select('*').eq('status','Pending').lt('created_at',new Date(Date.now()-15*60000).toISOString()).order('created_at').limit(1000);
 if(error)throw error;if(!pending?.length)return;
 const result=await post('https://exp.host/--/api/v2/push/getReceipts',{ids:pending.map(r=>r.ticket_id)},pushHeaders());
 for(const row of pending){
  const receipt=result.data?.[row.ticket_id];
  if(!receipt){if(Date.parse(row.created_at)<Date.now()-86400000)await client.from('push_receipts').update({status:'Unknown',checked_at:new Date().toISOString(),last_error:'Receipt unavailable after 24 hours; delivery outcome unknown'}).eq('ticket_id',row.ticket_id);continue;}
  const errorCode=receipt.details?.error||'Push delivery failed';
  await client.from('push_receipts').update({status:receipt.status==='ok'?'Delivered':'Failed',checked_at:new Date().toISOString(),last_error:receipt.status==='ok'?null:errorCode}).eq('ticket_id',row.ticket_id);
  if(receipt.status!=='ok'){
   if(errorCode==='DeviceNotRegistered')await client.from('device_tokens').update({active:false}).eq('expo_push_token',row.expo_push_token);
   const {data:job}=await client.from('delivery_jobs').select('attempt_count,status').eq('id',row.job_id).single();
   if(job?.status==='Sent')await client.from('delivery_jobs').update({status:errorCode==='MessageRateExceeded'&&job.attempt_count<8?'Pending':'Failed',last_error:errorCode,scheduled_for:new Date(Date.now()+300000).toISOString()}).eq('id',row.job_id).eq('status','Sent');
  }
 }
}
Deno.serve(async request=>{
 if(request.method!=='POST')return respond({error:'POST required'},405);
 const secret=Deno.env.get('DELIVERY_CRON_SECRET');
 if(!secret||request.headers.get('x-cron-secret')!==secret)return respond({error:'Unauthorized'},401);
 let receiptCheckFailed=false;
 try{await checkPushReceipts();}catch{receiptCheckFailed=true;}
 const {data:jobs,error}=await client.rpc('claim_delivery_jobs',{p_limit:50});
 if(error)return respond({error:'Could not claim jobs'},500);
 const counts={sent:0,failed:0,cancelled:0};
 for(const job of jobs||[]){
  try{
   // Re-read immediately before delivery: old reminders are invalidated on every schedule change.
   const {data:live}=await client.from('delivery_jobs').select('status').eq('id',job.id).single();
   if(live?.status!=='Processing'){counts.cancelled++;continue;}
   if(job.schedule_version!==null){
    const {data:a,error}=await client.from('appointments').select('status,schedule_version,scheduled_start_utc').eq('id',job.appointment_id).single();
    if(error)throw error;
    if(!a||a.status!=='Approved'||a.schedule_version!==job.schedule_version||Date.parse(a.scheduled_start_utc)<=Date.now()){
     await client.from('delivery_jobs').update({status:'Cancelled',locked_at:null}).eq('id',job.id).eq('status','Processing');counts.cancelled++;continue;
    }
   }
   if(job.channel==='in_app'){
    const {data:sent,error}=await client.rpc('deliver_in_app_reminder',{p_job:job.id});if(error)throw error;if(sent)counts.sent++;else counts.cancelled++;continue;
   }
   const {data:p,error:profileError}=await client.from('profiles').select('user_id,account_status').eq('user_id',job.recipient_id).single();
   if(profileError)throw profileError;
   if(p.account_status==='Deleted'){await client.from('delivery_jobs').update({status:'Cancelled'}).eq('id',job.id);counts.cancelled++;continue;}
   if(job.channel==='email'){
    // Auth is authoritative for verified/current email, never user-editable profile metadata.
    const {data:auth,error}=await client.auth.admin.getUserById(job.recipient_id);if(error)throw error;
    if(!auth.user.email)throw new Error('Recipient email unavailable');
    await post('https://api.resend.com/emails',{from:required('EMAIL_FROM'),to:[auth.user.email],subject:job.title,text:`${job.message}\n\nAll appointment times are Pakistan Standard Time (UTC+05:00).\nOpen Meetly to view your current appointment.`},{Authorization:`Bearer ${required('RESEND_API_KEY')}`,'Idempotency-Key':job.idempotency_key});
   }else{
    const {data:tokens,error}=await client.from('device_tokens').select('expo_push_token').eq('user_id',job.recipient_id).eq('active',true);if(error)throw error;
    if(tokens?.length){
     const {data:prior,error:priorError}=await client.from('push_receipts').select('expo_push_token').eq('job_id',job.id).in('status',['Pending','Delivered','Unknown']);if(priorError)throw priorError;
     const remaining=tokens.filter(t=>!prior?.some(p=>p.expo_push_token===t.expo_push_token));
     for(let offset=0;offset<remaining.length;offset+=100){
     const batch=remaining.slice(offset,offset+100);
     const result=await post('https://exp.host/--/api/v2/push/send',batch.map(t=>({to:t.expo_push_token,title:job.title,body:job.message,sound:'default',data:{notificationKey:job.idempotency_key,appointmentId:job.appointment_id},channelId:'appointments'})),pushHeaders());
     const tickets=Array.isArray(result.data)?result.data:[result.data];
     let failure='';
     for(let i=0;i<batch.length;i++){
      const ticket=tickets[i];
      if(ticket?.status==='ok'&&ticket.id){const {error}=await client.from('push_receipts').upsert({ticket_id:ticket.id,job_id:job.id,expo_push_token:batch[i].expo_push_token},{onConflict:'ticket_id'});if(error)throw error;}
      else if(ticket?.details?.error==='DeviceNotRegistered')await client.from('device_tokens').update({active:false}).eq('expo_push_token',batch[i].expo_push_token);
      else failure=`Push provider rejected delivery: ${ticket?.details?.error||'Invalid ticket'}`;
     }
     if(failure)throw new Error(failure);
     }
    }
   }
   const {error:finishError}=await client.from('delivery_jobs').update({status:'Sent',sent_at:new Date().toISOString(),locked_at:null,last_error:null}).eq('id',job.id).eq('status','Processing');if(finishError)throw finishError;counts.sent++;
  }catch(error){
   counts.failed++;const delay=Math.min(3600,30*2**job.attempt_count);
   await client.from('delivery_jobs').update({status:job.attempt_count>=8?'Failed':'Pending',scheduled_for:new Date(Date.now()+delay*1000).toISOString(),locked_at:null,last_error:error instanceof Error?error.message:'Delivery failed'}).eq('id',job.id).eq('status','Processing');
  }
 }
 return respond({...counts,receiptCheckFailed});
});
