import { Appointment, AppointmentEvent, Availability, BlockedDate, Break, DeletionRequest, Notice, Profile, Schedule, addDays, canTransition, isActive, pktDate, pktToUtc, validateRequest, validateSchedule } from '@appointments/core';
import { supabase } from './supabase';
import { newId } from './id';
export type Data = { profiles: Profile[]; appointments: Appointment[]; rules: Availability[]; breaks: Break[]; blocks: BlockedDate[]; notifications: Notice[]; events: AppointmentEvent[]; deletions: DeletionRequest[]; settings: { max_duration_minutes: number; retention_days: number } };
const KEY = 'meetly-preview-v1';
const uid = newId;
const iso = (days: number, hour = '10:00') => pktToUtc(addDays(pktDate(), days), hour);
export const DEMO_ADMIN = 'preview-admin';
export const DEMO_USER = 'preview-user';
function seed(): Data {
  const names = ['Ayesha Khan','Hamza Ahmed','Fatima Ali','Omar Farooq','Sara Malik','Bilal Hassan','Zainab Iqbal','Usman Raza','Mariam Shah','Ali Siddiqui','Noor Fatima','Ahmed Qureshi'];
  const profiles: Profile[] = [{user_id:DEMO_ADMIN,full_name:'Administrator',email:'admin@example.com',phone:'+923001234567',role:'Admin',account_status:'Active',created_at:iso(-80)},...names.map((name,i): Profile => ({user_id:i===0?DEMO_USER:`person-${i}`,full_name:name,email:`${name.toLowerCase().replaceAll(' ','.')}@example.com`,phone:`+92300123${String(4560+i)}`,role:'User',account_status:'Active',created_at:iso(-30-i)}))];
  const subjects = ['Partnership discussion','Project proposal review','Career guidance session','Quarterly progress review','Research collaboration','Business consultation','Community initiative','University application advice','Product strategy discussion','Team development session','Follow-up consultation','Annual planning meeting'];
  const statuses = ['Pending','Pending','Pending','Approved','Approved','Approved','Completed','Completed','Rejected','Cancelled','No Show','Completed'] as const;
  const appointments: Appointment[] = names.map((_,i) => ({id:`appointment-${i}`,reference_number:`APT-${String(1241+i).padStart(6,'0')}`,user_id:profiles[i+1].user_id,subject:subjects[i],purpose:['I would like to discuss a potential collaboration and explore how our teams can work together. I will share an overview of the proposal and the next steps.','I would appreciate your feedback on my project proposal, including the timeline, scope, and opportunities for improvement.','I would like guidance on my next steps and an opportunity to discuss a few questions in detail.'][i%3],status:statuses[i],submitted_at:iso(-12+i,'09:15'),scheduled_start_utc:i<3?null:iso(i<6?0:-i,i===3?'10:00':i===4?'11:30':'14:00'),scheduled_end_utc:i<3?null:iso(i<6?0:-i,i===3?'10:45':i===4?'12:00':'14:30'),duration_minutes:i<3?null:i===3?45:30,meeting_type:i<3?null:i%2?'Physical':'Online',physical_address:i>=3&&i%2?'Meeting room 2, Main Office, Islamabad':null,meeting_url:i>=3&&!(i%2)?'https://meet.google.com/example-preview':null,rejection_reason:i===8?'The requested topic is outside the scope of this office.':null,cancellation_reason:i===9?'Cancelled by user':null,closed_at:i>=6?iso(-i):null,schedule_version:i<3?0:1}));
  return {profiles,appointments,rules:Array.from({length:7},(_,weekday)=>({weekday,is_workday:weekday>0&&weekday<6,start_local:'09:00',end_local:'17:00'})),breaks:[1,2,3,4,5].map(weekday=>({weekday,local_date:null,start_local:'13:00',end_local:'14:00'})),blocks:[],notifications:appointments.slice(0,3).map((a,i)=>({id:`notice-${i}`,recipient_id:DEMO_ADMIN,appointment_id:a.id,event_type:'submitted',title:'New appointment request',message:`${names[i]} submitted ${a.reference_number}: ${a.subject}.`,read_at:i===2?iso(-1):null,created_at:a.submitted_at})),events:[],deletions:[],settings:{max_duration_minutes:1440,retention_days:365}};
}
export function demoData(): Data { const raw = localStorage.getItem(KEY); if(raw) { try { return JSON.parse(raw); } catch {} } const d=seed(); localStorage.setItem(KEY,JSON.stringify(d)); return d; }
function save(d:Data) { localStorage.setItem(KEY,JSON.stringify(d)); }
export function withProfiles(d:Data): Data { return {...d,appointments:d.appointments.map(a=>({...a,profile:d.profiles.find(p=>p.user_id===a.user_id)}))}; }
export async function fetchData(): Promise<Data> {
  if(!supabase) return withProfiles(demoData());
  const names=['profiles','appointments','availability_rules','availability_breaks','blocked_dates','notifications','appointment_events','deletion_requests','system_settings'] as const;
  async function allRows(name: typeof names[number]) {
    const rows: any[]=[];
    for(let from=0;;from+=1000) { const {data,error}=await supabase!.from(name).select('*').range(from,from+999); if(error) throw error; rows.push(...(data||[])); if(!data || data.length<1000) return rows; }
  }
  const r=await Promise.all(names.map(allRows));
  return withProfiles({profiles:r[0],appointments:r[1],rules:r[2],breaks:r[3],blocks:r[4],notifications:r[5],events:r[6],deletions:r[7],settings:r[8][0] || {max_duration_minutes:1440,retention_days:365}});
}
export async function rpc(name:string,args:Record<string,unknown>) { const {data,error}=await supabase!.rpc(name,args); if(error) throw new Error(error.message); return data; }
function notice(d:Data,recipient:string,a:Appointment,title:string,message:string) { d.notifications.unshift({id:uid(),recipient_id:recipient,appointment_id:a.id,event_type:'change',title,message,read_at:null,created_at:new Date().toISOString()}); }
export async function appointmentAction(id:string,action:string,reason:string, schedule?:Schedule, actor=DEMO_ADMIN) {
  if(supabase) return rpc('appointment_action',{p_id:id,p_action:action,p_reason:reason||null,p_start:schedule?.start||null,p_duration:schedule?.duration||null,p_type:schedule?.meeting_type||null,p_location:schedule?.location||null});
  const d=demoData(),a=d.appointments.find(a=>a.id===id),p=d.profiles.find(p=>p.user_id===actor);
  if(!a || !p || p.account_status!=='Active' || (p.role==='User' && a.user_id!==actor)) throw new Error('Appointment unavailable.');
  if(!canTransition(a.status,action,p.role,a.scheduled_start_utc)) throw new Error('This action is no longer available. Refresh and try again.');
  if((action==='reject'||(action==='cancel'&&p.role==='Admin'))&&!reason.trim()) throw new Error('Please enter a reason.');
  const old={...a};
  if(action==='approve'||action==='reschedule') {
    if(!schedule) throw new Error('Complete the schedule.');
    if(schedule.duration>d.settings.max_duration_minutes) throw new Error('Duration exceeds the configured maximum.');
    a.scheduled_end_utc=validateSchedule(schedule,d.rules,d.breaks,d.blocks,d.appointments,id);
    Object.assign(a,{scheduled_start_utc:schedule.start,duration_minutes:schedule.duration,meeting_type:schedule.meeting_type,physical_address:schedule.meeting_type==='Physical'?schedule.location:null,meeting_url:schedule.meeting_type==='Online'?schedule.location:null,status:'Approved',schedule_version:(a.schedule_version||0)+1});
  } else { a.status=action==='reject'?'Rejected':action==='cancel'?'Cancelled':action==='complete'?'Completed':'No Show';a.closed_at=new Date().toISOString(); if(action==='reject') a.rejection_reason=reason; if(action==='cancel') a.cancellation_reason=reason||'Cancelled by user'; }
  d.events.unshift({id:uid(),appointment_id:id,actor_id:actor,event_type:action,old_value:old,new_value:a,occurred_at:new Date().toISOString()});
  notice(d,a.user_id,a,action==='reschedule'?'Appointment updated':`Appointment ${a.status.toLowerCase()}`,`${a.reference_number} · ${a.subject}. ${reason}`);
  if(p.role==='User') notice(d,DEMO_ADMIN,a,'User cancelled appointment',`${p.full_name} cancelled ${a.reference_number}.`);
  save(d);
}
export async function submitRequest(subject:string,purpose:string,key:string) {
  validateRequest(subject,purpose);
  if(supabase) return rpc('create_appointment',{p_subject:subject,p_purpose:purpose,p_request_key:key});
  const d=demoData();if(d.profiles.find(p=>p.user_id===DEMO_USER)?.account_status!=='Active') throw new Error('Your account is suspended.');
  if(d.appointments.some(a=>a.user_id===DEMO_USER&&isActive(a.status))) throw new Error('You already have an active appointment.');
  const n=Number(localStorage.getItem('meetly-sequence')||1252)+1;localStorage.setItem('meetly-sequence',String(n));
  const a:Appointment={id:uid(),reference_number:`APT-${String(n).padStart(6,'0')}`,user_id:DEMO_USER,subject:subject.trim(),purpose:purpose.trim(),status:'Pending',submitted_at:new Date().toISOString(),scheduled_start_utc:null,scheduled_end_utc:null,duration_minutes:null,meeting_type:null,physical_address:null,meeting_url:null,rejection_reason:null,cancellation_reason:null,closed_at:null};
  d.appointments.push(a);notice(d,DEMO_USER,a,'Request received',`${a.reference_number} is awaiting review.`);notice(d,DEMO_ADMIN,a,'New appointment request',`${a.reference_number} · ${a.subject}`);save(d);
}
export async function notificationAction(action:string,id?:string,actor=DEMO_ADMIN) {
  if(supabase) return rpc('notification_action',{p_action:action,p_id:id||null});
  const d=demoData();d.notifications=d.notifications.filter(n=>!((action==='clear'&&n.recipient_id===actor)||(action==='delete'&&n.id===id&&n.recipient_id===actor)));
  d.notifications.forEach(n=>{if(n.recipient_id===actor&&(n.id===id||action==='read_all')) n.read_at=action==='unread'?null:new Date().toISOString();});save(d);
}
export async function saveAvailability(rules:Availability[],breaks:Break[],blocks:BlockedDate[]) {
  if(rules.some(r=>r.start_local>=r.end_local)||breaks.some(b=>b.start_local>=b.end_local)) throw new Error('Start time must be earlier than end time.');
  if(new Set(blocks.map(b=>b.local_date)).size!==blocks.length) throw new Error('Each blocked date may only be added once.');
  if(supabase) return rpc('save_availability',{p_rules:rules,p_breaks:breaks,p_blocks:blocks});
  const d=demoData();Object.assign(d,{rules,breaks,blocks});save(d);
}
export async function userAction(id:string,status:string,confirmation='') {
  if(supabase) return status==='Deleted'?rpc('admin_delete_user',{p_user:id,p_confirmation:confirmation}):rpc('admin_user_status',{p_user:id,p_status:status});
  const d=demoData(),p=d.profiles.find(p=>p.user_id===id);if(!p||p.role==='Admin') throw new Error('User not found.');
  if(status==='Deleted') {
    if(confirmation!==`DELETE ${p.email}`) throw new Error('Confirmation does not match.');
    if(d.appointments.some(a=>a.user_id===id&&isActive(a.status))) throw new Error('Resolve active appointments before deleting this account.');
    if(d.appointments.some(a=>a.user_id===id&&a.closed_at&&Date.parse(a.closed_at)>Date.now()-d.settings.retention_days*86400000)) throw new Error('The configured retention period has not elapsed.');
    p.full_name='Deleted user';p.email='deleted@deleted.invalid';p.phone='';d.appointments.forEach(a=>{if(a.user_id===id){a.subject='Deleted account appointment';a.purpose='Removed on account deletion';}});
  }
  p.account_status=status as Profile['account_status'];save(d);
}
export async function saveProfile(name:string,phone:string,actor=DEMO_ADMIN) { if(supabase)return rpc('update_profile',{p_name:name,p_phone:phone});const d=demoData();const p=d.profiles.find(p=>p.user_id===actor);if(p){p.full_name=name;p.phone=phone;}save(d); }
export async function requestDeletion(reason:string) {if(supabase)return rpc('request_deletion',{p_reason:reason});const d=demoData();if(!d.deletions.some(r=>r.user_id===DEMO_USER&&r.status==='Pending'))d.deletions.push({id:uid(),user_id:DEMO_USER,email:d.profiles.find(p=>p.user_id===DEMO_USER)!.email,reason,status:'Pending',created_at:new Date().toISOString()});save(d);}
export async function saveSettings(duration:number,retention:number) {if(supabase)return rpc('save_settings',{p_duration:duration,p_retention:retention});if(duration<1||duration>1440||retention<0)throw new Error('Invalid settings.');const d=demoData();d.settings={max_duration_minutes:duration,retention_days:retention};save(d);}
