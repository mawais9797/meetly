import type { SupabaseClient } from '@supabase/supabase-js';
import type { Data } from './data';

// Row-level security remains authoritative. Scope reads to the signed-in account too,
// and never request administrator-only tables for an ordinary user.
export async function loadWorkspaceData(client: SupabaseClient, userId: string): Promise<Data> {
 const empty:Data={profiles:[],appointments:[],rules:[],breaks:[],blocks:[],notifications:[],events:[],deletions:[],settings:{max_duration_minutes:1440,retention_days:365}};
 const {data:profile,error}=await client.from('profiles').select('*').eq('user_id',userId).maybeSingle();
 if(error)throw new Error(error.message);
 if(!profile)return empty;
 if(profile.account_status!=='Active')return {...empty,profiles:[profile]};
 async function rows(table:string,ownerColumn?:string){
  const out:any[]=[];
  for(let offset=0;;offset+=1000){
   let query=client.from(table).select('*').order(table==='profiles'?'user_id':table==='availability_rules'?'weekday':'id');
   if(ownerColumn)query=query.eq(ownerColumn,userId);
   const {data,error}=await query.range(offset,offset+999);
   if(error)throw new Error(error.message);
   out.push(...(data||[]));if(!data||data.length<1000)return out;
  }
 }
 let result:Data;
 if(profile.role==='Admin'){
  const [profiles,appointments,rules,breaks,blocks,notifications,events,deletions,settings]=await Promise.all(
   ['profiles','appointments','availability_rules','availability_breaks','blocked_dates','notifications','appointment_events','deletion_requests','system_settings'].map(table=>rows(table,table==='notifications'?'recipient_id':undefined)));
  result={profiles,appointments,rules,breaks,blocks,notifications,events,deletions,settings:settings[0]||empty.settings};
 }else{
  const [appointments,notifications]=await Promise.all([rows('appointments','user_id'),rows('notifications','recipient_id')]);
  result={...empty,profiles:[profile],appointments,notifications};
 }
 return {...result,appointments:result.appointments.map(a=>({...a,profile:result.profiles.find(p=>p.user_id===a.user_id)}))};
}
